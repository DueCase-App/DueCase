import { config } from '../config.js';
import bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth, signAccessToken, type ParentRole } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { isValidExpoPushToken } from '../services/notificationService.js';

import { passwordSchema, dateSchema } from '../services/validation.js';
const router = Router();
const BCRYPT_ROUNDS = 12;
const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const roleSchema = z.enum(['father', 'mother']);
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const isoDateSchema = dateSchema.refine(v => v <= new Date().toISOString().slice(0,10), 'La nascita non può essere futura.');
const registrationChildSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  birthDate: isoDateSchema.nullable().optional(),
});

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(160).optional(),
  firstName: z.string().trim().min(2).max(80).optional(),
  lastName: z.string().trim().min(2).max(80).optional(),
  birthDate: isoDateSchema.optional(),
  phone: z.string().trim().min(6).max(32).optional(),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  role: roleSchema,
  familyName: z.string().trim().min(2).max(100).optional(),
  children: z.array(registrationChildSchema).max(12).optional().default([]),
  inviteOtherParent: z.boolean().optional().default(true),
}).superRefine((value, ctx) => {
  if(value.password !== value.confirmPassword) ctx.addIssue({code:'custom',path:['confirmPassword'],message:'Le password non coincidono.'});
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
  phone: string | null;
  role: ParentRole;
  familyId: string | null;
  familyName: string | null;
  inviteCode: string | null;
  passwordHash?: string;
  tokenVersion?: number;
  emailVerifiedAt?: string | null;
};

type PgMeta = {
  code?: string;
  table?: string;
  column?: string;
  constraint?: string;
};

function publicUser(row: UserRow) {
  return {
    id: row.id,
    emailVerifiedAt: row.emailVerifiedAt ?? null,
    verificationRequired: config.EMAIL_VERIFICATION_REQUIRED,
    email: row.email,
    displayName: row.displayName,
    firstName: row.firstName,
    lastName: row.lastName,
    birthDate: row.birthDate,
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

function normalizeRegisterPayload(input: unknown): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return input;
  const raw = input as Record<string, unknown>;

  const children = Array.isArray(raw.children)
    ? raw.children.map((child) => {
        if (typeof child === 'string') {
          return { displayName: child, birthDate: null };
        }
        if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
          const value = child as Record<string, unknown>;
          return {
            displayName: value.displayName ?? value.name,
            birthDate: value.birthDate ?? value.birth_date ?? null,
          };
        }
        return child;
      })
    : raw.children;

  return {
    displayName: raw.displayName,
    firstName: raw.firstName ?? raw.name,
    lastName: raw.lastName ?? raw.surname,
    birthDate: raw.birthDate ?? raw.birth_date,
    email: raw.email,
    phone: raw.phone,
    password: raw.password,
    confirmPassword: raw.confirmPassword,
    role: raw.role,
    familyName: raw.familyName ?? raw.family_name,
    children,
    inviteOtherParent: raw.inviteOtherParent ?? raw.invite_partner,
  };
}

function getPgMeta(error: unknown): PgMeta {
  if (typeof error !== 'object' || error === null) return {};
  const value = error as Record<string, unknown>;
  return {
    code: typeof value.code === 'string' ? value.code : undefined,
    table: typeof value.table === 'string' ? value.table : undefined,
    column: typeof value.column === 'string' ? value.column : undefined,
    constraint: typeof value.constraint === 'string' ? value.constraint : undefined,
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
  client: PoolClient,
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
      const meta = getPgMeta(error);
      if (meta.code === '23505') continue;
      throw error;
    }
  }

  throw new ApiError(500, 'Impossibile generare un codice famiglia univoco', 'FAMILY_CODE_GENERATION_FAILED');
}

