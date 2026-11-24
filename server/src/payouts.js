// Rider bank payouts through Paystack transfers (db/migrations/007_payouts.sql).
//
//  * Riders add a bank account: we ask Paystack for the account holder's name, the rider confirms it,
//    and we save a Paystack transfer recipient.
//  * Payouts: the rider taps Withdraw, or the nightly run pays everyone due. The database reserves the
//    balance first (rider_payout_create), then Paystack is asked to send it, then the result is recorded.
//  * If we don't hear back (network trouble, server restart), reconcilePayouts() asks Paystack later.
//    Paystack refuses a reused reference, so asking again can never pay twice.
//  * Paystack's webhook (POST /paystack/webhook) tells us when a transfer succeeds, fails or is reversed.
import { asUser, pool } from './db.js';
import { config } from './config.js';
import { HttpError, str, UUID } from './http.js';
import {
  createRecipient, initiateTransfer, listBanks, paystackEnabled, payoutStatus, resolveAccount, validSignature, verifyTransfer,
} from './paystack.js';

const NOT_SET_UP = 'Bank payouts are not switched on yet. Your earnings are safe in your balance.';

// Paystack bank codes for the most used banks, shown while payouts are not switched on.
const COMMON_BANKS = [
  { code: '044', name: 'Access Bank' }, { code: '011', name: 'First Bank of Nigeria' }, { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' }, { code: '50211', name: 'Kuda Bank' }, { code: '50515', name: 'Moniepoint MFB' },
  { code: '999992', name: 'OPay Digital Services Limited (OPay)' }, { code: '999991', name: 'PalmPay' }, { code: '232', name: 'Sterling Bank' },
  { code: '033', name: 'United Bank For Africa' }, { code: '035', name: 'Wema Bank' }, { code: '057', name: 'Zenith Bank' },
];

/** The signed-in user's rider id (raises if they are not a rider). */
const riderId = (uid) => asUser(uid, async (db) => (await db.query('select (current_rider()).id as id')).rows[0].id);

const wallet = (uid) => asUser(uid, async (db) => ({
  ...(await db.query('select rider_wallet() as w')).rows[0].w,
  payoutsEnabled: paystackEnabled(),
}));

function bankInput(body) {
  const bankCode = str(body?.bankCode, 10);
  const accountNumber = str(body?.accountNumber, 20).replace(/\s/g, '');
  if (!/^\d{3,6}$/.test(bankCode)) throw new HttpError(400, 'Choose your bank');
  if (!/^\d{10}$/.test(accountNumber)) throw new HttpError(400, 'Account numbers have 10 digits');
  return { bankCode, accountNumber };
}

async function bankName(code) {
  const banks = paystackEnabled() ? await listBanks() : COMMON_BANKS;
  const b = banks.find((x) => x.code === code);
  if (!b) throw new HttpError(400, 'Choose your bank');
  return b.name;
}

/**
 * Send one reserved payout to Paystack and record the answer.
 * Unclear answers (no reply, Paystack down) leave it 'processing' for reconcilePayouts().
 */
export async function sendPayout(p, log) {
  await pool.query('update rider_payouts set attempts = attempts + 1 where id = $1', [p.id]);
  try {
    const t = await initiateTransfer({ amount: p.amount, recipient: p.recipient_code, reference: p.reference, reason: 'Arodan rider earnings' });
    const s = payoutStatus(t.status);
    if (t.status === 'otp') log?.error({ payout: p.id }, 'Paystack wants an OTP for transfers. Turn off "Confirm transfers before sending" in Paystack settings.');
    return (await pool.query('select row_to_json(rider_payout_finish($1, $2, $3, $4)) as p', [p.id, s, t.transferCode, s === 'failed' ? 'Transfer was refused' : null])).rows[0].p;
  } catch (e) {
    // Paystack answered with a clear "no" (e.g. not enough balance): the transfer was not created.
    if (e.status >= 400 && e.status < 500 && !/duplicate|already/i.test(e.message)) {
      log?.warn({ payout: p.id, err: e.message }, 'Paystack refused the payout');
      return (await pool.query('select row_to_json(rider_payout_finish($1, $2, null, $3)) as p', [p.id, 'failed', friendlyReason(e.message)])).rows[0].p;
    }
    log?.warn({ payout: p.id, err: e.message }, 'Payout result unknown, will check with Paystack');
    return p;
  }
}

function friendlyReason(msg) {
  if (/balance/i.test(msg)) return 'Arodan could not send this payout right now. It will be retried.';
  if (/recipient|account/i.test(msg)) return 'The bank account was refused. Check your bank details.';
  return 'The transfer did not go through';
}

/** Reserve the rider's balance and send it. Raises a 400 with the reason if a payout can't happen now. */
export async function payRider(rider, trigger, log) {
  if (!paystackEnabled()) throw new HttpError(503, NOT_SET_UP);
  const p = (await pool.query('select row_to_json(rider_payout_create($1, $2)) as p', [rider, trigger])).rows[0].p;
  return sendPayout(p, log);
}

/** Payouts still 'processing' after a few minutes: ask Paystack what happened. */
export async function reconcilePayouts(log) {
  if (!paystackEnabled()) return 0;
  const { rows } = await pool.query(
    `select row_to_json(p) as p from rider_payouts p where status = 'processing' and updated_at < now() - interval '3 minutes' order by created_at limit 20`);
  for (const { p } of rows) {
    try {
      const t = await verifyTransfer(p.reference);
      if (!t) {
        // Paystack never got it: safe to send again with the same reference.
        if (p.attempts < 5) await sendPayout(p, log);
        else await pool.query('select rider_payout_finish($1, $2, null, $3)', [p.id, 'failed', 'Could not reach the bank']);
        continue;
      }
      const s = payoutStatus(t.status);
      if (s === 'processing') await pool.query('update rider_payouts set updated_at = now(), transfer_code = coalesce($2, transfer_code) where id = $1', [p.id, t.transferCode]);
      else await pool.query('select rider_payout_finish($1, $2, $3, $4)', [p.id, s, t.transferCode, s === 'failed' ? (t.reason || 'Transfer failed') : null]);
    } catch (e) {
      log?.warn({ payout: p.id, err: e.message }, 'Could not check payout');
    }
  }
  return rows.length;
}

/** Hour of day in Lagos (UTC+1, no daylight saving). */
const lagosNow = (d = new Date()) => new Date(d.getTime() + 3600_000);

/**
 * The nightly automatic payout: once a day, at pricing_config.config.riderPayout.autoPayoutHour (Lagos time),
 * pay every rider whose balance reached the minimum. Set autoPayoutHour to null to turn it off.
 * Returns the number of payouts started (0 if it isn't time yet or already ran today).
 */
export async function autoPayouts(log, { now = new Date(), force = false } = {}) {
  if (!paystackEnabled()) return 0;
  const c = (await pool.query("select config -> 'riderPayout' as c from pricing_config where id = 1")).rows[0]?.c ?? {};
  const hour = 'autoPayoutHour' in c ? c.autoPayoutHour : 21;
  const lagos = lagosNow(now);
  if (!force) {
    if (hour === null || hour === undefined || lagos.getUTCHours() < hour) return 0;
    const day = lagos.toISOString().slice(0, 10);
    const claimed = await pool.query('insert into payout_runs (day) values ($1) on conflict do nothing returning day', [day]);
    if (!claimed.rowCount) return 0;
  }
  const { rows } = await pool.query('select riders_due_payout() as id');
  let n = 0;
  for (const { id } of rows) {
    try {
      await payRider(id, force ? 'admin' : 'auto', log);
      n++;
    } catch (e) {
      log?.warn({ rider: id, err: e.message }, 'Automatic payout skipped');
    }
  }
  log?.info({ payouts: n }, 'Automatic rider payouts done');
  return n;
}

export function payoutRoutes(app, { auth }) {
  app.get('/rider/banks', { preHandler: auth }, async () => {
    if (!paystackEnabled()) return COMMON_BANKS;
    try {
      return await listBanks();
    } catch {
      throw new HttpError(503, 'Could not load banks right now. Try again in a minute.');
    }
  });

  app.get('/rider/wallet', { preHandler: auth }, async (req) => wallet(req.uid));

  // Step 1: show the rider the name on the account so they can confirm it is theirs.
  app.post('/rider/bank-account/check', { preHandler: auth }, async (req) => {
    await riderId(req.uid);
    if (!paystackEnabled()) throw new HttpError(503, NOT_SET_UP);
    const { bankCode, accountNumber } = bankInput(req.body);
    const [name, acct] = await Promise.all([bankName(bankCode), resolveAccount(accountNumber, bankCode)]);
    return { bankCode, bankName: name, accountNumber, accountName: acct.accountName };
  });

  // Step 2: save it (checked again with the bank, never trusting a name sent by the app).
  app.put('/rider/bank-account', { preHandler: auth }, async (req) => {
    const rid = await riderId(req.uid);
    if (!paystackEnabled()) throw new HttpError(503, NOT_SET_UP);
    const { bankCode, accountNumber } = bankInput(req.body);
    const name = await bankName(bankCode);
    const acct = await resolveAccount(accountNumber, bankCode);
    let recipient;
    try {
      recipient = await createRecipient({ name: acct.accountName, accountNumber, bankCode, riderId: rid });
    } catch (e) {
      req.log.warn({ err: e.message }, 'Paystack recipient failed');
      throw new HttpError(e.status >= 400 && e.status < 500 ? 400 : 503, 'Could not save this account. Check the details or try again later.');
    }
    await pool.query('select rider_set_bank_account($1, $2, $3, $4, $5, $6)', [rid, bankCode, name, accountNumber, acct.accountName, recipient]);
    return wallet(req.uid);
  });

  // Withdraw the whole available balance now.
  app.post('/rider/payouts', { preHandler: auth }, async (req) => {
    const rid = await riderId(req.uid);
    const payout = await payRider(rid, 'rider', req.log);
    return { payout: { id: payout.id, amount: payout.amount, status: payout.status }, wallet: await wallet(req.uid) };
  });

  // ── Admins ──
  app.get('/admin/payouts', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => (await db.query('select admin_payouts($1) as p', [str(req.query?.status, 20)])).rows[0].p));

  app.get('/admin/riders/balances', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => (await db.query('select admin_rider_balances() as b')).rows[0].b));

  // { amount, note }: e.g. { amount: 12500, note: 'POD cash handed in at office' }. Negative amounts reduce the balance.
  app.post('/admin/riders/:id/adjustments', { preHandler: auth }, async (req) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'Rider not found');
    const amount = req.body?.amount;
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 5_000_000) throw new HttpError(400, 'Amount must be a whole number of Naira');
    return asUser(req.uid, async (db) =>
      (await db.query('select admin_rider_adjustment($1, $2, $3) as b', [req.params.id, amount, str(req.body?.note, 200)])).rows[0].b);
  });

  // Pay everyone due now, without waiting for the nightly run.
  app.post('/admin/payouts/run', { preHandler: auth }, async (req) => {
    await asUser(req.uid, (db) => db.query('select require_admin()'));
    if (!paystackEnabled()) throw new HttpError(503, 'Set PAYSTACK_SECRET_KEY first');
    return { started: await autoPayouts(req.log, { force: true }) };
  });

  // Paystack webhook. Needs the raw body to check the signature, so it gets its own JSON parser.
  app.register(async (scope) => {
    scope.removeContentTypeParser('application/json');
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => done(null, body));
    scope.post('/paystack/webhook', async (req, reply) => {
      if (!validSignature(req.body, req.headers['x-paystack-signature'])) return reply.status(401).send({ error: 'Bad signature' });
      let evt;
      try {
        evt = JSON.parse(req.body.toString('utf8'));
      } catch {
        return reply.status(400).send({ error: 'Bad body' });
      }
      const map = { 'transfer.success': 'paid', 'transfer.failed': 'failed', 'transfer.reversed': 'failed' };
      const status = map[evt?.event];
      const reference = evt?.data?.reference;
      if (status && typeof reference === 'string') {
        const { rows } = await pool.query('select id from rider_payouts where reference = $1', [reference]);
        if (rows[0]) {
          await pool.query('select rider_payout_finish($1, $2, $3, $4)', [rows[0].id, status, evt.data.transfer_code ?? null,
            evt.event === 'transfer.reversed' ? 'The bank sent the money back' : (evt.data.reason || 'Transfer failed')]);
        }
      }
      return { ok: true };
    });
  });
}
