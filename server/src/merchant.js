// Merchant app endpoints: shop sign-up and settings, listings (photos, prices, stock), orders to
// prepare for rider pickup, and sales. Merchants sign in with the same SMS codes as customers.
//
// Every query here is scoped to the caller's own merchant (my_merchant_id(), which reads auth.uid()),
// so it stays private even on hosts where row level security roles are unavailable (see db.js).
import { asUser, pool } from './db.js';
import { HttpError, str, UUID } from './http.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_PATH = /^\/images\/([0-9a-f-]{36})$/i;
const ORDER_ACTIONS = { accept: 'preparing', ready: 'ready', decline: 'declined' };

const PRODUCT_COLS = `id, name, category_id as category, price, unit, weight_kg as "weightKg", longest_side_cm as "longestSideCm",
  emoji, image_url as "imageUrl", description, stock, active, updated_at as "updatedAt"`;

const toProduct = (p) => p && { ...p, updatedAt: new Date(p.updatedAt).getTime() };

/** Which image type the bytes are, from their first bytes (never trust the client's word). */
function sniffImage(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

const int = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);

/**
 * Checks listing fields. With partial = true only the fields present are checked (for edits).
 * Returns { column: value } for the database.
 */
function productInput(b, partial) {
  const out = {};
  const has = (k) => b[k] !== undefined;
  const need = (k) => !partial || has(k);
  if (need('name')) {
    const name = str(b.name, 80);
    if (name.length < 2) throw new HttpError(400, 'Enter the product name');
    out.name = name;
  }
  if (need('category')) {
    const c = str(b.category, 40);
    if (!c) throw new HttpError(400, 'Choose a category');
    out.category_id = c;
  }
  if (need('price')) {
    const price = int(b.price);
    if (!Number.isInteger(price) || price < 1 || price > 50_000_000) throw new HttpError(400, 'Enter a price in Naira (whole number)');
    out.price = price;
  }
  if (has('unit') || !partial) out.unit = str(b.unit, 40);
  if (has('description') || !partial) out.description = str(b.description, 1000);
  if (has('emoji') || !partial) out.emoji = str(b.emoji, 8) || '📦';
  if (need('weightKg')) {
    const w = int(b.weightKg ?? 1);
    if (!Number.isFinite(w) || w <= 0 || w > 200) throw new HttpError(400, 'Enter the weight in kg (up to 200)');
    out.weight_kg = Math.round(w * 100) / 100;
  }
  if (has('longestSideCm') || !partial) {
    const v = b.longestSideCm;
    if (v === null || v === undefined || v === '') out.longest_side_cm = null;
    else {
      const n = int(v);
      if (!Number.isInteger(n) || n < 1 || n > 400) throw new HttpError(400, 'Enter the longest side in whole cm');
      out.longest_side_cm = n;
    }
  }
  if (has('stock') || !partial) {
    const v = b.stock;
    if (v === null || v === undefined || v === '') out.stock = null; // not tracked
    else {
      const n = int(v);
      if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new HttpError(400, 'Stock must be a whole number');
      out.stock = n;
    }
  }
  if (has('active') || !partial) out.active = b.active === undefined ? true : b.active === true;
  if (has('imageUrl') || !partial) {
    const u = b.imageUrl;
    if (u === null || u === undefined || u === '') out.image_url = null;
    else if (typeof u === 'string' && IMAGE_PATH.test(u)) out.image_url = u;
    else throw new HttpError(400, 'Upload the photo first');
  }
  return out;
}

