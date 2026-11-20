// Sign-in through Message Central, with its API simulated (no real SMS sent).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SMS_PROVIDER = 'messagecentral';
process.env.MESSAGECENTRAL_CUSTOMER_ID = 'C-TEST';
process.env.MESSAGECENTRAL_PASSWORD = 'secret';
process.env.TEST_OTP_PHONES = '';

const PHONE = '2348071110001';
const calls = [];
let tokenIssued = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  calls.push({ path: u.pathname, params: Object.fromEntries(u.searchParams), headers: opts.headers, method: opts.method ?? 'GET' });
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (u.pathname === '/auth/v1/authentication/token') return json(200, { status: 200, token: `tok${++tokenIssued}` });
  // First send call pretends the token expired, to check we refresh and retry.
  if (u.pathname === '/verification/v3/send') {
    if (tokenIssued === 1) return json(401, {});
    return json(200, { responseCode: 200, message: 'SUCCESS', data: { verificationId: '98765', responseCode: '200', timeout: '60' } });
  }
  if (u.pathname === '/verification/v3/validateOtp') {
    if (u.searchParams.get('code') === '4321')
      return json(200, { responseCode: 200, message: 'SUCCESS', data: { verficationId: '98765', responseCode: '200', verificationStatus: 'VERIFICATION_COMPLETED' } });
    return json(400, { responseCode: 702, message: 'WRONG_OTP_PROVIDED', data: { responseCode: '702', verificationStatus: 'VERIFICATION_FAILED' } });
  }
  return json(404, {});
};

const { buildApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');
let app;
before(async () => {
  app = await buildApp({ logger: false });
  await pool.query('delete from auth.users where phone = $1', [PHONE]);
  await pool.query('delete from auth.otp_codes where phone = $1', [PHONE]);
});
after(async () => {
  globalThis.fetch = realFetch;
  await app.close();
  await pool.end();
});

const post = async (url, payload) => {
  const r = await app.inject({ method: 'POST', url, payload });
  return { status: r.statusCode, body: r.json() };
};

test('Message Central sends, rejects a wrong code and accepts the right one', async () => {
  const sent = await post('/auth/otp', { phone: '0807 111 0001' });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const send = calls.filter((c) => c.path === '/verification/v3/send').at(-1);
  assert.deepEqual(
    { countryCode: send.params.countryCode, mobileNumber: send.params.mobileNumber, flowType: send.params.flowType, method: send.method },
    { countryCode: '234', mobileNumber: '8071110001', flowType: 'SMS', method: 'POST' });
  assert.equal(send.headers.authToken, 'tok2'); // refreshed after the 401
  const auth = calls.find((c) => c.path === '/auth/v1/authentication/token');
  assert.equal(auth.params.key, Buffer.from('secret').toString('base64'));

  const wrong = await post('/auth/verify', { phone: PHONE, code: '0000' });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /not right/);

  const ok = await post('/auth/verify', { phone: PHONE, code: '4321' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.ok(ok.body.token);
  const v = calls.filter((c) => c.path === '/verification/v3/validateOtp').at(-1);
  assert.equal(v.params.verificationId, '98765');
});
