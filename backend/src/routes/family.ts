import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
});

const joinSchema = z.object({
  inviteCode: z.string().trim().min(6).max(20).transform((value) => value.toUpperCase()),
});

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(length = 10): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index] ?? 0;
    code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  }
  return code;
}

async function insertFamilyWithUniqueCode(client: import('pg').PoolClient, id: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteCode = generateInviteCode();
    try {
      await client.query(
        `INSERT INTO families (id, name, invite_code) VALUES ($1, $2, $3)`,
        [id, name, inviteCode],
      );
      return inviteCode;
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
        continue;
      }
      throw error;
    }
  }
  throw new ApiError(500, 'Unable to generate a unique family code');
}

router.post('/create', asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  const body = createSchema.parse(req.body ?? {});
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query<{
      id: string;
      familyId: string | null;
      displayName: string;
      role: 'father' | 'mother';
    }>(
      `SELECT id, family_id AS "familyId", display_name AS "displayName", role
         FROM users
        WHERE id = $1
        FOR UPDATE`,
      [auth.userId],
    );

    const user = userResult.rows[0];
    if (!user) throw new ApiError(401, 'User no longer exists');
    if (user.familyId) throw new ApiError(409, 'You already belong to a family', 'ALREADY_IN_FAMILY');

    const familyId = randomUUID();
    const familyName = body.name ?? `Famiglia di ${user.displayName}`;
    const inviteCode = await insertFamilyWithUniqueCode(client, familyId, familyName);

    const updated = await client.query(
      `UPDATE users
          SET family_id = $1, updated_at = NOW()
        WHERE id = $2 AND family_id IS NULL`,
      [familyId, user.id],
    );
    if (updated.rowCount !== 1) {
      throw new ApiError(409, 'Family setup has already changed', 'FAMILY_STATE_CHANGED');
    }

    await client.query(
      `INSERT INTO parents (id, family_id, display_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET family_id = EXCLUDED.family_id,
             display_name = EXCLUDED.display_name,
             role = EXCLUDED.role`,
      [user.id, familyId, user.displayName, user.role],
    );

    await client.query('COMMIT');
    res.status(201).json({
      family: { id: familyId, name: familyName, inviteCode },
      memberCount: 1,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/join', asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  const body = joinSchema.parse(req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query<{
      id: string;
      familyId: string | null;
      displayName: string;
      role: 'father' | 'mother';
    }>(
      `SELECT id, family_id AS "familyId", display_name AS "displayName", role
         FROM users
        WHERE id = $1
        FOR UPDATE`,
      [auth.userId],
    );

    const user = userResult.rows[0];
    if (!user) throw new ApiError(401, 'User no longer exists');
    if (user.familyId) throw new ApiError(409, 'You already belong to a family', 'ALREADY_IN_FAMILY');

    const familyResult = await client.query<{ id: string; name: string; inviteCode: string }>(
      `SELECT id, name, invite_code AS "inviteCode"
         FROM families
        WHERE invite_code = $1
        FOR UPDATE`,
      [body.inviteCode],
    );

    const family = familyResult.rows[0];
    if (!family) throw new ApiError(404, 'Family code not found', 'INVALID_INVITE_CODE');

    const membersResult = await client.query<{ role: 'father' | 'mother' }>(
      `SELECT role FROM users WHERE family_id = $1 FOR UPDATE`,
      [family.id],
    );

    if (membersResult.rowCount !== null && membersResult.rowCount >= 2) {
      throw new ApiError(409, 'This family already has two parents', 'FAMILY_FULL');
    }
    if (membersResult.rows.some((member) => member.role === user.role)) {
      const roleLabel = user.role === 'father' ? 'father' : 'mother';
      throw new ApiError(409, `This family already has a ${roleLabel}`, 'ROLE_ALREADY_PRESENT');
    }

    await client.query(
      `UPDATE users SET family_id = $1, updated_at = NOW() WHERE id = $2`,
      [family.id, user.id],
    );

    await client.query(
      `INSERT INTO parents (id, family_id, display_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET family_id = EXCLUDED.family_id,
             display_name = EXCLUDED.display_name,
             role = EXCLUDED.role`,
      [user.id, family.id, user.displayName, user.role],
    );

    await client.query('COMMIT');
    res.json({
      family,
      memberCount: (membersResult.rowCount ?? membersResult.rows.length) + 1,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ApiError(409, 'The selected family role is already occupied', 'ROLE_ALREADY_PRESENT');
    }
    throw error;
  } finally {
    client.release();
  }
}));

export default router;
