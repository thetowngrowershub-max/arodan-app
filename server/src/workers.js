// Background jobs run by the API server: sending queued push notifications, checking on rider
// payouts, and the nightly automatic payout run. Each job is safe to run on several servers at once.
import { config } from './config.js';
import { prunePushOutbox, sendPendingPush } from './push.js';
import { autoPayouts, reconcilePayouts } from './payouts.js';

function every(ms, name, fn, log) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (e) {
      log.error({ err: e, job: name }, 'Background job failed');
    } finally {
      running = false;
    }
  }, ms);
  timer.unref();
  return timer;
}

export function startWorkers(app) {
  const log = app.log;
  const timers = [];
  if (config.push.enabled) {
    // Keep sending while there is a backlog, then check again in 3 seconds.
    timers.push(every(3000, 'push', async () => { while ((await sendPendingPush()) === 100); }, log));
    timers.push(every(6 * 3600_000, 'push-prune', prunePushOutbox, log));
  }
  timers.push(every(5 * 60_000, 'payout-reconcile', () => reconcilePayouts(log), log));
  timers.push(every(5 * 60_000, 'payout-auto', () => autoPayouts(log), log));
  app.addHook('onClose', async () => timers.forEach(clearInterval));
}
