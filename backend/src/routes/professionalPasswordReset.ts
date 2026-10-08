import bcrypt from 'bcrypt';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { isEmailConfigured, sendAccountCode } from '../services/emailService.js';
import { rateLimit } from '../services/rateLimit.js';
import { passwordSchema } from '../services/validation.js';

const router = Router();
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const codeSchema = z.string().regex(/^\d{6}$/);
const hash = (id: string, code: string) => createHmac('sha256', config.OTP_SECRET ?? config.JWT_SECRET).update(`${id}|${code}`).digest('hex');

async function issueReset(professionalId: string, address: string): Promise<void> {
  if (!isEmailConfigured()) throw new ApiError(503, 'Invio email non ancora configurato.', 'EMAIL_NOT_CONFIGURED');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM professional_users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [professionalId]);
    const recent = await client.query(
      "SELECT 1 FROM professional_email_challenges WHERE professional_id=$1 AND created_at > NOW()-INTERVAL '1 minute'",
      [professionalId],
    );
    if (recent.rowCount) throw new ApiError(429, 'Attendi un minuto prima di richiedere un nuovo codice.', 'CODE_RATE_LIMIT');

    const id = randomUUID();
    const code = String(randomInt(100000, 1000000));
    await client.query(
      "UPDATE professional_email_challenges SET consumed_at=NOW() WHERE professional_id=$1 AND purpose='reset' AND consumed_at IS NULL",
      [professionalId],
    );
    await client.query(
      "INSERT INTO professional_email_challenges(id,professional_id,purpose,code_hash,expires_at) VALUES($1,$2,'reset',$3,NOW()+INTERVAL '10 minutes')",
      [id, professionalId, hash(id, code)],
    );
    await sendAccountCode(address, code, 'reset');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

router.post('/password-reset/request', rateLimit(10, 60 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  if (!isEmailConfigured()) throw new ApiError(503, 'Invio email non ancora configurato.', 'EMAIL_NOT_CONFIGURED');
  const address = emailSchema.parse(req.body.email);
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM professional_users WHERE LOWER(email)=$1 AND deleted_at IS NULL',
    [address],
  );
  if (rows[0]) {
    try {
      await issueReset(rows[0].id, address);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 429)) throw error;
    }
  }
  res.json({ message: 'Se l’indirizzo è registrato, riceverai un codice.' });
}));

router.post('/password-reset/confirm', rateLimit(20, 15 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  const input = z.object({
    email: emailSchema,
    code: codeSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  }).superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Le password non coincidono.' });
  }).parse(req.body);

  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM professional_users WHERE LOWER(email)=$1 AND deleted_at IS NULL',
    [input.email],
  );
  const professional = rows[0];
  if (!professional) throw new ApiError(400, 'Codice scaduto o non valido.', 'INVALID_CODE');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const challengeResult = await client.query<{
      id: string; code_hash: string; attempts: number;
    }>(
      "SELECT id,code_hash,attempts FROM professional_email_challenges WHERE professional_id=$1 AND purpose='reset' AND consumed_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
      [professional.id],
    );
    const challenge = challengeResult.rows[0];
    if (!challenge || challenge.attempts >= 5) throw new ApiError(400, 'Codice scaduto o non valido.', 'INVALID_CODE');

    const supplied = Buffer.from(hash(challenge.id, input.code), 'hex');
    const stored = Buffer.from(challenge.code_hash, 'hex');
    const valid = supplied.length === stored.length && timingSafeEqual(stored, supplied);
    if (!valid) {
      await client.query('UPDATE professional_email_challenges SET attempts=attempts+1 WHERE id=$1', [challenge.id]);
      await client.query('COMMIT');
      throw new ApiError(400, 'Codice non valido.', 'INVALID_CODE');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    await client.query('UPDATE professional_email_challenges SET consumed_at=NOW() WHERE id=$1', [challenge.id]);
    await client.query(
      'UPDATE professional_users SET password_hash=$2, token_version=token_version+1, updated_at=NOW() WHERE id=$1',
      [professional.id, passwordHash],
    );
    await client.query('COMMIT');
    res.json({ reset: true });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed after invalid attempt */ }
    throw error;
  } finally {
    client.release();
  }
}));

export default router;