export async function merchantRoutes(app, { auth }) {
  const asMerchant = (req, fn) =>
    asUser(req.uid, async (db) => {
      const { rows } = await db.query('select my_merchant_id() as id');
      if (!rows[0].id) throw new HttpError(403, 'Set up your shop first');
      return fn(db, rows[0].id);
    });

  // Photo must be one this merchant uploaded.
  async function checkImage(db, mid, url) {
    if (!url) return;
    const id = url.match(IMAGE_PATH)[1];
    const { rows } = await db.query('select 1 from product_images where id = $1 and merchant_id = $2', [id, mid]);
    if (!rows[0]) throw new HttpError(400, 'Upload the photo first');
  }

  // ───────── Shop ─────────
  app.get('/merchant/areas', async () =>
    (await pool.query('select id, name, distance_km as "distanceKm" from merchant_areas order by sort')).rows);

  // Shop details, or { merchant: null } if this person hasn't set up a shop yet.
  app.get('/merchant/me', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => {
      const p = await db.query('select phone, full_name from profiles where id = auth.uid()');
      const m = await db.query('select my_merchant() as m');
      return { owner: { phone: p.rows[0]?.phone ?? '', name: p.rows[0]?.full_name ?? '' }, merchant: m.rows[0].m };
    }));

  app.post('/merchant/register', { preHandler: auth }, async (req) => {
    const b = req.body ?? {};
    const owner = str(b.ownerName, 80);
    if (owner.length < 2) throw new HttpError(400, 'Enter your name');
    return asUser(req.uid, async (db) => {
      await db.query('update profiles set full_name = $1 where id = auth.uid()', [owner]);
      const r = await db.query('select register_merchant($1::jsonb) as m', [JSON.stringify({
        name: str(b.name, 80), phone: str(b.phone, 20), address: str(b.address, 200), areaId: str(b.areaId, 40),
        categories: Array.isArray(b.categories) ? b.categories.slice(0, 20).map((c) => str(c, 40)) : [],
        bankName: str(b.bankName, 60), accountNumber: str(b.accountNumber, 20), accountName: str(b.accountName, 80),
      })]);
      return r.rows[0].m;
    });
  });

  app.put('/merchant/me', { preHandler: auth }, async (req) => {
    const b = req.body ?? {};
    const p = {};
    for (const [k, max] of [['name', 80], ['phone', 20], ['address', 200], ['areaId', 40], ['bankName', 60], ['accountNumber', 20], ['accountName', 80]]) {
      if (b[k] !== undefined) p[k] = str(b[k], max);
    }
    if (typeof b.isOpen === 'boolean') p.isOpen = b.isOpen;
    if (Array.isArray(b.categories)) p.categories = b.categories.slice(0, 20).map((c) => str(c, 40));
    return asUser(req.uid, async (db) => (await db.query('select update_my_merchant($1::jsonb) as m', [JSON.stringify(p)])).rows[0].m);
  });

  // ───────── Listings ─────────
  app.get('/merchant/products', { preHandler: auth }, async (req) =>
    asMerchant(req, async (db, mid) =>
      (await db.query(`select ${PRODUCT_COLS} from products where merchant_id = $1 order by active desc, updated_at desc`, [mid])).rows.map(toProduct)));

  app.post('/merchant/products', { preHandler: auth }, async (req) => {
    const v = productInput(req.body ?? {}, false);
    return asMerchant(req, async (db, mid) => {
      await checkImage(db, mid, v.image_url);
      const cols = Object.keys(v);
      const r = await db.query(
        `insert into products (merchant_id, ${cols.join(', ')}) values ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) returning ${PRODUCT_COLS}`,
        [mid, ...Object.values(v)]);
      return toProduct(r.rows[0]);
    });
  });

  // Partial update: send only what changed (e.g. { stock: 12 } or { active: false }).
  app.put('/merchant/products/:id', { preHandler: auth }, async (req) => {
    const v = productInput(req.body ?? {}, true);
    const id = str(req.params.id, 40);
    return asMerchant(req, async (db, mid) => {
      if (v.image_url) await checkImage(db, mid, v.image_url);
      const cols = Object.keys(v);
      const sets = [...cols.map((c, i) => `${c} = $${i + 3}`), 'updated_at = now()'].join(', ');
      const r = await db.query(
        `update products set ${sets} where id = $1 and merchant_id = $2 returning ${PRODUCT_COLS}`, [id, mid, ...Object.values(v)]);
      if (!r.rows[0]) throw new HttpError(404, 'Product not found');
      return toProduct(r.rows[0]);
    });
  });

  // Photos: JSON { data: base64 } of a JPEG, PNG or WebP up to 2 MB (the app shrinks photos before sending).
  app.post('/merchant/images', { preHandler: auth, bodyLimit: 3 * 1024 * 1024, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const data = typeof req.body?.data === 'string' ? req.body.data.replace(/^data:[^,]*,/, '') : '';
    const buf = Buffer.from(data, 'base64');
    if (!buf.length) throw new HttpError(400, 'No photo received');
    if (buf.length > MAX_IMAGE_BYTES) throw new HttpError(400, 'That photo is too large (2 MB at most)');
    const type = sniffImage(buf);
    if (!type) throw new HttpError(400, 'Use a JPEG, PNG or WebP photo');
    return asMerchant(req, async (db, mid) => {
      const r = await db.query('insert into product_images (merchant_id, content_type, data) values ($1, $2, $3) returning id', [mid, type, buf]);
      return { url: `/images/${r.rows[0].id}` };
    });
  });

  app.get('/images/:id', async (req, reply) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'Not found');
    const { rows } = await pool.query('select content_type, data from product_images where id = $1', [req.params.id]);
    if (!rows[0]) throw new HttpError(404, 'Not found');
    reply.header('content-type', rows[0].content_type).header('cache-control', 'public, max-age=31536000, immutable');
    return reply.send(rows[0].data);
  });

  // ───────── Orders ─────────
  const toOrder = (o) => ({
    ...o,
    createdAt: new Date(o.createdAt).getTime(),
    updatedAt: new Date(o.updatedAt).getTime(),
    readyAt: o.readyAt ? new Date(o.readyAt).getTime() : null,
  });

  // ?active=true: orders still to prepare or waiting for the rider (the app polls this).
  app.get('/merchant/orders', { preHandler: auth }, async (req) =>
    asMerchant(req, async (db) =>
      (await db.query('select merchant_orders($1) as o', [req.query?.active === 'true'])).rows[0].o.map(toOrder)));

  const one = async (db, id) => {
    const o = (await db.query('select merchant_orders(false, $1) as o', [id])).rows[0].o[0];
    if (!o) throw new HttpError(404, 'Order not found');
    return toOrder(o);
  };

  app.get('/merchant/orders/:id', { preHandler: auth }, async (req) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'Order not found');
    return asMerchant(req, (db) => one(db, req.params.id));
  });

  // :action is accept (start preparing), ready (for rider pickup) or decline (with { reason }).
  app.post('/merchant/orders/:id/:action', { preHandler: auth }, async (req) => {
    const status = ORDER_ACTIONS[req.params.action];
    if (!UUID.test(req.params.id) || !status) throw new HttpError(404, 'Not found');
    return asMerchant(req, async (db) => {
      await db.query('select merchant_set_order_status($1, $2, $3)', [req.params.id, status, str(req.body?.reason, 200) || null]);
      return one(db, req.params.id);
    });
  });

  // ───────── Sales ─────────
  app.get('/merchant/sales', { preHandler: auth }, async (req) => {
    const days = Math.min(Math.max(parseInt(req.query?.days, 10) || 7, 1), 90);
    return asMerchant(req, async (db) => (await db.query('select merchant_sales($1) as s', [days])).rows[0].s);
  });

  // ───────── Arodan staff: approve merchants ─────────
  app.get('/admin/merchants', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => (await db.query('select admin_merchants($1) as m', [str(req.query?.status, 20)])).rows[0].m));

  app.post('/admin/merchants/:id/status', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) =>
      (await db.query('select admin_set_merchant_status($1, $2) as m', [str(req.params.id, 40), str(req.body?.status, 20)])).rows[0].m));
}
