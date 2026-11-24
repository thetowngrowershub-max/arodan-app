// Paystack API calls used for rider payouts: bank list, account name check, transfer recipients,
// transfers and their status. Docs: https://paystack.com/docs/transfers/
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { HttpError } from './http.js';

export const paystackEnabled = () => Boolean(config.paystack.secretKey);

export class PaystackError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status; // HTTP status from Paystack; 0 when Paystack could not be reached
    this.body = body;
  }
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(config.paystack.baseUrl + path, {
      method,
      headers: { authorization: `Bearer ${config.paystack.secretKey}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new PaystackError(0, `Paystack could not be reached: ${e.message}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === false) throw new PaystackError(res.status, data.message ?? `Paystack error ${res.status}`, data);
  return data.data;
}

// Banks change rarely; keep the list for a day.
let banksCache = null;
export async function listBanks() {
  if (banksCache && banksCache.at > Date.now() - 24 * 3600_000) return banksCache.banks;
  const banks = [];
  let next = '';
  for (let page = 0; page < 10; page++) {
    const res = await fetch(`${config.paystack.baseUrl}/bank?country=nigeria&currency=NGN&type=nuban&perPage=100&use_cursor=true${next ? `&next=${encodeURIComponent(next)}` : ''}`,
      { headers: { authorization: `Bearer ${config.paystack.secretKey}` }, signal: AbortSignal.timeout(20_000) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(data.data)) throw new PaystackError(res.status, data.message ?? 'Could not load banks');
    for (const b of data.data) if (b.active !== false && !b.is_deleted && b.code) banks.push({ code: String(b.code), name: b.name });
    next = data.meta?.next ?? '';
    if (!next) break;
  }
  banks.sort((a, b) => a.name.localeCompare(b.name));
  banksCache = { at: Date.now(), banks };
  return banks;
}
export const clearBankCache = () => { banksCache = null; };

/** Account holder's name for a NUBAN account number, as the bank has it. */
export async function resolveAccount(accountNumber, bankCode) {
  try {
    const d = await call('GET', `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
    return { accountName: d.account_name, accountNumber: d.account_number };
  } catch (e) {
    if (e.status === 0 || e.status >= 500) throw new HttpError(503, 'Could not check the account right now. Try again in a minute.');
    throw new HttpError(400, 'That account number and bank do not match. Check them and try again.');
  }
}

export async function createRecipient({ name, accountNumber, bankCode, riderId }) {
  const d = await call('POST', '/transferrecipient', {
    type: 'nuban', name, account_number: accountNumber, bank_code: bankCode, currency: 'NGN',
    description: 'Arodan rider', metadata: { riderId },
  });
  return d.recipient_code;
}

/** Start a transfer. amount in Naira. Returns { status, transferCode } (status as Paystack gives it). */
export async function initiateTransfer({ amount, recipient, reference, reason }) {
  const d = await call('POST', '/transfer', { source: 'balance', amount: amount * 100, currency: 'NGN', recipient, reference, reason });
  return { status: d.status, transferCode: d.transfer_code };
}

/** Status of a transfer we started, by our reference. null if Paystack has no such transfer. */
export async function verifyTransfer(reference) {
  try {
    const d = await call('GET', `/transfer/verify/${encodeURIComponent(reference)}`);
    return { status: d.status, transferCode: d.transfer_code, reason: d.reason ?? null };
  } catch (e) {
    if (e.status === 404 || e.status === 400) return null;
    throw e;
  }
}

/** Paystack status → our payout status. */
export function payoutStatus(paystackStatus) {
  if (paystackStatus === 'success') return 'paid';
  if (['failed', 'reversed', 'abandoned', 'rejected', 'blocked'].includes(paystackStatus)) return 'failed';
  return 'processing'; // pending, queued, received, otp
}

/** Webhook signature: HMAC-SHA512 of the raw body with the secret key, in x-paystack-signature. */
export function validSignature(rawBody, signature) {
  if (!config.paystack.secretKey || typeof signature !== 'string') return false;
  const expected = createHmac('sha512', config.paystack.secretKey).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
