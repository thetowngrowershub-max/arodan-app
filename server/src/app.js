import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { createHash, randomInt } from 'node:crypto';
import { config } from './config.js';
import { asUser, pool } from './db.js';
import { signToken, verifyToken } from './token.js';
import { messageCentralCheck, messageCentralEnabled, messageCentralSend, sendTermii } from './sms.js';
import { getOrder, listOrders } from './orders.js';
import { HttpError, str, UUID } from './http.js';
import { merchantRoutes } from './merchant.js';
import { registerRiderRoutes } from './rider.js';
import { pushRoutes } from './push.js';
import { payoutRoutes } from './payouts.js';
import { startWorkers } from './workers.js';


/** "0803 123 4567", "+234 803…", "803…" → "2348031234567". Null if not a Nigerian mobile number. */
export function normalizePhone(input) {
  let d = String(input ?? '').replace(/\D/g, '');
  if (d.startsWith('234')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  return /^[789][01]\d{8}$/.test(d) ? '234' + d : null;
}

const hashCode = (phone, code) => createHash('sha256').update(`${phone}:${code}:${config.jwtSecret}`).digest('hex');

// Database errors raised on purpose by our SQL functions ("raise exception") become 400s with their message.
function dbError(e) {
  if (e?.code === 'P0001') return new HttpError(400, e.message);
  if (e?.code === '42501') return new HttpError(403, 'Not allowed');
  if (e?.code === '22P02' || e?.code === '23503' || e?.code === '23514') return new HttpError(400, 'Invalid input');
  return e;
}

function toAddress(a) {
  return a && {
    id: a.id, label: a.label, estate: a.estate, street: a.street, houseNo: a.house_no, landmark: a.landmark,
    gateName: a.gate_name, gateCode: a.gate_code, gateNote: a.gate_note,
  };
}


export async function buildApp(opts = {}) {
  const app = Fastify({ logger: opts.logger ?? true, trustProxy: true, bodyLimit: 64 * 1024 });
  await app.register(cors, { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(','), methods: ['GET', 'POST', 'PUT', 'OPTIONS'] });
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((err, req, reply) => {
    const e = dbError(err);
    const status = e.statusCode ?? 500;
    if (status >= 500) req.log.error(err);
    reply.status(status).send({ error: status >= 500 ? 'Something went wrong' : e.message });
  });

  // Signed-in user id for routes that need it.
  const auth = async (req) => {
    const h = req.headers.authorization ?? '';
    const uid = verifyToken(h.startsWith('Bearer ') ? h.slice(7) : '');
    if (!uid) throw new HttpError(401, 'Please sign in again');
    req.uid = uid;
  };

  app.get('/health', async () => {
    await pool.query('select 1');
    return { ok: true };
  });

  // ───────── Sign-in ─────────
  // Per-IP limits are loose because many Nigerian mobile users share an IP; the per-phone limit is in the handler.
  app.post('/auth/otp', { config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req) => {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) throw new HttpError(400, 'Enter a valid Nigerian mobile number');
    const { rows } = await pool.query(
      "select count(*)::int as n from auth.otp_codes where phone = $1 and created_at > now() - interval '1 hour'", [phone]);
    if (rows[0].n >= config.otpMaxPerHour) throw new HttpError(429, 'Too many codes requested. Try again in an hour.');

    const test = config.testPhones[phone];
    if (!test && messageCentralEnabled()) {
      const ref = await messageCentralSend(phone, req.log);
      await pool.query(
        `insert into auth.otp_codes (phone, provider, provider_ref, expires_at) values ($1, 'messagecentral', $2, now() + make_interval(mins => $3))`,
        [phone, ref, config.otpTtlMin]);
    } else {
      const code = test ?? String(randomInt(0, 10 ** config.otpLength)).padStart(config.otpLength, '0');
      await pool.query(
        `insert into auth.otp_codes (phone, code_hash, expires_at) values ($1, $2, now() + make_interval(mins => $3))`,
        [phone, hashCode(phone, code), config.otpTtlMin]);
      if (!test) await sendTermii(phone, `Your Arodan code is ${code}. It expires in ${config.otpTtlMin} minutes. Do not share it.`, req.log);
    }
    return { ok: true, otpLength: config.otpLength };
  });

  app.post('/auth/verify', { config: { rateLimit: { max: 60, timeWindow: '10 minutes' } } }, async (req) => {
    const phone = normalizePhone(req.body?.phone);
    const code = str(req.body?.code, 12);
    if (!phone || !code) throw new HttpError(400, 'Phone and code are required');
    const client = await pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(
        `select id, code_hash, attempts, provider, provider_ref from auth.otp_codes
         where phone = $1 and used_at is null and expires_at > now() order by created_at desc limit 1 for update`, [phone]);
      const otp = rows[0];
      if (!otp || otp.attempts >= 5) {
        await client.query('commit');
        throw new HttpError(400, 'That code has expired. Ask for a new one.');
      }
      const result = otp.provider === 'messagecentral'
        ? await messageCentralCheck(otp.provider_ref, code, req.log)
        : otp.code_hash === hashCode(phone, code) ? 'ok' : 'wrong';
      if (result === 'expired') {
        await client.query('update auth.otp_codes set used_at = now() where id = $1', [otp.id]);
        await client.query('commit');
        throw new HttpError(400, 'That code has expired. Ask for a new one.');
      }
      if (result !== 'ok') {
        await client.query('update auth.otp_codes set attempts = attempts + 1 where id = $1', [otp.id]);
        await client.query('commit');
        throw new HttpError(400, 'That code is not right. Try again.');
      }
      await client.query('update auth.otp_codes set used_at = now() where id = $1', [otp.id]);
      const u = await client.query(
        `insert into auth.users (phone, last_sign_in_at) values ($1, now())
         on conflict (phone) do update set last_sign_in_at = now() returning id`, [phone]);
      await client.query('commit');
      return { token: signToken(u.rows[0].id), userId: u.rows[0].id };
    } catch (e) {
      await client.query('rollback').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  });

  // ───────── Profile & address ─────────
  app.get('/me', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => {
      const p = await db.query('select phone, full_name, role from profiles where id = auth.uid()');
      const a = await db.query('select * from addresses where user_id = auth.uid() order by is_default desc, created_at desc limit 1');
      const roles = await db.query('select my_roles() as r');
      const prof = p.rows[0];
      return {
        user: prof ? { phone: prof.phone, name: prof.full_name ?? '', role: prof.role } : null,
        address: toAddress(a.rows[0]) ?? null,
        // Riding and selling: none | pending | approved | paused (the app opens those parts only when approved).
        roles: roles.rows[0].r,
      };
    }));

  app.put('/me', { preHandler: auth }, async (req) => {
    const name = str(req.body?.name, 80);
    if (name.length < 2) throw new HttpError(400, 'Enter your name');
    await asUser(req.uid, (db) => db.query('update profiles set full_name = $1 where id = auth.uid()', [name]));
    return { ok: true };
  });

  app.put('/me/address', { preHandler: auth }, async (req) => {
    const b = req.body ?? {};
    const v = [str(b.label, 40) || 'Home', str(b.estate, 80), str(b.street, 120), str(b.houseNo, 20), str(b.landmark),
      str(b.gateName, 80), str(b.gateCode, 20), str(b.gateNote, 300)];
    if (!v[1] || !v[2] || !v[3]) throw new HttpError(400, 'Estate, street and house number are required');
    return asUser(req.uid, async (db) => {
      const cols = 'label, estate, street, house_no, landmark, gate_name, gate_code, gate_note';
      const r = b.id && UUID.test(b.id)
        ? await db.query(`update addresses set (${cols}) = ($1,$2,$3,$4,$5,$6,$7,$8) where id = $9 and user_id = auth.uid() returning *`, [...v, b.id])
        : { rows: [] };
      if (r.rows[0]) return toAddress(r.rows[0]);
      const ins = await db.query(
        `insert into addresses (user_id, ${cols}) values (auth.uid(), $1,$2,$3,$4,$5,$6,$7,$8) returning *`, v);
      return toAddress(ins.rows[0]);
    });
  });

  // ───────── Catalogue & pricing ─────────
  // Every listing from merchants who are approved and open, as merchants add them in the merchant app.
  // Sold-out listings are left out.
  app.get('/catalog', async () =>
    asUser(null, async (db) => {
      const [c, m, p, s, cfg] = await Promise.all([
        db.query('select id, name, emoji from categories order by sort'),
        db.query(`select id, name, area, distance_km as "distanceKm", duration_min as "durationMin" from merchants where active and status = 'live' and is_open`),
        db.query(`select id, name, category_id as category, price, unit, weight_kg as "weightKg", longest_side_cm as "longestSideCm",
                         emoji, image_url as "imageUrl", merchant_id as "merchantId", rating, popular, description, stock
                  from products where active and merchant_selling(merchant_id) and (stock is null or stock > 0)
                  order by popular desc, created_at desc, name`),
        db.query('select id, name, distance_km as "distanceKm", duration_min as "durationMin" from errand_spots order by sort'),
        db.query('select config, demo_mode as "demoMode" from pricing_config where id = 1'),
      ]);
      return {
        categories: c.rows,
        merchants: m.rows,
        products: p.rows.map((x) => ({ ...x, longestSideCm: x.longestSideCm ?? undefined, imageUrl: x.imageUrl ?? undefined, stock: x.stock ?? undefined })),
        spots: s.rows,
        pricing: cfg.rows[0]?.config,
        demoMode: cfg.rows[0]?.demoMode ?? false,
      };
    }));

  const orderInput = (b) => ({
    items: Array.isArray(b?.items) ? b.items.slice(0, 100).map((i) => ({ product_id: str(i?.productId, 40), qty: Number(i?.qty) })) : [],
    errands: Array.isArray(b?.errands) ? b.errands.slice(0, 10).map((e) => ({
      type: str(e?.type, 20), title: str(e?.title), details: str(e?.details, 1000), spot_id: str(e?.pickupSpotId, 40),
      est_min: Number(e?.estMin), budget: Number(e?.budget ?? 0),
    })) : [],
  });

  app.post('/quote', async (req) => {
    const { items, errands } = orderInput(req.body);
    return asUser(null, async (db) =>
      (await db.query('select price_order($1::jsonb, $2::jsonb) as b', [JSON.stringify(items), JSON.stringify(errands)])).rows[0].b);
  });

  // ───────── Orders ─────────
  app.post('/orders', { preHandler: auth }, async (req) => {
    const { items, errands } = orderInput(req.body);
    const addressId = str(req.body?.addressId, 40);
    const payment = str(req.body?.payment, 10);
    if (!UUID.test(addressId)) throw new HttpError(400, 'Choose a delivery address');
    if (!['card', 'transfer', 'pod'].includes(payment)) throw new HttpError(400, 'Choose a payment method');
    return asUser(req.uid, async (db) => {
      const r = await db.query('select (place_order($1, $2::jsonb, $3::jsonb, $4)).id', [addressId, JSON.stringify(items), JSON.stringify(errands), payment]);
      return getOrder(db, r.rows[0].id);
    });
  });

  // ?active=true returns only orders still in progress (the app polls this for live tracking).
  app.get('/orders', { preHandler: auth }, async (req) =>
    asUser(req.uid, (db) => listOrders(db, { activeOnly: req.query?.active === 'true' })));

  const orderId = (req) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'Order not found');
    return req.params.id;
  };

  app.get('/orders/:id', { preHandler: auth }, async (req) => {
    const o = await asUser(req.uid, (db) => getOrder(db, orderId(req)));
    if (!o) throw new HttpError(404, 'Order not found');
    return o;
  });

  app.post('/orders/:id/cancel', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => {
      await db.query("select set_order_status($1, 'cancelled')", [orderId(req)]);
      return getOrder(db, req.params.id);
    }));

  // Riders (and admins) move an order forward. Used by the rider app.
  app.post('/orders/:id/status', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => {
      await db.query('select set_order_status($1, $2)', [orderId(req), str(req.body?.status, 20)]);
      return getOrder(db, req.params.id);
    }));

  // Testing aid; only works while pricing_config.demo_mode is on.
  app.post('/orders/:id/demo-advance', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => {
      await db.query('select demo_advance_order($1)', [orderId(req)]);
      return getOrder(db, req.params.id);
    }));

  await merchantRoutes(app, { auth });
  registerRiderRoutes(app, { auth, HttpError });
  pushRoutes(app, { auth });
  payoutRoutes(app, { auth });

  if (opts.workers) startWorkers(app);

  return app;
}
