// Push notifications. The database queues messages in push_outbox (db/migrations/006_push.sql);
// sendPendingPush() delivers them through Expo's push service to every phone the user is signed in on.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/
import { asUser, pool } from './db.js';
import { config } from './config.js';
import { HttpError, str } from './http.js';

const APPS = ['customer', 'rider', 'merchant'];
const MAX_ATTEMPTS = 5;

export function pushRoutes(app, { auth }) {
  // { token: 'ExponentPushToken[…]', app: 'customer' | 'rider' | 'merchant', platform: 'ios' | 'android' }
  app.post('/push/register', { preHandler: auth }, async (req) => {
    const token = str(req.body?.token, 250);
    const which = str(req.body?.app, 20);
    const platform = str(req.body?.platform, 10);
    if (!APPS.includes(which)) throw new HttpError(400, 'Unknown app');
    await asUser(req.uid, (db) => db.query('select register_push_token($1, $2, $3)', [token, which, ['ios', 'android', 'web'].includes(platform) ? platform : '']));
    return { ok: true };
  });

  app.post('/push/unregister', { preHandler: auth }, async (req) => {
    await asUser(req.uid, (db) => db.query('select unregister_push_token($1)', [str(req.body?.token, 250)]));
    return { ok: true };
  });
}

/**
 * Send up to 100 queued messages. Returns how many were handled.
 * Rows are locked while sending, so several servers can run this at once without double sends.
 */
export async function sendPendingPush() {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(
      `select o.id, o.title, o.body, o.data, o.app, coalesce(array_agg(t.token) filter (where t.token is not null), '{}') as tokens
       from (select * from push_outbox where sent_at is null and attempts < $1 and created_at > now() - interval '1 hour'
             order by id limit 100 for update skip locked) o
       left join push_tokens t on t.user_id = o.user_id and t.app = o.app
       group by o.id, o.title, o.body, o.data, o.app order by o.id`, [MAX_ATTEMPTS]);
    if (!rows.length) {
      await client.query('commit');
      return 0;
    }
    const messages = [];
    for (const r of rows) {
      for (const to of r.tokens) {
        messages.push({ outboxId: r.id, msg: {
          to, title: r.title, body: r.body, data: r.data, sound: 'default', priority: 'high',
          channelId: r.app === 'rider' && r.data?.type === 'job' ? 'jobs' : 'orders',
        } });
      }
    }
    const failed = new Map(); // outbox id → error
    const deadTokens = [];
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      try {
        const res = await fetch(config.push.expoUrl, {
          method: 'POST',
          headers: {
            'content-type': 'application/json', accept: 'application/json',
            ...(config.push.expoAccessToken ? { authorization: `Bearer ${config.push.expoAccessToken}` } : {}),
          },
          body: JSON.stringify(batch.map((m) => m.msg)),
          signal: AbortSignal.timeout(15_000),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(data.data)) throw new Error(data.errors?.[0]?.message ?? `Expo push error ${res.status}`);
        data.data.forEach((ticket, j) => {
          if (ticket?.status !== 'error') return;
          // The app was removed or notifications turned off: forget that phone. Not worth retrying.
          if (ticket.details?.error === 'DeviceNotRegistered') deadTokens.push(batch[j].msg.to);
        });
      } catch (e) {
        for (const m of batch) failed.set(m.outboxId, e.message);
      }
    }
    if (deadTokens.length) await client.query('delete from push_tokens where token = any($1)', [deadTokens]);
    for (const r of rows) {
      if (failed.has(r.id)) {
        await client.query('update push_outbox set attempts = attempts + 1, error = $2 where id = $1', [r.id, failed.get(r.id).slice(0, 300)]);
      } else {
        await client.query('update push_outbox set attempts = attempts + 1, sent_at = now(), error = $2 where id = $1',
          [r.id, r.tokens.length ? null : 'no phone registered']);
      }
    }
    await client.query('commit');
    return rows.length;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Old sent messages are not needed; keep a week for troubleshooting. */
export const prunePushOutbox = () => pool.query("delete from push_outbox where created_at < now() - interval '7 days'");