router.post('/register', asyncHandler(async (req, res) => {
  let client: PoolClient | null = null;
  let stage = 'validate_request';
  let transactionStarted = false;
  let committed = false;

  try {
    const body = registerSchema.parse(normalizeRegisterPayload(req.body));

    stage = 'hash_password';
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    const id = randomUUID();
    const displayName = body.displayName ?? `${body.firstName ?? ''} ${body.lastName ?? ''}`.trim();

    stage = 'connect_database';
    client = await pool.connect();

    stage = 'begin_transaction';
    await client.query('BEGIN');
    transactionStarted = true;

    let familyId: string | null = null;
    let familyName: string | null = null;
    let inviteCode: string | null = null;

    if (body.familyName) {
      stage = 'create_family';
      familyId = randomUUID();
      familyName = body.familyName;
      inviteCode = await insertFamilyWithUniqueCode(client, familyId, familyName);
    }

    stage = 'create_user';
    const { rows } = await client.query<UserRow>(
      `INSERT INTO users (
         id,
         email,
         password_hash,
         display_name,
         first_name,
         last_name,
         birth_date,
         phone,
         role,
         family_id,
         invite_other_parent
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id,
                 email,
                 display_name AS "displayName",
                 first_name AS "firstName",
                 last_name AS "lastName",
                 birth_date::text AS "birthDate",
                 phone,
                 role,
                 family_id AS "familyId",
                 $12::text AS "familyName",
                 $13::text AS "inviteCode"`,
      [
        id,
        body.email,
        passwordHash,
        displayName,
        body.firstName ?? null,
        body.lastName ?? null,
        body.birthDate ?? null,
        body.phone ?? null,
        body.role,
        familyId,
        body.inviteOtherParent,
        familyName,
        inviteCode,
      ],
    );

    const user = rows[0];
    if (!user) throw new ApiError(500, 'Impossibile creare l’account', 'USER_INSERT_FAILED', { stage });

    if (familyId) {
      stage = 'create_parent_profile';
      await client.query(
        `INSERT INTO parents (id, family_id, display_name, role)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE
           SET family_id = EXCLUDED.family_id,
               display_name = EXCLUDED.display_name,
               role = EXCLUDED.role`,
        [id, familyId, displayName, body.role],
      );

      stage = 'create_children';
      for (const child of body.children) {
        await client.query(
          `INSERT INTO children (id, family_id, display_name, birth_date)
           VALUES ($1, $2, $3, $4)`,
          [randomUUID(), familyId, child.displayName, child.birthDate ?? null],
        );
      }
    }

    stage = 'create_access_token';
    const token = signAccessToken(user.id, user.tokenVersion ?? 0);

    stage = 'commit_transaction';
    await client.query('COMMIT');
    committed = true;

    res.status(201).json({
      token,
      user: publicUser(user),
    });
  } catch (error) {
    if (client && transactionStarted && !committed) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Registration rollback failed', rollbackError instanceof Error ? rollbackError.message : rollbackError);
      }
    }

    if (error instanceof z.ZodError || error instanceof ApiError) throw error;

    const meta = getPgMeta(error);
    const safeDetails: Record<string, unknown> = {
      stage,
      ...(meta.code ? { dbCode: meta.code } : {}),
      ...(meta.table ? { table: meta.table } : {}),
      ...(meta.column ? { column: meta.column } : {}),
      ...(meta.constraint ? { constraint: meta.constraint } : {}),
    };

    console.error('Registration failed', {
      ...safeDetails,
      message: error instanceof Error ? error.message : 'Unknown database error',
    });

    if (meta.code === '23505') {
      const constraint = meta.constraint?.toLowerCase() ?? '';
      if (constraint.includes('email')) {
        throw new ApiError(409, 'Esiste già un account con questa email', 'EMAIL_ALREADY_EXISTS', safeDetails);
      }
      throw new ApiError(409, 'Uno dei dati inseriti deve essere univoco ed è già presente', 'REGISTRATION_DUPLICATE_VALUE', safeDetails);
    }

    if (meta.code === '23502') {
      throw new ApiError(
        500,
        `Database non allineato: il campo obbligatorio ${meta.column ? `“${meta.column}”` : 'richiesto'} non è valorizzato`,
        'REGISTRATION_DB_NOT_NULL',
        safeDetails,
      );
    }

    if (meta.code === '23503') {
      throw new ApiError(409, 'Un dato collegato alla famiglia non è valido', 'REGISTRATION_FOREIGN_KEY_ERROR', safeDetails);
    }

    if (meta.code === '23514') {
      throw new ApiError(400, 'Uno dei dati non rispetta i vincoli previsti dal database', 'REGISTRATION_CONSTRAINT_ERROR', safeDetails);
    }

    if (meta.code === '42703' || meta.code === '42P01') {
      throw new ApiError(500, 'Schema del database non aggiornato alla versione richiesta', 'REGISTRATION_SCHEMA_MISMATCH', safeDetails);
    }

    throw new ApiError(500, 'Registrazione non riuscita per un errore del database', 'REGISTRATION_DB_ERROR', safeDetails);
  } finally {
    client?.release();
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
            u.phone,
            u.role,
            u.family_id AS "familyId", u.token_version AS "tokenVersion", u.email_verified_at AS "emailVerifiedAt",
            f.name AS "familyName",
            f.invite_code AS "inviteCode"
       FROM users u
       LEFT JOIN families f ON f.id = u.family_id
      WHERE u.deleted_at IS NULL AND LOWER(u.email) = $1`,
    [body.email],
  );

  const user = rows[0];
  if (!user?.passwordHash || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new ApiError(401, 'Email o password non corretti', 'INVALID_CREDENTIALS');
  }

  res.json({
    token: signAccessToken(user.id, user.tokenVersion ?? 0),
    user: publicUser(user),
  });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  res.json({
    id: auth.userId,
    emailVerifiedAt: auth.emailVerifiedAt,
    verificationRequired: config.EMAIL_VERIFICATION_REQUIRED,
    email: auth.email,
    displayName: auth.displayName,
    firstName: auth.firstName,
    lastName: auth.lastName,
    birthDate: auth.birthDate,
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

router.get('/push-status',requireAuth,asyncHandler(async(req,res)=>{const {rows}=await pool.query('SELECT expo_push_token IS NOT NULL AS registered FROM users WHERE id=$1',[getAuth(req).userId]);res.json({registered:Boolean(rows[0]?.registered)});}));

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
