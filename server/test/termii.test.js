// Sign-in through Termii, with its API simulated (no real SMS sent).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.SMS_PROVIDER = 'termii';
process.env.TERMII_API_KEY = 'TL-test';
process.env.TEST_OTP_PHONES = '';
const PHONE = '2348071110002';

const sent = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  sent.push({ url, body: JSON.parse(opts.body) });
  return new Response('{"message_id":"1","message":"Successfully Sent"}', { status: 200 });
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

test('Termii texts a 6-digit code that then signs the user in', async () => {
  const r = await app.inject({ method: 'POST', url: '/auth/otp', payload: { phone: '08071110002' } });
  assert.equal(r.statusCode, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.ng.termii.com/api/sms/send');
  assert.equal(sent[0].body.to, PHONE);
  const code = sent[0].body.sms.match(/\b(\d{6})\b/)[1];
  const v = await app.inject({ method: 'POST', url: '/auth/verify', payload: { phone: PHONE, code } });
  assert.equal(v.statusCode, 200);
  assert.ok(v.json().token);
});
