import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool } from '../db.js';

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(here, '../../sql/001_init.sql');

try {
  const sql = await readFile(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('Database migration completed.');
} finally {
  await pool.end();
}
