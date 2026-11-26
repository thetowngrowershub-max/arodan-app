// One app for shoppers, riders and merchants: applying to ride, ops approval, roles on /me.
// Same setup as api.test.js (throwaway, migrated and seeded database).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const APPLICANT = '2348091230000';
const ADMIN = '2348091230001';
const SELLER = '2348091230002';
process.env.TEST_OTP_PHONES = [APPLICANT, ADMIN, SELLER].map((p) => `${p}:222222`).join(',');
process.env.TERMII_API_KEY = '';
const { buildApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

const phones = `('${APPLICANT}', '${ADMIN}', '${SELLER}')`;
let app;
before(async () => {
  app = await buildApp({ logger: false });
  await pool.query(`delete from merchants where owner_id in (select id from auth.users where phone in ${phones})`);
  await pool.query(`delete from auth.users where phone in ${phones}`);
  await pool.query(`delete from auth.otp_codes where phone in ${phones}`);
  const u = await pool.query('insert into auth.users (phone) values ($1) returning id', [ADMIN]);
  await pool.query("update profiles set role = 'admin', full_name = 'Ops' where id = $1", [u.rows[0].id]);
});
after(async () => {
  await pool.query(`update riders set is_online = false where phone like '0809 123 000%'`);
  await app.close();
  await pool.end();
});

const call = async (method, url, body, token) => {
  const r = await app.inject({ method, url, payload: body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: r.statusCode, body: r.json() };
};
async function signIn(phone) {
  await call('POST', '/auth/otp', { phone });
  const r = await call('POST', '/auth/verify', { phone, code: '222222' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

const application = {
  name: 'Sola Akin', vehicle: 'motorbike', plate: 'lsr 555 kj', homeAddress: '12 Ojodu Road, Berger',
  guarantorName: 'Mrs Akin', guarantorPhone: '0803 222 3333',
};

test('apply to ride, wait for checks, get approved by ops', async () => {
  const t = await signIn(APPLICANT);
  const ops = await signIn(ADMIN);

  let me = (await call('GET', '/me', null, t)).body;
  assert.deepEqual(me.roles, { rider: 'none', merchant: 'none' });
  assert.equal((await call('GET', '/rider/me', null, t)).status, 400);

  // Bad applications are refused
  assert.equal((await call('POST', '/rider/apply', { ...application, plate: '' }, t)).status, 400);
  assert.equal((await call('POST', '/rider/apply', { ...application, guarantorPhone: '123' }, t)).status, 400);

  const a = await call('POST', '/rider/apply', application, t);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.equal(a.body.rider.vetted, false);
  assert.equal(a.body.rider.plate, 'LSR 555 KJ');
  assert.equal(a.body.rider.phone, '0809 123 0000');
  me = (await call('GET', '/me', null, t)).body;
  assert.equal(me.roles.rider, 'pending');
  assert.equal(me.user.name, 'Sola Akin');

  // Pending applicants can open the rider part (to see their checks) but cannot go online or take jobs
  assert.equal((await call('GET', '/rider/me', null, t)).body.rider.vetted, false);
  assert.match((await call('POST', '/rider/online', { online: true }, t)).body.error, /NIN/);

  // Applying again while in review updates the details
  const again = await call('POST', '/rider/apply', { ...application, vehicle: 'bicycle', plate: '' }, t);
  assert.equal(again.body.rider.vehicle, 'bicycle');

  // Only admins can review
  assert.equal((await call('GET', '/admin/riders?status=pending', null, t)).status, 400);
  const pending = (await call('GET', '/admin/riders?status=pending', null, ops)).body;
  const mine = pending.find((r) => r.phone === '0809 123 0000');
  assert.ok(mine);
  assert.equal(mine.guarantorName, 'Mrs Akin');
  assert.equal(mine.homeAddress, '12 Ojodu Road, Berger');

  assert.equal((await call('POST', `/admin/riders/${mine.id}`, { nin: true, guarantor: true }, ops)).body.status, 'pending');
  assert.equal((await call('GET', '/me', null, t)).body.roles.rider, 'pending');
  assert.equal((await call('POST', `/admin/riders/${mine.id}`, { address: true }, ops)).body.status, 'approved');
  assert.equal((await call('GET', '/me', null, t)).body.roles.rider, 'approved');
  assert.equal((await call('POST', '/rider/online', { online: true }, t)).status, 200);
  assert.equal((await call('POST', '/rider/apply', application, t)).status, 400, 'already a rider');

  // Pausing takes them offline and shows as paused
  const paused = await call('POST', `/admin/riders/${mine.id}`, { active: false }, ops);
  assert.equal(paused.body.status, 'paused');
  assert.equal(paused.body.online, false);
  assert.equal((await call('GET', '/me', null, t)).body.roles.rider, 'paused');
  await call('POST', `/admin/riders/${mine.id}`, { active: true }, ops);
});

test('a shop application shows up as the merchant role', async () => {
  const t = await signIn(SELLER);
  const areas = (await call('GET', '/merchant/areas')).body;
  const r = await call('POST', '/merchant/register', {
    ownerName: 'Bisi Shop', name: 'Bisi Provisions', phone: '0809 123 0002', address: '3 Market Rd', areaId: areas[0].id,
    categories: ['groceries'], bankName: '', accountNumber: '', accountName: '',
  }, t);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const expected = r.body.status === 'live' ? 'approved' : 'pending'; // demo_mode approves shops straight away
  assert.equal((await call('GET', '/me', null, t)).body.roles.merchant, expected);
  assert.equal((await call('GET', '/me', null, t)).body.roles.rider, 'none');
});

test('the one app registers a single push token for all its parts', async () => {
  const t = await signIn(APPLICANT);
  const r = await call('POST', '/push/register', { token: 'ExponentPushToken[oneapp-test-token-123]', app: 'arodan', platform: 'android' }, t);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await pool.query("select app from push_tokens where token = 'ExponentPushToken[oneapp-test-token-123]'");
  assert.equal(row.rows[0].app, 'arodan');
  await call('POST', '/push/unregister', { token: 'ExponentPushToken[oneapp-test-token-123]' }, t);
});
