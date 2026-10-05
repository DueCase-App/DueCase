import bcrypt from 'bcrypt';
import { pool } from '../db.js';

const familyId = '00000000-0000-0000-0000-000000000001';
const fatherId = '00000000-0000-0000-0000-000000000002';
const motherId = '00000000-0000-0000-0000-000000000003';
const childId = '00000000-0000-0000-0000-000000000004';
const inviteCode = 'DEMO2026AB';

try {
  const passwordHash = await bcrypt.hash('Demo1234!', 12);
  await pool.query('BEGIN');
  await pool.query(
    `INSERT INTO families (id, name, invite_code) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET invite_code = EXCLUDED.invite_code`,
    [familyId, 'Famiglia demo', inviteCode],
  );
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, role, family_id) VALUES
       ($1, 'papa@example.com', $4, 'Papà', 'father', $3),
       ($2, 'mamma@example.com', $4, 'Mamma', 'mother', $3)
     ON CONFLICT (id) DO NOTHING`,
    [fatherId, motherId, familyId, passwordHash],
  );
  await pool.query(
    `INSERT INTO parents (id, family_id, display_name, role) VALUES
       ($1, $3, 'Papà', 'father'),
       ($2, $3, 'Mamma', 'mother')
     ON CONFLICT (id) DO NOTHING`,
    [fatherId, motherId, familyId],
  );
  await pool.query(
    `INSERT INTO children (id, family_id, display_name) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [childId, familyId, 'Figlio/a'],
  );
  await pool.query('COMMIT');
  console.log(`Demo family ready: ${familyId} / invite code ${inviteCode}`);
} catch (error) {
  await pool.query('ROLLBACK');
  throw error;
} finally {
  await pool.end();
}
