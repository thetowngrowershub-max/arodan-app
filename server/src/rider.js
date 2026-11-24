// Rider app endpoints. Every action is a database function that checks the signed-in user
// is a vetted rider allowed to touch the order (db/migrations/004_riders.sql).
import { asUser } from './db.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function toRiderProfile(r) {
  return {
    id: r.id,
    name: r.display_name,
    phone: r.phone,
    vehicle: r.vehicle,
    plate: r.plate,
    rating: Number(r.rating),
    trips: r.trips,
    online: r.is_online,
    checks: { nin: r.nin_verified, guarantor: r.guarantor_confirmed, address: r.address_visited },
    vetted: r.active && r.nin_verified && r.guarantor_confirmed && r.address_visited,
  };
}

export function registerRiderRoutes(app, { auth, HttpError }) {
  const jobId = (req) => {
    if (!UUID.test(req.params.id)) throw new HttpError(404, 'Job not found');
    return req.params.id;
  };
  const one = async (db, sql, args = []) => (await db.query(sql, args)).rows[0];
  const activeJob = async (db) => (await one(db, 'select rider_current_job() as j')).j;

  // Who am I as a rider, plus my job in progress. 403 for accounts that are not riders.
  app.get('/rider/me', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => {
      const r = await one(db, 'select (current_rider()).*');
      return { rider: toRiderProfile(r), activeJob: await activeJob(db) };
    }));

  app.post('/rider/online', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => {
      const online = req.body?.online === true;
      const r = await one(db, 'select (rider_set_online($1, $2, $3)).*', [online, num(req.body?.lat), num(req.body?.lng)]);
      return { rider: toRiderProfile(r) };
    }));

  // The app sends this every ~15 seconds while online or on a job.
  app.post('/rider/location', { preHandler: auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const lat = num(req.body?.lat);
    const lng = num(req.body?.lng);
    if (lat === null || lng === null) throw new HttpError(400, 'Location is required');
    await asUser(req.uid, (db) => db.query('select rider_update_location($1, $2, $3, $4)', [lat, lng, num(req.body?.heading), num(req.body?.speed)]));
    return { ok: true };
  });

  // Jobs on offer to this rider (empty while offline or busy).
  app.get('/rider/jobs', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => (await one(db, 'select rider_open_jobs() as j')).j));

  app.get('/rider/job', { preHandler: auth }, async (req) => asUser(req.uid, async (db) => ({ job: await activeJob(db) })));

  app.post('/rider/jobs/:id/accept', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => (await one(db, 'select rider_accept_job($1) as j', [jobId(req)])).j));

  app.post('/rider/jobs/:id/decline', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => {
      await db.query('select rider_decline_job($1)', [jobId(req)]);
      return { ok: true };
    }));

  app.post('/rider/jobs/:id/release', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => {
      await db.query('select rider_release_job($1)', [jobId(req)]);
      return { ok: true };
    }));

  app.post('/rider/jobs/:id/status', { preHandler: auth }, async (req) => {
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    if (!['picked_up', 'on_the_way', 'at_gate'].includes(status)) throw new HttpError(400, 'Unknown step');
    return asUser(req.uid, async (db) => (await one(db, 'select rider_advance_job($1, $2) as j', [jobId(req), status])).j);
  });

  // Proof of delivery: { method: 'code', code } or { method: 'photo', photo: <base64 JPEG> }.
  // Photos can be up to ~1 MB, so this route allows a bigger body than the rest of the API.
  app.post('/rider/jobs/:id/deliver', { preHandler: auth, bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const b = req.body ?? {};
    const method = b.method === 'photo' ? 'photo' : b.method === 'code' ? 'code' : null;
    if (!method) throw new HttpError(400, 'Choose code or photo');
    let photo = null;
    if (method === 'photo') {
      const raw = typeof b.photo === 'string' ? b.photo.replace(/^data:image\/\w+;base64,/, '') : '';
      photo = Buffer.from(raw, 'base64');
      // JPEG files start with FF D8 FF.
      if (photo.length < 1000 || photo[0] !== 0xff || photo[1] !== 0xd8 || photo[2] !== 0xff) throw new HttpError(400, 'Take a photo of the package at the door');
    }
    const code = method === 'code' ? String(b.code ?? '').replace(/\D/g, '').slice(0, 8) : null;
    const cash = Number.isInteger(b.cashCollected) ? b.cashCollected : null;
    return asUser(req.uid, async (db) => {
      const r = (await one(db, 'select rider_complete_job($1, $2, $3, $4, $5, $6, $7, $8) as j',
        [jobId(req), method, code, photo, typeof b.note === 'string' ? b.note : '', cash, num(b.lat), num(b.lng)])).j;
      if (!r.ok) throw new HttpError(400, r.error);
      return r;
    });
  });

  app.get('/rider/earnings', { preHandler: auth }, async (req) =>
    asUser(req.uid, async (db) => (await one(db, 'select rider_earnings_summary() as j')).j));
}
