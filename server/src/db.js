import pg from 'pg';
import { config } from './config.js';

// Return Postgres bigint/numeric as JS numbers (amounts here are small).
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

// Can our database user switch into the `anon` / `authenticated` roles from 001_auth.sql?
// Some managed hosts (e.g. where the user can't create roles) don't allow it.
let rolesReady;
export function rolesAvailable() {
  rolesReady ??= pool
    .query(
      `select coalesce(bool_and(pg_has_role(current_user, r.oid, 'MEMBER')), false) and count(*) = 2 as ok
       from pg_roles r where r.rolname in ('anon', 'authenticated')`)
    .then((r) => r.rows[0].ok)
    .catch(() => false);
  return rolesReady;
}

/**
 * Run queries as a signed-in user (or as a visitor when userId is null).
 * When the database roles exist, row level security in the database decides what they can see and
 * change. Either way, every query in the API also filters by auth.uid() itself, so data stays
 * private on hosts without those roles.
 */
export async function asUser(userId, fn) {
  const useRoles = await rolesAvailable();
  const client = await pool.connect();
  try {
    await client.query('begin');
    if (useRoles) await client.query(userId ? 'set local role authenticated' : 'set local role anon');
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
