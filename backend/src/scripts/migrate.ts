import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool } from '../db.js';

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = resolve(here, '../../sql');

const client = await pool.connect();
try {
  await client.query('SELECT pg_advisory_lock(72603107)');
  await client.query('CREATE TABLE IF NOT EXISTS duecase_schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const migrationFiles = (await readdir(sqlDir))
    .filter((file) => /^\d+.*\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));

  if (migrationFiles.length === 0) {
    throw new Error(`No SQL migrations found in ${sqlDir}`);
  }

  for (const file of migrationFiles) {
    const applied = await client.query('SELECT 1 FROM duecase_schema_migrations WHERE name = $1', [file]);
    if (applied.rowCount) continue;
    const sql = await readFile(resolve(sqlDir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO duecase_schema_migrations(name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    console.log(`Database migration completed: ${file}`);
  }
} finally {
  await client.query('SELECT pg_advisory_unlock(72603107)');
  client.release();
  await pool.end();
}
