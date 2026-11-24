// Merchant API checks: shop sign-up, listings with photos and stock, preparing orders for pickup,
// sales, and that merchants never see each other's data or customers' addresses.
// Run like api.test.js, against a THROWAWAY migrated and seeded database (with demo_mode on, as seeded).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const A = '2348061110001'; // merchant A
const B = '2348061110002'; // merchant B
const C = '2348061110003'; // customer
process.env.TEST_OTP_PHONES = `${A}:111111,${B}:222222,${C}:333333`;
process.env.TERMII_API_KEY = '';
const { buildApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const phones = `('${A}', '${B}', '${C}')`;

let app;
before(async () => {
  app = await buildApp({ logger: false });
  await pool.query(`delete from orders where customer_id in (select id from auth.users where phone in ${phones})`);
  await pool.query(`delete from products where merchant_id in (select m.id from merchants m join auth.users u on u.id = m.owner_id where u.phone in ${phones})`);
  await pool.query(`delete from merchants where owner_id in (select id from auth.users where phone in ${phones})`);
  await pool.query(`delete from auth.users where phone in ${phones}`);
  await pool.query(`delete from auth.otp_codes where phone in ${phones}`);
});
after(async () => {
  await app.close();
  await pool.end();
});

const call = async (method, url, body, token) => {
  const r = await app.inject({ method, url, payload: body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  let json;
  try { json = r.json(); } catch { json = null; }
  return { status: r.statusCode, body: json, raw: r };
};

async function signIn(phone, code) {
  assert.equal((await call('POST', '/auth/otp', { phone })).status, 200);
  const r = await call('POST', '/auth/verify', { phone, code });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

const shop = (name) => ({ ownerName: 'Bisi Ade', name, phone: '0803 555 1234', address: '12 Ikosi Road', areaId: 'magodo2', categories: ['groceries', 'nope'], bankName: 'GTBank', accountNumber: '0123-456-789', accountName: 'Bisi Ade' });

test('merchant journey: sign up, list, sell, prepare, hand over, sales', async () => {
  const a = await signIn(A, '111111');
  assert.equal((await call('GET', '/merchant/me', null, a)).body.merchant, null);
  assert.equal((await call('GET', '/merchant/products', null, a)).status, 403);

  // Sign-up
  assert.equal((await call('POST', '/merchant/register', { ...shop('Bisi Stores'), areaId: 'mars' }, a)).status, 400);
  const reg = await call('POST', '/merchant/register', shop('Bisi Stores'), a);
  assert.equal(reg.status, 200, JSON.stringify(reg.body));
  assert.equal(reg.body.status, 'live'); // demo_mode on: no approval wait
  assert.deepEqual(reg.body.categories, ['groceries']);
  assert.equal(reg.body.accountNumber, '0123456789');
  assert.equal(reg.body.area, 'Magodo Phase 2');
  assert.equal((await call('POST', '/merchant/register', shop('Again'), a)).status, 400);
  const me = await call('GET', '/merchant/me', null, a);
  assert.equal(me.body.owner.name, 'Bisi Ade');
  assert.equal(me.body.merchant.name, 'Bisi Stores');

  // Photo
  assert.equal((await call('POST', '/merchant/images', { data: Buffer.from('not an image').toString('base64') }, a)).status, 400);
  const img = await call('POST', '/merchant/images', { data: `data:image/png;base64,${PNG}` }, a);
  assert.equal(img.status, 200, JSON.stringify(img.body));
  const got = await call('GET', img.body.url);
  assert.equal(got.status, 200);
  assert.equal(got.raw.headers['content-type'], 'image/png');

  // Listings
  const listing = { name: 'Garri (white)', category: 'groceries', price: 4500, unit: '4 kg bag', weightKg: 4, stock: 3, imageUrl: img.body.url };
  assert.equal((await call('POST', '/merchant/products', { ...listing, price: -5 }, a)).status, 400);
  assert.equal((await call('POST', '/merchant/products', { ...listing, category: 'cars' }, a)).status, 400);
  assert.equal((await call('POST', '/merchant/products', { ...listing, imageUrl: '/images/00000000-0000-4000-8000-000000000000' }, a)).status, 400);
  assert.equal((await call('POST', '/merchant/products', { ...listing, imageUrl: 'https://evil.example/x.png' }, a)).status, 400);
  const created = await call('POST', '/merchant/products', listing, a);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const pid = created.body.id;
  assert.equal(created.body.stock, 3);
  assert.equal(created.body.emoji, '📦');

  let cat = await call('GET', '/catalog');
  let item = cat.body.products.find((p) => p.id === pid);
  assert.ok(item, 'new listing is in the customer catalogue');
  assert.equal(item.imageUrl, img.body.url);
  assert.equal(item.stock, 3);
  assert.ok(cat.body.merchants.find((m) => m.id === reg.body.id));
  assert.equal(JSON.stringify(cat.body).includes('0123456789'), false, 'no bank details in catalogue');

  // Another merchant can't see or change it
  const b = await signIn(B, '222222');
  assert.equal((await call('POST', '/merchant/register', shop('Other Shop'), b)).status, 200);
  assert.equal((await call('PUT', `/merchant/products/${pid}`, { price: 1 }, b)).status, 404);
  assert.equal((await call('GET', '/merchant/products', null, b)).body.length, 0);
  assert.equal((await call('POST', '/merchant/products', { ...listing }, b)).status, 400, "can't use A's photo");

  // Customer orders 2 of A's listing plus a starter-catalogue item
  const c = await signIn(C, '333333');
  await call('PUT', '/me', { name: 'Ngozi Okafor' }, c);
  const addr = await call('PUT', '/me/address', { estate: 'Magodo Phase 2', street: 'Kola Amodu St', houseNo: '7', gateCode: '9911' }, c);
  assert.equal((await call('POST', '/orders', { addressId: addr.body.id, items: [{ productId: pid, qty: 4 }], errands: [], payment: 'card' }, c)).status, 400);
  const order = await call('POST', '/orders', { addressId: addr.body.id, items: [{ productId: pid, qty: 2 }, { productId: 'p1', qty: 1 }], errands: [], payment: 'pod' }, c);
  assert.equal(order.status, 200, JSON.stringify(order.body));
  const oid = order.body.id;

  // A sees only their own part, and nothing about the customer's address
  let mine = await call('GET', '/merchant/orders?active=true', null, a);
  assert.equal(mine.body.length, 1);
  const mo = mine.body[0];
  assert.equal(mo.status, 'new');
  assert.equal(mo.customerName, 'Ngozi');
  assert.equal(mo.itemsTotal, 9000);
  assert.deepEqual(mo.items.map((i) => [i.productId, i.qty]), [[pid, 2]]);
  assert.equal(JSON.stringify(mo).includes('9911'), false, 'gate code hidden from merchant');
  assert.equal(JSON.stringify(mo).includes('Kola Amodu'), false, 'address hidden from merchant');
  assert.equal((await call('GET', '/merchant/orders', null, b)).body.length, 0);
  assert.equal((await call('POST', `/merchant/orders/${oid}/accept`, {}, b)).status, 400);
  assert.equal((await call('GET', '/merchant/products', null, a)).body.find((p) => p.id === pid).stock, 1);

  // The rider can't collect before the shop is ready
  assert.equal((await call('POST', `/orders/${oid}/demo-advance`, {}, c)).body.status, 'assigned');
  const early = await call('POST', `/orders/${oid}/demo-advance`, {}, c);
  assert.equal(early.status, 400);
  assert.match(early.body.error, /shop/);

  assert.equal((await call('POST', `/merchant/orders/${oid}/ready`, {}, a)).body.status, 'ready');
  assert.equal((await call('POST', `/merchant/orders/${oid}/accept`, {}, a)).status, 400, 'no going backwards');
  const assigned = await call('GET', `/merchant/orders/${oid}`, null, a);
  assert.ok(assigned.body.rider.name, 'rider shown for the handover');
  assert.equal((await call('POST', `/orders/${oid}/demo-advance`, {}, c)).body.status, 'picked_up');
  assert.equal((await call('GET', `/merchant/orders/${oid}`, null, a)).body.status, 'picked_up');
  assert.equal((await call('GET', '/merchant/orders?active=true', null, a)).body.length, 0);

  let sales = await call('GET', '/merchant/sales?days=7', null, a);
  assert.equal(sales.body.sales, 9000);
  assert.equal(sales.body.orders, 1);
  assert.equal(sales.body.itemsSold, 2);
  assert.equal(sales.body.today.sales, 9000);
  assert.equal(sales.body.daily.length, 7);
  assert.equal(sales.body.topProducts[0].productId, pid);
  assert.equal((await call('GET', '/merchant/sales', null, b)).body.sales, 0);

  // Last one sells: it leaves the catalogue; declining cancels the order and puts it back
  const o2 = await call('POST', '/orders', { addressId: addr.body.id, items: [{ productId: pid, qty: 1 }], errands: [], payment: 'card' }, c);
  assert.equal(o2.status, 200, JSON.stringify(o2.body));
  cat = await call('GET', '/catalog');
  assert.equal(cat.body.products.find((p) => p.id === pid), undefined, 'sold out listing hidden');
  assert.equal((await call('POST', `/merchant/orders/${o2.body.id}/accept`, {}, a)).body.status, 'preparing');
  const dec = await call('POST', `/merchant/orders/${o2.body.id}/decline`, { reason: 'Bag was damaged' }, a);
  assert.equal(dec.body.status, 'declined');
  assert.equal(dec.body.declineReason, 'Bag was damaged');
  assert.equal((await call('GET', `/orders/${o2.body.id}`, null, c)).body.status, 'cancelled');
  assert.equal((await call('GET', '/merchant/products', null, a)).body.find((p) => p.id === pid).stock, 1);
  sales = await call('GET', '/merchant/sales?days=7', null, a);
  assert.equal(sales.body.orders, 1, 'declined orders are not sales');

  // Customer cancelling also restocks
  const o3 = await call('POST', '/orders', { addressId: addr.body.id, items: [{ productId: pid, qty: 1 }], errands: [], payment: 'card' }, c);
  assert.equal((await call('POST', `/orders/${o3.body.id}/cancel`, {}, c)).body.status, 'cancelled');
  assert.equal((await call('GET', '/merchant/products', null, a)).body.find((p) => p.id === pid).stock, 1);
  assert.equal((await call('GET', `/merchant/orders/${o3.body.id}`, null, a)).body.status, 'cancelled');

  // Closing the shop or hiding a listing takes it off the catalogue
  assert.equal((await call('PUT', '/merchant/me', { isOpen: false }, a)).body.isOpen, false);
  cat = await call('GET', '/catalog');
  assert.equal(cat.body.products.find((p) => p.id === pid), undefined);
  assert.equal((await call('POST', '/quote', { items: [{ productId: pid, qty: 1 }] })).status, 400);
  await call('PUT', '/merchant/me', { isOpen: true }, a);
  const hidden = await call('PUT', `/merchant/products/${pid}`, { active: false, price: 4700 }, a);
  assert.equal(hidden.body.active, false);
  assert.equal(hidden.body.price, 4700);
  assert.equal(hidden.body.stock, 1, 'partial edit keeps other fields');
  assert.equal((await call('GET', '/catalog')).body.products.find((p) => p.id === pid), undefined);
  await call('PUT', `/merchant/products/${pid}`, { active: true, stock: null }, a);
  item = (await call('GET', '/catalog')).body.products.find((p) => p.id === pid);
  assert.equal(item.price, 4700);
  assert.equal(item.stock, undefined, 'stock not tracked');

  // Only Arodan staff can approve merchants
  assert.equal((await call('GET', '/admin/merchants', null, a)).status, 400);
  assert.equal((await call('POST', `/admin/merchants/${reg.body.id}/status`, { status: 'suspended' }, a)).status, 400);
});

test('new merchants wait for approval when demo mode is off', async () => {
  await pool.query('update pricing_config set demo_mode = false');
  try {
    await pool.query(`delete from merchants where owner_id = (select id from auth.users where phone = '${B}')`);
    const b = await signIn(B, '222222');
    const reg = await call('POST', '/merchant/register', shop('Pending Shop'), b);
    assert.equal(reg.body.status, 'pending');
    const p = await call('POST', '/merchant/products', { name: 'Soap', category: 'household', price: 900 }, b);
    assert.equal(p.status, 200, 'can prepare listings while waiting');
    assert.equal((await call('GET', '/catalog')).body.products.find((x) => x.id === p.body.id), undefined);
    // An admin approves
    const admin = (await pool.query(`select id from auth.users where phone = '${A}'`)).rows[0].id;
    await pool.query("update profiles set role = 'admin' where id = $1", [admin]);
    const a = await signIn(A, '111111');
    const list = await call('GET', '/admin/merchants?status=pending', null, a);
    assert.ok(list.body.find((m) => m.id === reg.body.id));
    assert.equal((await call('POST', `/admin/merchants/${reg.body.id}/status`, { status: 'live' }, a)).body.status, 'live');
    assert.ok((await call('GET', '/catalog')).body.products.find((x) => x.id === p.body.id));
  } finally {
    await pool.query('update pricing_config set demo_mode = true');
    await pool.query(`update profiles set role = 'merchant' where id = (select id from auth.users where phone = '${A}')`);
  }
});
