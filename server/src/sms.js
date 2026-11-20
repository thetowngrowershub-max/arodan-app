import { config } from './config.js';

/** Sends a text message through Termii. Without an API key it only logs (for local testing). */
export async function sendSms(phone, message, log) {
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
