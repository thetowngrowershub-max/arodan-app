// Push notifications and rider bank payouts, with Expo's push service and Paystack simulated.
// Run like api.test.js, against a THROWAWAY migrated and seeded database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const RIDER = '2348063330000';
const RIDER2 = '2348063330001';
const CUSTOMER = '2348063330002';
const ADMIN = '2348063330003';
const ALL = [RIDER, RIDER2, CUSTOMER, ADMIN];
process.env.TEST_OTP_PHONES = ALL.map((p) => `${p}:111111`).join(',');
process.env.TERMII_API_KEY = '';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_arodan';

// ── Simulated Expo push + Paystack ──
const pushed = [];
const paystack = { transfers: [], transferReply: () => ({ status: 200, body: { status: true, data: { status: 'pending', transfer_code: 'TRF_1' } } }), known: new Map() };
let paystackDown = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const u = new URL(url);
  if (u.host === 'exp.host') {
    const msgs = JSON.parse(opts.body);
    pushed.push(...msgs);
    return json(200, { data: msgs.map((m) => (m.to.includes('Gone') ? { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'x' })) });
  }
  assert.equal(opts.headers.authorization, 'Bearer sk_test_arodan');
  if (paystackDown) throw new TypeError('fetch failed');
  if (u.pathname === '/bank') return json(200, { status: true, data: [{ code: '058', name: 'Guaranty Trust Bank', active: true }, { code: '50515', name: 'Moniepoint MFB', active: true }], meta: { next: null } });
  if (u.pathname === '/bank/resolve') {
    if (u.searchParams.get('account_number') === '0000000000') return json(422, { status: false, message: 'Could not resolve account name' });
    return json(200, { status: true, data: { account_number: u.searchParams.get('account_number'), account_name: 'MUSA IBRAHIM' } });
  }
  if (u.pathname === '/transferrecipient') return json(201, { status: true, data: { recipient_code: `RCP_${JSON.parse(opts.body).account_number}` } });
  if (u.pathname === '/transfer') {
    const body = JSON.parse(opts.body);
    paystack.transfers.push(body);
    const r = paystack.transferReply(body);
    if (r.status < 300) paystack.known.set(body.reference, r.body.data.status);
    return json(r.status, r.body);
  }
  if (u.pathname.startsWith('/transfer/verify/')) {
    const ref = decodeURIComponent(u.pathname.split('/').pop());
    if (!paystack.known.has(ref)) return json(404, { status: false, message: 'Transfer not found' });
    return json(200, { status: true, data: { status: paystack.known.get(ref), transfer_code: 'TRF_v', reference: ref } });
  }
  return json(404, { status: false, message: 'not simulated' });
};

const { buildApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
const { sendPendingPush } = await import('../src/push.js');
const { autoPayouts, reconcilePayouts } = await import('../src/payouts.js');

const phones = `(${ALL.map((p) => `'${p}'`).join(', ')})`;
const users = `(select id from auth.users where phone in ${phones})`;
let app;
before(async () => {
  app = await buildApp({ logger: false });
  await pool.query(`delete from orders where customer_id in ${users}`);
  await pool.query(`delete from rider_adjustments where rider_id in ${users}`);
  await pool.query(`delete from rider_payouts where rider_id in ${users}`);
  await pool.query(`delete from auth.users where phone in ${phones}`);
  await pool.query(`delete from auth.otp_codes where phone in ${phones}`);
  await pool.query('delete from payout_runs');
  // Only this file's messages matter below.
  await pool.query('update push_outbox set sent_at = now() where sent_at is null');
  for (const [phone, name] of [[RIDER, 'Musa Ibrahim'], [RIDER2, 'Ife Rider']]) {
    const u = await pool.query('insert into auth.users (phone) values ($1) returning id', [phone]);
    await pool.query("update profiles set role = 'rider', full_name = $2 where id = $1", [u.rows[0].id, name]);
    await pool.query(`insert into riders (id, display_name, phone, vehicle, nin_verified, guarantor_confirmed, address_visited)
                      values ($1, $2, $3, 'motorbike', true, true, true)`, [u.rows[0].id, name, phone]);
  }
});
after(async () => {
  globalThis.fetch = realFetch;
  await pool.query(`update riders set is_online = false where phone in ${phones}`);
  await app.close();
  await pool.end();
});

const call = async (method, url, body, token, headers = {}) => {
  const r = await app.inject({ method, url, payload: body, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
  let json;
  try { json = r.json(); } catch { json = null; }
  return { status: r.statusCode, body: json };
};
async function signIn(phone) {
  await call('POST', '/auth/otp', { phone });
  const r = await call('POST', '/auth/verify', { phone, code: '111111' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}
const outbox = async (phone) => (await pool.query(
  `select o.title, o.body, o.app, o.data from push_outbox o join auth.users u on u.id = o.user_id where u.phone = $1 order by o.id`, [phone])).rows;

let rider, rider2, cust, admin, addr;
const placeOrder = async (payment = 'card') =>
  (await call('POST', '/orders', { addressId: addr.id, items: [{ productId: 'p1', qty: 1 }], errands: [], payment }, cust)).body;
async function deliver(token, o) {
  assert.equal((await call('POST', `/rider/jobs/${o.id}/accept`, {}, token)).status, 200);
  await call('POST', `/rider/jobs/${o.id}/status`, { status: 'picked_up' }, token);
  await call('POST', `/rider/jobs/${o.id}/status`, { status: 'at_gate' }, token);
  const code = (await call('GET', `/orders/${o.id}`, null, cust)).body.deliveryCode;
  const r = await call('POST', `/rider/jobs/${o.id}/deliver`, { method: 'code', code, cashCollected: o.bill.total }, token);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.earned;
}

test('push: phones register, order changes queue messages, the worker sends them', async () => {
  rider = await signIn(RIDER);
  rider2 = await signIn(RIDER2);
  cust = await signIn(CUSTOMER);
  admin = await signIn(ADMIN);
  await pool.query("update profiles set role = 'admin' where phone = $1", [ADMIN]);
  await call('PUT', '/me', { name: 'Bola Customer' }, cust);
  addr = (await call('PUT', '/me/address', { estate: 'Magodo Phase 2', street: 'Kayode St', houseNo: '7' }, cust)).body;

  assert.equal((await call('POST', '/push/register', { token: 'not-a-token', app: 'customer' }, cust)).status, 400);
  assert.equal((await call('POST', '/push/register', { token: 'ExponentPushToken[cust-aaaaaaaaaaaa]', app: 'shop' }, cust)).status, 400);
  assert.equal((await call('POST', '/push/register', { token: 'ExponentPushToken[cust-aaaaaaaaaaaa]', app: 'customer' })).status, 401);
  assert.equal((await call('POST', '/push/register', { token: 'ExponentPushToken[cust-aaaaaaaaaaaa]', app: 'customer', platform: 'android' }, cust)).status, 200);
  assert.equal((await call('POST', '/push/register', { token: 'ExponentPushToken[custGone-bbbbbbbbbb]', app: 'customer', platform: 'ios' }, cust)).status, 200);
  assert.equal((await call('POST', '/push/register', { token: 'ExponentPushToken[rider-cccccccccccc]', app: 'rider' }, rider)).status, 200);

  await call('POST', '/rider/online', { online: true }, rider);
  const o = await placeOrder();
  // Online, free riders hear about the new job
  const jobMsg = (await outbox(RIDER)).find((m) => m.title === 'New job nearby');
  assert.ok(jobMsg, 'rider told about new job');
  assert.match(jobMsg.body, /Magodo Phase 2.*₦/);
  assert.equal(jobMsg.data.orderId, o.id);
  assert.ok(!(await outbox(RIDER2)).length, 'offline rider not told');

  await deliver(rider, o);
  const titles = (await outbox(CUSTOMER)).map((m) => m.title);
  assert.deepEqual(titles, ['Rider assigned', 'Order picked up', 'Your rider is at the gate', 'Delivered']);
  assert.match((await outbox(CUSTOMER))[0].body, /^Musa is handling order AR\d+/);

  // Cancelling tells the customer
  const o2 = await placeOrder();
  await call('POST', `/orders/${o2.id}/cancel`, {}, cust);
  assert.equal((await outbox(CUSTOMER)).at(-1).title, 'Order cancelled');

  // Send: each message goes to each of the user's phones for that app
  pushed.length = 0;
  while ((await sendPendingPush()) > 0);
  const toCust = pushed.filter((m) => m.to.includes('cust'));
  assert.equal(toCust.length, 10, '5 messages × 2 phones');
  assert.ok(pushed.some((m) => m.to === 'ExponentPushToken[rider-cccccccccccc]' && m.channelId === 'jobs'));
  assert.equal((await pool.query("select count(*)::int n from push_outbox where sent_at is null")).rows[0].n, 0);
  // The phone Expo says is gone is forgotten
  assert.deepEqual((await pool.query(`select token from push_tokens where user_id in ${users} and app = 'customer'`)).rows.map((r) => r.token),
    ['ExponentPushToken[cust-aaaaaaaaaaaa]']);

  // Signing out removes the phone
  await call('POST', '/push/unregister', { token: 'ExponentPushToken[cust-aaaaaaaaaaaa]' }, cust);
  assert.equal((await pool.query(`select count(*)::int n from push_tokens where user_id in ${users} and app = 'customer'`)).rows[0].n, 0);
  await call('POST', '/rider/online', { online: false }, rider);
});

test('payouts: bank account, balance, withdraw, webhook, failures', async () => {
  // Not for customers
  assert.equal((await call('GET', '/rider/wallet', null, cust)).status, 400);

  let w = (await call('GET', '/rider/wallet', null, rider)).body;
  assert.equal(w.payoutsEnabled, true);
  assert.equal(w.bankAccount, null);
  assert.ok(w.balance.available > 0, 'earned on the first test delivery');
  const earnedSoFar = w.balance.available;
  assert.match((await call('POST', '/rider/payouts', {}, rider)).body.error, /bank account first/);

  // Banks and account check
  const banks = (await call('GET', '/rider/banks', null, rider)).body;
  assert.equal(banks[0].name, 'Guaranty Trust Bank');
  assert.equal((await call('POST', '/rider/bank-account/check', { bankCode: '058', accountNumber: '123' }, rider)).status, 400);
  assert.equal((await call('POST', '/rider/bank-account/check', { bankCode: '999', accountNumber: '0123456789' }, rider)).status, 400);
  assert.match((await call('POST', '/rider/bank-account/check', { bankCode: '058', accountNumber: '0000000000' }, rider)).body.error, /do not match/);
  const chk = await call('POST', '/rider/bank-account/check', { bankCode: '058', accountNumber: '0123456789' }, rider);
  assert.equal(chk.body.accountName, 'MUSA IBRAHIM');

  w = (await call('PUT', '/rider/bank-account', { bankCode: '058', accountNumber: '0123456789' }, rider)).body;
  assert.equal(w.bankAccount.accountNumber, '******6789');
  assert.equal(w.bankAccount.bankName, 'Guaranty Trust Bank');
  assert.ok(new Date(w.bankAccount.payoutsFrom) <= new Date(), 'first account: no hold');

  // Below the minimum
  if (earnedSoFar < 1000) assert.match((await call('POST', '/rider/payouts', {}, rider)).body.error, /reaches ₦1,000/);

  // Admins only for adjustments; ops credit ₦2,000
  const rid = (await pool.query('select id from riders where phone = $1', [RIDER])).rows[0].id;
  assert.equal((await call('POST', `/admin/riders/${rid}/adjustments`, { amount: 2000, note: 'x' }, rider)).status, 400);
  assert.equal((await call('POST', `/admin/riders/${rid}/adjustments`, { amount: 2000, note: '' }, admin)).status, 400);
  const adj = await call('POST', `/admin/riders/${rid}/adjustments`, { amount: 2000, note: 'Pilot bonus' }, admin);
  assert.equal(adj.body.available, earnedSoFar + 2000);

  // Withdraw: Paystack is asked for the whole balance in kobo, with our reference
  const wd = await call('POST', '/rider/payouts', {}, rider);
  assert.equal(wd.status, 200, JSON.stringify(wd.body));
  assert.equal(wd.body.payout.status, 'processing');
  assert.equal(wd.body.payout.amount, earnedSoFar + 2000);
  assert.equal(wd.body.wallet.balance.available, 0);
  const t = paystack.transfers.at(-1);
  assert.equal(t.amount, (earnedSoFar + 2000) * 100);
  assert.equal(t.recipient, 'RCP_0123456789');
  assert.match(t.reference, /^arodan_po_[0-9a-f]{32}$/);
  assert.match((await call('POST', '/rider/payouts', {}, rider)).body.error, /already on its way|reaches/);

  // Webhook: bad signature refused; a good one marks it paid and tells the rider
  const evt = JSON.stringify({ event: 'transfer.success', data: { reference: t.reference, transfer_code: 'TRF_ok' } });
  const sig = createHmac('sha512', 'sk_test_arodan').update(evt).digest('hex');
  assert.equal((await call('POST', '/paystack/webhook', evt, null, { 'content-type': 'application/json', 'x-paystack-signature': 'nope' })).status, 401);
  assert.equal((await call('POST', '/paystack/webhook', evt, null, { 'content-type': 'application/json', 'x-paystack-signature': sig })).status, 200);
  // Paystack may send it twice
  assert.equal((await call('POST', '/paystack/webhook', evt, null, { 'content-type': 'application/json', 'x-paystack-signature': sig })).status, 200);
  w = (await call('GET', '/rider/wallet', null, rider)).body;
  assert.equal(w.payouts[0].status, 'paid');
  assert.equal(w.payouts[0].accountNumber, '******6789');
  assert.equal((await outbox(RIDER)).filter((m) => m.title === 'Payout sent').length, 1);

  // Paystack refuses (e.g. Arodan's Paystack balance is too low): money goes back into the rider's balance
  await call('POST', `/admin/riders/${rid}/adjustments`, { amount: 1500, note: 'Tip' }, admin);
  paystack.transferReply = () => ({ status: 400, body: { status: false, message: 'Your balance is not enough to fulfil this request' } });
  const refused = await call('POST', '/rider/payouts', {}, rider);
  assert.equal(refused.body.payout.status, 'failed');
  assert.equal(refused.body.wallet.balance.available, 1500);
  assert.equal((await outbox(RIDER)).at(-1).title, 'Payout did not go through');

  // Pay on delivery: cash collected at the door comes off the balance
  paystack.transferReply = () => ({ status: 200, body: { status: true, data: { status: 'success', transfer_code: 'TRF_2' } } });
  await call('POST', '/rider/online', { online: true }, rider);
  const pod = await placeOrder('pod');
  const earned = await deliver(rider, pod);
  w = (await call('GET', '/rider/wallet', null, rider)).body;
  assert.equal(w.balance.cashCollected, pod.bill.total);
  assert.equal(w.balance.available, 1500 + earned - pod.bill.total);
  // Rider hands the cash in at the office
  await call('POST', `/admin/riders/${rid}/adjustments`, { amount: pod.bill.total, note: 'POD cash handed in' }, admin);
  const ok = await call('POST', '/rider/payouts', {}, rider);
  assert.equal(ok.body.payout.status, 'paid', 'Paystack said success straight away');
  assert.equal(ok.body.payout.amount, 1500 + earned);

  // A new bank account holds payouts for 24 hours, and the rider is warned
  w = (await call('PUT', '/rider/bank-account', { bankCode: '50515', accountNumber: '9876543210' }, rider)).body;
  assert.ok(new Date(w.bankAccount.payoutsFrom) > new Date(Date.now() + 23 * 3600_000));
  assert.equal((await outbox(RIDER)).at(-1).title, 'Bank account changed');
  await call('POST', `/admin/riders/${rid}/adjustments`, { amount: 1200, note: 'Bonus' }, admin);
  assert.match((await call('POST', '/rider/payouts', {}, rider)).body.error, /new bank account can receive payouts from/);
  await call('POST', '/rider/online', { online: false }, rider);

  // Admin views
  assert.equal((await call('GET', '/admin/payouts', null, rider)).status, 400);
  const list = (await call('GET', '/admin/payouts?status=paid', null, admin)).body;
  assert.ok(list.filter((p) => p.riderId === rid).length >= 2);
  assert.ok((await call('GET', '/admin/riders/balances', null, admin)).body.some((b) => b.riderId === rid && b.balance.available === 1200));
});

test('payouts: unknown results are checked with Paystack later; nightly run pays once a day', async () => {
  const rid2 = (await pool.query('select id from riders where phone = $1', [RIDER2])).rows[0].id;
  await call('PUT', '/rider/bank-account', { bankCode: '058', accountNumber: '1112223334' }, rider2);
  await call('POST', `/admin/riders/${rid2}/adjustments`, { amount: 3000, note: 'Pilot bonus' }, admin);

  // Paystack can't be reached while sending: stays 'processing', balance stays reserved
  paystackDown = true;
  const r = await call('POST', '/rider/payouts', {}, rider2);
  assert.equal(r.body.payout.status, 'processing');
  paystackDown = false;
  // Later the checker finds Paystack never got it, and sends it again with the same reference
  await pool.query("update rider_payouts set updated_at = now() - interval '10 minutes' where rider_id = $1", [rid2]);
  const before = paystack.transfers.length;
  await reconcilePayouts();
  assert.equal(paystack.transfers.length, before + 1);
  const p = (await pool.query('select status, reference from rider_payouts where rider_id = $1', [rid2])).rows[0];
  assert.equal(p.status, 'paid');
  assert.equal(paystack.transfers.at(-1).reference, p.reference);

  // Nightly run: not before the hour (21:00 Lagos = 20:00 UTC), then once only
  await call('POST', `/admin/riders/${rid2}/adjustments`, { amount: 2500, note: 'Bonus' }, admin);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(await autoPayouts(null, { now: new Date(`${day}T10:00:00Z`) }), 0);
  const n = await autoPayouts(null, { now: new Date(`${day}T20:30:00Z`) });
  assert.ok(n >= 1);
  assert.equal((await pool.query("select count(*)::int n from rider_payouts where rider_id = $1 and trigger = 'auto'", [rid2])).rows[0].n, 1);
  await call('POST', `/admin/riders/${rid2}/adjustments`, { amount: 2500, note: 'Bonus' }, admin);
  assert.equal(await autoPayouts(null, { now: new Date(`${day}T21:30:00Z`) }), 0, 'already ran today');
  // Riders whose new account is on hold are left out (rider 1)
  assert.equal((await pool.query("select count(*)::int n from rider_payouts p join riders r on r.id = p.rider_id where r.phone = $1 and trigger = 'auto'", [RIDER])).rows[0].n, 0);
});
