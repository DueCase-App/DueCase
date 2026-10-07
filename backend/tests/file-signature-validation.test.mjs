import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

await test('uploaded file signatures match their declared MIME types', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    const sqlDir = new URL('../sql/', import.meta.url);
    const migrations = (await readdir(sqlDir)).filter((name) => name.endsWith('.sql')).sort();
    for (const file of migrations) await db.exec(await readFile(new URL(file, sqlDir), 'utf8'));

    async function valid(hex, mime) {
      const { rows } = await db.query(
        `SELECT duecase_file_signature_valid(decode($1,'hex'),$2) AS valid`,
        [hex, mime],
      );
      return rows[0].valid;
    }

    assert.equal(await valid(Buffer.from('%PDF-1.7 test').toString('hex'), 'application/pdf'), true);
    assert.equal(await valid(Buffer.from('not a pdf').toString('hex'), 'application/pdf'), false);
    assert.equal(await valid('ffd8ff001122', 'image/jpeg'), true);
    assert.equal(await valid('89504e470d0a1a0a0000', 'image/png'), true);
    assert.equal(await valid(Buffer.from('RIFFxxxxWEBP').toString('hex'), 'image/webp'), true);
    assert.equal(await valid('00000018667479706865696300000000', 'image/heic'), true);
    assert.equal(await valid(Buffer.from('fake-image').toString('hex'), 'image/png'), false);
    assert.equal(await valid(Buffer.from('%PDF-1.4').toString('hex'), 'application/octet-stream'), false);
    const { rows } = await db.query(`SELECT duecase_file_signature_valid(NULL,NULL) AS valid`);
    assert.equal(rows[0].valid, true);
  } finally {
    await db.close();
  }
});
