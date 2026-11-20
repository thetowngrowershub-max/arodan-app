// End-to-end API checks. Run against a THROWAWAY database that has been migrated and seeded:
//   DATABASE_URL=postgres://.../arodan_test JWT_SECRET=<32+ chars> npm run migrate && npm run seed && npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.TEST_OTP_PHONES = '2348031234567:123456,2348039999999:654321';
process.env.TERMII_API_KEY = '';
const { buildApp, normalizePhone } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

let app;
before(async () => {
  app = await buildApp({ logger: false });
  const phones = "('2348031234567', '2348039999999', '2348051112222')";
  await pool.query(`delete from orders where customer_id in (select id from auth.users where phone in ${phones})`);
  await pool.query(`delete from products where merchant_id in (select m.id from merchants m join auth.users u on u.id = m.owner_id where u.phone in ${phones})`);
  await pool.query(`delete from merchants where owner_id in (select id from auth.users where phone in ${phones})`);
  await pool.query("delete from auth.users where phone in ('2348031234567', '2348039999999', '2348051112222')");
  await pool.query("delete from auth.otp_codes where phone in ('2348031234567', '2348039999999', '2348051112222')");
});
after(async () => {
  await app.close();
  await pool.end();
});

const call = async (method, url, body, token) => {
  const r = await app.inject({ method, url, payload: body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: r.statusCode, body: r.json() };
};

async function signIn(phone, code) {
  assert.equal((await call('POST', '/auth/otp', { phone })).status, 200);
  const r = await call('POST', '/auth/verify', { phone, code });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

test('phone numbers are normalised', () => {
  assert.equal(normalizePhone('0803 123 4567'), '2348031234567');
  assert.equal(normalizePhone('+234 803 123 4567'), '2348031234567');
  assert.equal(normalizePhone('12345'), null);
});

test('sign-in rejects wrong codes and locks after 5 attempts', async () => {
  await call('POST', '/auth/otp', { phone: '08051112222' });
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/auth/verify', { phone: '08051112222', code: '000000' })).status, 400);
  const r = await call('POST', '/auth/verify', { phone: '08051112222', code: '000000' });
  assert.match(r.body.error, /expired/);
});

test('requests without a valid token are refused', async () => {
  assert.equal((await call('GET', '/orders')).status, 401);
  assert.equal((await call('GET', '/orders', null, 'abc.def.ghi')).status, 401);
});

test('full customer journey', async () => {
  const token = await signIn('0803 123 4567', '123456');
  let me = await call('GET', '/me', null, token);
  assert.equal(me.body.user.phone, '2348031234567');
  assert.equal(me.body.address, null);

  assert.equal((await call('PUT', '/me', { name: 'Ada Bello' }, token)).status, 200);
  const addr = await call('PUT', '/me/address', { estate: 'Magodo Phase 2', street: 'Oluwole Oke St', houseNo: '14B', gateName: 'CMD Road gate', gateCode: '4821' }, token);
  assert.equal(addr.status, 200);
  assert.ok(addr.body.id);

  const cat = await call('GET', '/catalog');
  assert.ok(cat.body.products.length >= 20);
  assert.equal(cat.body.pricing.serviceChargeRate, 0.075);

  const items = [{ productId: 'p1', qty: 2 }];
  const errands = [{ type: 'laundry', title: 'Collect shirts', pickupSpotId: 's1', estMin: 20, budget: 0 }];
  const quote = await call('POST', '/quote', { items, errands });
  const placed = await call('POST', '/orders', { addressId: addr.body.id, items, errands, payment: 'card' }, token);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  assert.equal(placed.body.bill.total, quote.body.total);
  assert.equal(placed.body.bill.serviceCharge, Math.round((29000 + 650) * 0.075));
  assert.equal(placed.body.address.gateCode, '4821');
  assert.match(placed.body.code, /^AR\d+$/);

  const adv = await call('POST', `/orders/${placed.body.id}/demo-advance`, {}, token);
  assert.equal(adv.body.status, 'assigned');
  assert.ok(adv.body.rider.name);
  assert.equal((await call('POST', `/orders/${placed.body.id}/cancel`, {}, token)).status, 400);

  // Customer can't move their own order like a rider
  assert.equal((await call('POST', `/orders/${placed.body.id}/status`, { status: 'delivered' }, token)).status, 400);

  me = await call('GET', '/me', null, token);
  assert.equal(me.body.user.name, 'Ada Bello');
  assert.equal(me.body.address.houseNo, '14B');

  // Another customer sees nothing of this
  const other = await signIn('08039999999', '654321');
  assert.equal((await call('GET', '/orders', null, other)).body.length, 0);
  assert.equal((await call('GET', `/orders/${placed.body.id}`, null, other)).status, 404);
  assert.equal((await call('POST', '/orders', { addressId: addr.body.id, items, errands: [], payment: 'card' }, other)).status, 400);
  assert.equal((await call('PUT', '/me/address', { id: addr.body.id, estate: 'x', street: 'y', houseNo: 'z' }, other)).body.id !== addr.body.id, true);

  const mine = await call('GET', '/orders', null, token);
  assert.equal(mine.body.length, 1);
});

test('bad order input is refused', async () => {
  const token = await signIn('08031234567', '123456');
  const me = await call('GET', '/me', null, token);
  const r1 = await call('POST', '/orders', { addressId: me.body.address.id, items: [{ productId: 'p1', qty: -2 }], errands: [], payment: 'card' }, token);
  assert.equal(r1.status, 400);
  const r2 = await call('POST', '/orders', { addressId: me.body.address.id, items: [{ productId: 'nope', qty: 1 }], errands: [], payment: 'card' }, token);
  assert.equal(r2.status, 400);
  const r3 = await call('POST', '/orders', { addressId: me.body.address.id, items: [], errands: [], payment: 'card' }, token);
  assert.equal(r3.status, 400);
});
