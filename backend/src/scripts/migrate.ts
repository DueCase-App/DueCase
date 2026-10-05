import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { pool } from '../db.js';

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = resolve(here, '../../sql');

try {
  const migrationFiles = (await readdir(sqlDir))
    .filter((file) => /^\d+.*\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b));

  if (migrationFiles.length === 0) {
    throw new Error(`No SQL migrations found in ${sqlDir}`);
  }

  for (const file of migrationFiles) {
    const sql = await readFile(resolve(sqlDir, file), 'utf8');
    await pool.query(sql);
    console.log(`Database migration completed: ${file}`);
  }
} finally {
  await pool.end();
}
