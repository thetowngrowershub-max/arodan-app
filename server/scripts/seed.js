// Loads the starter catalogue, prices and demo riders (db/seed.sql). Safe to re-run.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../src/db.js';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/seed.sql');
await pool.query(await readFile(file, 'utf8'));
console.log('Seed data loaded');
await pool.end();
