// Loads the starter catalogue, prices and demo riders (db/seed.sql). Safe to re-run.
// With --if-empty it does nothing once a catalogue exists (used on every server start).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../src/db.js';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/seed.sql');
const ifEmpty = process.argv.includes('--if-empty');
const { rows } = await pool.query('select count(*)::int as n from categories');
if (ifEmpty && rows[0].n > 0) {
  console.log('Catalogue already loaded; seed skipped');
} else {
  await pool.query(await readFile(file, 'utf8'));
  console.log('Seed data loaded');
}
await pool.end();
