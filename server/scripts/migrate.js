// Applies db/migrations/*.sql in order, once each. Safe to run on every deploy.
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../src/db.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/migrations');
const client = await pool.connect();
try {
  await client.query('create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())');
  await client.query('select pg_advisory_lock(424242)');
  const done = new Set((await client.query('select name from schema_migrations')).rows.map((r) => r.name));
  for (const f of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    console.log(`Applying ${f}`);
    await client.query('begin');
    try {
      await client.query(await readFile(path.join(dir, f), 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [f]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    }
  }
  console.log('Database is up to date');
} finally {
  client.release();
  await pool.end();
}
