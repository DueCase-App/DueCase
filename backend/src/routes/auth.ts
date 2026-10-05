import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth, signAccessToken, type ParentRole } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();
const BCRYPT_ROUNDS = 12;

const roleSchema = z.enum(['father', 'mother']);
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: z.string().min(8).max(72),
  role: roleSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  role: ParentRole;
  familyId: string | null;
  familyName: string | null;
  inviteCode: string | null;
  passwordHash?: string;
};

function publicUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    familyId: row.familyId,
    family: row.familyId ? {
      id: row.familyId,
      name: row.familyName,
      inviteCode: row.inviteCode,
    } : null,
  };
}

router.post('/register', asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  const id = randomUUID();

  try {
    const { rows } = await pool.query<UserRow>(
      `INSERT INTO users (id, email, password_hash, display_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id,
                 email,
                 display_name AS "displayName",
                 role,
                 family_id AS "familyId",
                 NULL::text AS "familyName",
                 NULL::text AS "inviteCode"`,
      [id, body.email, passwordHash, body.displayName, body.role],
    );

    const user = rows[0];
    if (!user) throw new ApiError(500, 'Unable to create account');

    res.status(201).json({
      token: signAccessToken(user.id),
      user: publicUser(user),
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ApiError(409, 'An account with this email already exists', 'EMAIL_ALREADY_EXISTS');
    }
    throw error;
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);

  const { rows } = await pool.query<UserRow>(
    `SELECT u.id,
            u.email,
            u.password_hash AS "passwordHash",
            u.display_name AS "displayName",
            u.role,
            u.family_id AS "familyId",
            f.name AS "familyName",
            f.invite_code AS "inviteCode"
       FROM users u
       LEFT JOIN families f ON f.id = u.family_id
      WHERE LOWER(u.email) = $1`,
    [body.email],
  );

  const user = rows[0];
  if (!user?.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new ApiError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  res.json({
    token: signAccessToken(user.id),
    user: publicUser(user),
  });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  res.json({
    id: auth.userId,
    email: auth.email,
    displayName: auth.displayName,
    role: auth.role,
    familyId: auth.familyId,
    family: auth.familyId ? {
      id: auth.familyId,
      name: auth.familyName,
      inviteCode: auth.inviteCode,
    } : null,
  });
}));

export default router;
