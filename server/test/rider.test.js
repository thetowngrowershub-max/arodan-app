// Rider app API checks. Same setup as api.test.js (throwaway, migrated and seeded database).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const RIDER = '2348062220000';
const RIDER2 = '2348062220003';
const NEW_RIDER = '2348062220001'; // vetting not finished
const CUSTOMER = '2348062220002';
process.env.TEST_OTP_PHONES = [RIDER, RIDER2, NEW_RIDER, CUSTOMER].map((p) => `${p}:111111`).join(',');
process.env.TERMII_API_KEY = '';
const { buildApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

const phones = `('${RIDER}', '${RIDER2}', '${NEW_RIDER}', '${CUSTOMER}')`;
let app;
before(async () => {
  app = await buildApp({ logger: false });
  await pool.query(`delete from orders where customer_id in (select id from auth.users where phone in ${phones})`);
  await pool.query(`delete from auth.users where phone in ${phones}`);
  await pool.query(`delete from auth.otp_codes where phone in ${phones}`);
  // Riders are set up by Arodan ops after vetting (there is no self sign-up for riders).
  for (const [phone, name, vetted] of [[RIDER, 'Musa Rider', true], [RIDER2, 'Ife Rider', true], [NEW_RIDER, 'New Rider', false]]) {
    const u = await pool.query('insert into auth.users (phone) values ($1) returning id', [phone]);
    await pool.query("update profiles set role = 'rider', full_name = $2 where id = $1", [u.rows[0].id, name]);
    await pool.query(
      `insert into riders (id, display_name, phone, vehicle, plate, nin_verified, guarantor_confirmed, address_visited)
       values ($1, $2, $3, 'motorbike', 'LSR 100 AB', $4, $4, $4)`, [u.rows[0].id, name, phone, vetted]);
  }
});
after(async () => {
  // Real riders online would hold back demo assignments in other tests.
  await pool.query(`update riders set is_online = false where phone in ${phones}`);
  await pool.query(`delete from orders where customer_id in (select id from auth.users where phone in ${phones})`);
  await app.close();
  await pool.end();
});

const call = async (method, url, body, token) => {
  const r = await app.inject({ method, url, payload: body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: r.statusCode, body: r.json() };
};
async function signIn(phone) {
  await call('POST', '/auth/otp', { phone });
  const r = await call('POST', '/auth/verify', { phone, code: '111111' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}
const fakeJpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 7)]).toString('base64');

test('rider journey: online, offers, accept, track, deliver with code, earnings', async () => {
  const rider = await signIn(RIDER);
  const rider2 = await signIn(RIDER2);
  const cust = await signIn(CUSTOMER);
  await call('PUT', '/me', { name: 'Bola Customer' }, cust);
  const addr = (await call('PUT', '/me/address', { estate: 'Magodo Phase 2', street: 'Kayode St', houseNo: '7', gateName: 'Main gate', gateCode: '9911' }, cust)).body;

  const me = await call('GET', '/rider/me', null, rider);
  assert.equal(me.status, 200);
  assert.equal(me.body.rider.vetted, true);
  assert.equal(me.body.activeJob, null);

  // Customers are not riders
  assert.equal((await call('GET', '/rider/me', null, cust)).status, 400);
  assert.equal((await call('POST', '/rider/online', { online: true }, cust)).status, 400);

  // Offline riders get no offers
  assert.deepEqual((await call('GET', '/rider/jobs', null, rider)).body, []);

  const place = (payment = 'card') => call('POST', '/orders', { addressId: addr.id, items: [{ productId: 'p1', qty: 1 }], errands: [], payment }, cust);
  const o1 = (await place()).body;
  const o2 = (await place()).body;
  assert.match(o1.deliveryCode, /^\d{4}$/);

  assert.equal((await call('POST', '/rider/online', { online: true, lat: 6.62, lng: 3.38 }, rider)).body.rider.online, true);
  await call('POST', '/rider/online', { online: true }, rider2);
  let jobs = (await call('GET', '/rider/jobs', null, rider)).body;
  const offer = jobs.find((j) => j.id === o1.id);
  assert.ok(offer, 'order offered');
  assert.equal(offer.dropoff.houseNo, undefined, 'house number hidden before accepting');
  assert.equal(offer.dropoff.gateCode, undefined, 'gate code hidden before accepting');
  assert.equal(offer.customer, null);
  assert.ok(offer.payout.total >= 800);
  assert.equal(offer.pickups[0].kind, 'merchant');

  // Decline hides it from this rider only
  await call('POST', `/rider/jobs/${o2.id}/decline`, {}, rider);
  jobs = (await call('GET', '/rider/jobs', null, rider)).body;
  assert.ok(!jobs.some((j) => j.id === o2.id));
  assert.ok((await call('GET', '/rider/jobs', null, rider2)).body.some((j) => j.id === o2.id));

  // Accept: full address and customer now visible
  const acc = await call('POST', `/rider/jobs/${o1.id}/accept`, {}, rider);
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  assert.equal(acc.body.dropoff.gateCode, '9911');
  assert.equal(acc.body.customer.name, 'Bola Customer');
  assert.equal(acc.body.status, 'assigned');
  // First to accept wins
  assert.equal((await call('POST', `/rider/jobs/${o1.id}/accept`, {}, rider2)).status, 400);
  // One job at a time
  assert.equal((await call('POST', `/rider/jobs/${o2.id}/accept`, {}, rider)).status, 400);
  assert.deepEqual((await call('GET', '/rider/jobs', null, rider)).body, []);
  assert.equal((await call('GET', '/rider/job', null, rider)).body.job.id, o1.id);

  // The rider never sees the hand-over code
  const asRider = await call('GET', `/orders/${o1.id}`, null, rider);
  assert.equal(asRider.body.deliveryCode, undefined);
  // Other riders can't act on it
  assert.equal((await call('POST', `/rider/jobs/${o1.id}/status`, { status: 'picked_up' }, rider2)).status, 400);

  // Live location reaches the customer
  await call('POST', '/rider/location', { lat: 6.6123, lng: 3.3811, heading: 90 }, rider);
  let co = (await call('GET', `/orders/${o1.id}`, null, cust)).body;
  assert.equal(co.status, 'assigned');
  assert.equal(co.rider.name, 'Musa Rider');
  assert.equal(co.rider.location.lat, 6.6123);

  // Can't deliver before pickup; steps move forward only
  assert.equal((await call('POST', `/rider/jobs/${o1.id}/deliver`, { method: 'code', code: co.deliveryCode }, rider)).status, 400);
  assert.equal((await call('POST', `/rider/jobs/${o1.id}/status`, { status: 'picked_up' }, rider)).body.status, 'picked_up');
  assert.equal((await call('POST', `/rider/jobs/${o1.id}/status`, { status: 'on_the_way' }, rider)).body.status, 'on_the_way');
  assert.equal((await call('POST', `/rider/jobs/${o1.id}/status`, { status: 'picked_up' }, rider)).status, 400);
  assert.equal((await call('POST', `/rider/jobs/${o1.id}/status`, { status: 'delivered' }, rider)).status, 400);
  // The old status route no longer lets riders skip proof of delivery
  assert.equal((await call('POST', `/orders/${o1.id}/status`, { status: 'delivered' }, rider)).status, 400);
  // Customer can't pretend to be the rider
  assert.equal((await call('POST', `/rider/jobs/${o1.id}/deliver`, { method: 'code', code: co.deliveryCode }, cust)).status, 400);

  const wrong = co.deliveryCode === '0000' ? '1111' : '0000';
  const bad = await call('POST', `/rider/jobs/${o1.id}/deliver`, { method: 'code', code: wrong }, rider);
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /not right/);
  const done = await call('POST', `/rider/jobs/${o1.id}/deliver`, { method: 'code', code: co.deliveryCode }, rider);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.job.status, 'delivered');
  assert.equal(done.body.earned, offer.payout.total);

  co = (await call('GET', `/orders/${o1.id}`, null, cust)).body;
  assert.equal(co.status, 'delivered');
  assert.equal(co.rider.location, undefined, 'location hidden after delivery');

  const earn = (await call('GET', '/rider/earnings', null, rider)).body;
  assert.equal(earn.today.trips, 1);
  assert.equal(earn.today.amount, done.body.earned);
  assert.equal(earn.days.length, 7);
  assert.equal(earn.recent[0].code, o1.code);
  assert.equal((await call('GET', '/rider/me', null, rider)).body.rider.trips, 1);

  // Pay on delivery, proven with a photo; cash must be collected
  const o3 = (await place('pod')).body;
  assert.equal((await call('POST', `/rider/jobs/${o3.id}/accept`, {}, rider)).status, 200);
  await call('POST', `/rider/jobs/${o3.id}/status`, { status: 'picked_up' }, rider);
  assert.equal((await call('POST', `/rider/jobs/${o3.id}/deliver`, { method: 'photo', photo: 'bm90IGEgcGhvdG8=' }, rider)).status, 400);
  const noCash = await call('POST', `/rider/jobs/${o3.id}/deliver`, { method: 'photo', photo: fakeJpeg() }, rider);
  assert.match(noCash.body.error, /Collect/);
  const pod = await call('POST', `/rider/jobs/${o3.id}/deliver`, { method: 'photo', photo: fakeJpeg(), cashCollected: o3.bill.total }, rider);
  assert.equal(pod.status, 200, JSON.stringify(pod.body));
  assert.equal((await call('GET', `/orders/${o3.id}`, null, cust)).body.paymentStatus, 'paid');

  // Hand a job back before pickup: it returns to the queue for others
  const o4 = (await place()).body;
  await call('POST', `/rider/jobs/${o4.id}/accept`, {}, rider);
  assert.equal((await call('POST', `/rider/jobs/${o4.id}/release`, {}, rider)).status, 200);
  assert.equal((await call('GET', `/orders/${o4.id}`, null, cust)).body.status, 'placed');
  assert.ok((await call('GET', '/rider/jobs', null, rider2)).body.some((j) => j.id === o4.id));
  assert.ok(!(await call('GET', '/rider/jobs', null, rider)).body.some((j) => j.id === o4.id));

  // Demo mode leaves orders for real riders while one is online
  const o5 = (await place()).body;
  assert.equal((await call('POST', `/orders/${o5.id}/demo-advance`, {}, cust)).body.status, 'placed');

  // Going offline stops offers
  await call('POST', '/rider/online', { online: false }, rider2);
  assert.deepEqual((await call('GET', '/rider/jobs', null, rider2)).body, []);
});

test('riders whose vetting is unfinished cannot go online', async () => {
  const t = await signIn(NEW_RIDER);
  const me = await call('GET', '/rider/me', null, t);
  assert.equal(me.body.rider.vetted, false);
  const r = await call('POST', '/rider/online', { online: true }, t);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /NIN/);
});
