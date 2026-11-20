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

/**
 * Run queries as a signed-in user (or as a visitor when userId is null).
 * Row level security in the database decides what they can see and change.
 */
export async function asUser(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(userId ? 'set local role authenticated' : 'set local role anon');
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
