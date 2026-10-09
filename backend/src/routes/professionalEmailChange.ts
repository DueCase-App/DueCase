import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { getProfessionalAuth, requireProfessionalAuth, signProfessionalAccessToken } from '../professionalAuth.js';
import { isEmailConfigured, sendProfessionalEmailChangeCode, sendProfessionalSecurityNotice } from '../services/emailService.js';
import { rateLimit } from '../services/rateLimit.js';

const router = Router();
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const codeSchema = z.string().regex(/^\d{6}$/);
const hash = (id: string, code: string) => createHmac('sha256', config.OTP_SECRET ?? config.JWT_SECRET).update(`${id}|${code}`).digest('hex');

router.post('/email-change/request', requireProfessionalAuth, rateLimit(10, 60 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  if (!isEmailConfigured()) throw new ApiError(503, 'Invio email non ancora configurato.', 'EMAIL_NOT_CONFIGURED');
  const professional = getProfessionalAuth(req);
  const newEmail = emailSchema.parse(req.body.newEmail);
  if (newEmail === professional.email.toLowerCase()) throw new ApiError(400, 'Il nuovo indirizzo coincide con quello attuale.', 'EMAIL_UNCHANGED');
  const duplicate = await pool.query(`SELECT 1 FROM professional_users WHERE LOWER(email)=$1 AND deleted_at IS NULL AND id<>$2`, [newEmail, professional.professionalId]);
  if (duplicate.rows[0]) throw new ApiError(409, 'Questo indirizzo email è già associato a un altro account professionista.', 'EMAIL_ALREADY_USED');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recent = await client.query(
      `SELECT 1 FROM professional_email_challenges WHERE professional_id=$1 AND purpose='email_change' AND created_at>NOW()-INTERVAL '1 minute'`,
      [professional.professionalId],
    );
    if (recent.rowCount) throw new ApiError(429, 'Attendi un minuto prima di richiedere un nuovo codice.', 'CODE_RATE_LIMIT');
    await client.query(`UPDATE professional_email_challenges SET consumed_at=NOW() WHERE professional_id=$1 AND purpose='email_change' AND consumed_at IS NULL`, [professional.professionalId]);
    const id = randomUUID();
    const code = String(randomInt(100000, 1000000));
    await client.query(
      `INSERT INTO professional_email_challenges(id,professional_id,purpose,code_hash,target_email,expires_at) VALUES($1,$2,'email_change',$3,$4,NOW()+INTERVAL '10 minutes')`,
      [id, professional.professionalId, hash(id, code), newEmail],
    );
    await sendProfessionalEmailChangeCode({ to: newEmail, displayName: professional.displayName, code });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  await sendProfessionalSecurityNotice({
    to: professional.email,
    displayName: professional.displayName,
    title: 'Richiesta modifica email',
    message: `È stata richiesta la modifica dell'indirizzo email del tuo account professionista verso ${newEmail}. Se non sei stato tu, cambia subito la password e contatta l'assistenza DueCase.`,
  }).catch((error) => console.error('Professional old-email security notice failed', error instanceof Error ? error.message : error));
  res.json({ message: 'Codice inviato al nuovo indirizzo email.', newEmail });
}));

router.post('/email-change/confirm', requireProfessionalAuth, rateLimit(20, 15 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const code = codeSchema.parse(req.body.code);
  const client = await pool.connect();
  let newEmail = '';
  let nextVersion = professional.tokenVersion;
  try {
    await client.query('BEGIN');
    const challengeResult = await client.query<{ id: string; code_hash: string; attempts: number; target_email: string }>(
      `SELECT id,code_hash,attempts,target_email FROM professional_email_challenges
       WHERE professional_id=$1 AND purpose='email_change' AND consumed_at IS NULL AND expires_at>NOW()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [professional.professionalId],
    );
    const challenge = challengeResult.rows[0];
    if (!challenge || challenge.attempts >= 5 || !challenge.target_email) throw new ApiError(400, 'Codice scaduto o non valido.', 'INVALID_CODE');
    const supplied = Buffer.from(hash(challenge.id, code), 'hex');
    const stored = Buffer.from(challenge.code_hash, 'hex');
    if (supplied.length !== stored.length || !timingSafeEqual(stored, supplied)) {
      await client.query('UPDATE professional_email_challenges SET attempts=attempts+1 WHERE id=$1', [challenge.id]);
      await client.query('COMMIT');
      throw new ApiError(400, 'Codice non valido.', 'INVALID_CODE');
    }
    newEmail = challenge.target_email.toLowerCase();
    const duplicate = await client.query(`SELECT 1 FROM professional_users WHERE LOWER(email)=$1 AND deleted_at IS NULL AND id<>$2`, [newEmail, professional.professionalId]);
    if (duplicate.rows[0]) throw new ApiError(409, 'Questo indirizzo email è già associato a un altro account professionista.', 'EMAIL_ALREADY_USED');
    nextVersion = professional.tokenVersion + 1;
    await client.query('UPDATE professional_email_challenges SET consumed_at=NOW() WHERE id=$1', [challenge.id]);
    await client.query('UPDATE professional_users SET email=$1,token_version=$2,updated_at=NOW() WHERE id=$3', [newEmail, nextVersion, professional.professionalId]);
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }

  await Promise.allSettled([
    sendProfessionalSecurityNotice({ to: professional.email, displayName: professional.displayName, title: 'Email account modificata', message: `L'indirizzo email del tuo account professionista DueCase è stato modificato in ${newEmail}.` }),
    sendProfessionalSecurityNotice({ to: newEmail, displayName: professional.displayName, title: 'Nuovo indirizzo email confermato', message: 'Questo indirizzo è ora associato al tuo account professionista DueCase.' }),
  ]);
  res.json({ email: newEmail, token: signProfessionalAccessToken(professional.professionalId, nextVersion) });
}));

export default router;
