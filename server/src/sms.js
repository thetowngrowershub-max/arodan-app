// Sign-in code delivery. Two providers:
//  - local:  we generate the code, store its hash, and text it through Termii (or just log it when no key is set)
//  - messagecentral: Message Central generates, sends (SMS or WhatsApp) and checks the code
import { config } from './config.js';

/** Texts a message through Termii. Without an API key it only logs (for local testing). */
export async function sendTermii(phone, message, log) {
  if (!config.termii.apiKey) {
    log.warn({ phone }, `TERMII_API_KEY not set; SMS not sent: "${message}"`);
    return;
  }
  const res = await fetch(`${config.termii.baseUrl}/api/sms/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: config.termii.apiKey,
      to: phone,
      from: config.termii.senderId,
      sms: message,
      type: 'plain',
      channel: config.termii.channel,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.error({ status: res.status, text }, 'Termii send failed');
    throw new Error('SMS could not be sent');
  }
}

// ───────── Message Central (VerifyNow) ─────────
const mc = config.messageCentral;
let mcToken = null;
let mcTokenAt = 0;
const TOKEN_MAX_AGE_MS = 6 * 3600 * 1000;

export const messageCentralEnabled = () => config.smsProvider === 'messagecentral' && !!mc.customerId && !!mc.password;

async function mcAuthToken(force = false) {
  if (!force && mcToken && Date.now() - mcTokenAt < TOKEN_MAX_AGE_MS) return mcToken;
  const q = new URLSearchParams({
    customerId: mc.customerId,
    key: Buffer.from(mc.password).toString('base64'),
    scope: 'NEW',
    country: '234',
  });
  const res = await fetch(`${mc.baseUrl}/auth/v1/authentication/token?${q}`, { headers: { accept: '*/*' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(`Message Central sign-in failed (${res.status})`);
  mcToken = data.token;
  mcTokenAt = Date.now();
  return mcToken;
}

async function mcCall(method, path, params, log) {
  for (const force of [false, true]) {
    const token = await mcAuthToken(force);
    const res = await fetch(`${mc.baseUrl}${path}?${new URLSearchParams(params)}`, { method, headers: { authToken: token, accept: '*/*' } });
    if (res.status === 401 && !force) continue; // token expired: get a new one and retry once
    const data = await res.json().catch(() => ({}));
    return { httpStatus: res.status, data };
  }
  log.error('Message Central refused our token twice');
  throw new Error('SMS service unavailable');
}

/** Asks Message Central to send a code. Returns its verificationId. phone is "234XXXXXXXXXX". */
export async function messageCentralSend(phone, log) {
  const { httpStatus, data } = await mcCall('POST', '/verification/v3/send', {
    countryCode: '234',
    flowType: mc.flowType,
    mobileNumber: phone.slice(3),
    otpLength: String(config.otpLength),
  }, log);
  const id = data?.data?.verificationId;
  if (httpStatus !== 200 || !id) {
    log.error({ httpStatus, data }, 'Message Central send failed');
    throw new Error('SMS could not be sent');
  }
  return String(id);
}

/** Checks a code with Message Central: 'ok', 'wrong' or 'expired'. */
export async function messageCentralCheck(verificationId, code, log) {
  const { httpStatus, data } = await mcCall('GET', '/verification/v3/validateOtp', { verificationId, code }, log);
  const status = data?.data?.verificationStatus;
  const rc = Number(data?.data?.responseCode ?? data?.responseCode);
  if (httpStatus === 200 && status === 'VERIFICATION_COMPLETED') return 'ok';
  if ([703, 705, 800, 505].includes(rc) || status === 'VERIFICATION_EXPIRED') return 'expired';
  if (rc !== 702 && rc !== 700) log.warn({ httpStatus, data }, 'Unexpected Message Central validate response');
  return 'wrong';
}
