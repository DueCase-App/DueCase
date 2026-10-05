import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth, signAccessToken, type ParentRole } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { isValidExpoPushToken } from '../services/notificationService.js';

const router = Router();
const BCRYPT_ROUNDS = 12;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const roleSchema = z.enum(['father', 'mother']);
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const registrationChildSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  birthDate: isoDateSchema.nullable().optional(),
});

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  firstName: z.string().trim().min(2).max(80).optional(),
  lastName: z.string().trim().min(2).max(80).optional(),
  birthDate: isoDateSchema.optional(),
  taxCode: z.string().trim().transform((value) => value.toUpperCase()).refine(
    (value) => /^[A-Z0-9]{16}$/.test(value),
    'Invalid Italian tax code',
  ).optional(),
  phone: z.string().trim().min(6).max(32).optional(),
  email: emailSchema,
  password: z.string().min(8).max(72),
  role: roleSchema,
  familyName: z.string().trim().min(2).max(100).optional(),
  children: z.array(registrationChildSchema).max(12).optional().default([]),
  inviteOtherParent: z.boolean().optional().default(true),
}).superRefine((value, ctx) => {
  if (!value.displayName && (!value.firstName || !value.lastName)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['firstName'],
      message: 'First name and last name are required',
    });
  }

  if (value.children.length > 0 && !value.familyName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['familyName'],
      message: 'Family name is required when children are provided',
    });
  }
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});

const pushTokenSchema = z.object({
  expoPushToken: z.string().trim().min(1).max(255).nullable(),
});

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  taxCode: string | null;
  phone: string | null;
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
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
    taxCode: row.taxCode,
    phone: row.phone,
    role: row.role,
    familyId: row.familyId,
    family: row.familyId ? {
      id: row.familyId,
      name: row.familyName,
      inviteCode: row.inviteCode,
    } : null,
  };
}

function generateInviteCode(length = 10): string {
  const bytes = randomBytes(length);
  let code = '';
  for (let index = 0; index < length; index += 1) {
    const byte = bytes[index] ?? 0;
    code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
  }
  return code;
}

async function insertFamilyWithUniqueCode(
  client: import('pg').PoolClient,
  id: string,
  name: string,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const inviteCode = generateInviteCode();
    try {
      await client.query(
        `INSERT INTO families (id, name, invite_code)
         VALUES ($1, $2, $3)`,
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

router.post('/register', asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
  const id = randomUUID();
  const displayName = body.displayName ?? `${body.firstName ?? ''} ${body.lastName ?? ''}`.trim();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let familyId: string | null = null;
    let familyName: string | null = null;
    let inviteCode: string | null = null;

    if (body.familyName) {
      familyId = randomUUID();
      familyName = body.familyName;
      inviteCode = await insertFamilyWithUniqueCode(client, familyId, familyName);
    }

    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (
         id,
         email,
         password_hash,
         display_name,
         first_name,
         last_name,
         birth_date,
         tax_code,
         phone,
         role,
         family_id,
         invite_other_parent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id,
                 email,
                 display_name AS "displayName",
                 first_name AS "firstName",
                 last_name AS "lastName",
                 birth_date::text AS "birthDate",
                 tax_code AS "taxCode",
                 phone,
                 role,
                 family_id AS "familyId",
                 $13::text AS "familyName",
                 $14::text AS "inviteCode"`,
      [
        id,
        body.email,
        passwordHash,
        displayName,
        body.firstName ?? null,
        body.lastName ?? null,
        body.birthDate ?? null,
        body.taxCode ?? null,
        body.phone ?? null,
        body.role,
        familyId,
        body.inviteOtherParent,
        familyName,
        inviteCode,
      ],
    );

    const user = rows[0];
    if (!user) throw new ApiError(500, 'Unable to create account');

    if (familyId) {
      await client.query(
        `INSERT INTO parents (id, family_id, display_name, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET family_id = EXCLUDED.family_id,
               display_name = EXCLUDED.display_name,
               role = EXCLUDED.role`,
        [id, familyId, displayName, body.role],
      );

      for (const child of body.children) {
        await client.query(
          `INSERT INTO children (id, family_id, display_name, birth_date)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), familyId, child.displayName, child.birthDate ?? null],
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      token: signAccessToken(user.id),
      user: publicUser(user),
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      const constraint = 'constraint' in error && typeof error.constraint === 'string'
        ? error.constraint
        : '';

      if (constraint.includes('tax_code')) {
        throw new ApiError(409, 'Questo codice fiscale è già associato a un account', 'TAX_CODE_ALREADY_EXISTS');
      }

      throw new ApiError(409, 'An account with this email already exists', 'EMAIL_ALREADY_EXISTS');
    }

    throw error;
  } finally {
    client.release();
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);

  const { rows } = await pool.query<UserRow>(
    `SELECT u.id,
            u.email,
            u.password_hash AS "passwordHash",
            u.display_name AS "displayName",
            u.first_name AS "firstName",
            u.last_name AS "lastName",
            u.birth_date::text AS "birthDate",
            u.tax_code AS "taxCode",
            u.phone,
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
    firstName: auth.firstName,
    lastName: auth.lastName,
    birthDate: auth.birthDate,
    taxCode: auth.taxCode,
    phone: auth.phone,
    role: auth.role,
    familyId: auth.familyId,
    family: auth.familyId ? {
      id: auth.familyId,
      name: auth.familyName,
      inviteCode: auth.inviteCode,
    } : null,
  });
}));

router.put('/push-token', requireAuth, asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  const body = pushTokenSchema.parse(req.body);

  if (body.expoPushToken && !isValidExpoPushToken(body.expoPushToken)) {
    throw new ApiError(400, 'Expo push token non valido', 'INVALID_EXPO_PUSH_TOKEN');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (body.expoPushToken) {
      await client.query(
        `UPDATE users
            SET expo_push_token = NULL, updated_at = NOW()
          WHERE expo_push_token = $1 AND id <> $2`,
        [body.expoPushToken, auth.userId],
      );
    }

    await client.query(
      `UPDATE users
          SET expo_push_token = $1, updated_at = NOW()
        WHERE id = $2`,
      [body.expoPushToken, auth.userId],
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

export default router;
