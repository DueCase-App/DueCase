import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { getProfessionalAuth, requireProfessionalAuth, signProfessionalAccessToken } from '../professionalAuth.js';
import { passwordSchema } from '../services/validation.js';
import { appendProfessionalAudit, hashProfessionalInvitationToken } from '../services/professionalAccessService.js';
import { rateLimit } from '../services/rateLimit.js';

const router = Router();
const BCRYPT_ROUNDS = 12;
const tokenSchema = z.string().trim().min(32).max(200);
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const invitationSchema = z.object({ token: tokenSchema });
const registerSchema = z.object({
  token: tokenSchema,
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  organization: z.string().trim().max(160).optional(),
  password: passwordSchema,
  confirmPassword: z.string(),
}).superRefine((value, ctx) => {
  if (value.password !== value.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Le password non coincidono.' });
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });
const settingsSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  organization: z.string().trim().max(160).nullable().optional(),
  qualification: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  professionalRegister: z.string().trim().max(160).nullable().optional(),
  registrationNumber: z.string().trim().max(80).nullable().optional(),
  notifyActivity: z.boolean(),
  notifyDocuments: z.boolean(),
  notifyAccessChanges: z.boolean(),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).superRefine((value, ctx) => {
  if (value.newPassword !== value.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Le password non coincidono.' });
});


type InvitationRow = {
  id: string;
  familyId: string;
  familyName: string;
  invitedByUserId: string | null;
  inviterName: string | null;
  email: string;
  scopes: Array<'calendar'|'expenses'|'agreements'|'documents'|'dossier'|'messages'>;
  expiresAt: string;
};

async function readInvitation(rawToken: string, forUpdate = false, client: Pick<typeof pool, 'query'> = pool): Promise<InvitationRow> {
  const tokenHash = hashProfessionalInvitationToken(rawToken);
  const { rows } = await client.query<InvitationRow>(
    `SELECT i.id,
            i.family_id AS "familyId",
            f.name AS "familyName",
            i.invited_by_user_id AS "invitedByUserId",
            u.display_name AS "inviterName",
            LOWER(i.invite_email) AS email,
            i.scopes,
            i.expires_at AS "expiresAt"
       FROM professional_invitations i
       JOIN families f ON f.id = i.family_id
       LEFT JOIN users u ON u.id = i.invited_by_user_id
      WHERE i.token_hash = $1
        AND i.accepted_at IS NULL
        AND i.revoked_at IS NULL
        AND i.expires_at > NOW()
      LIMIT 1${forUpdate ? ' FOR UPDATE OF i' : ''}`,
    [tokenHash],
  );
  const invitation = rows[0];
  if (!invitation) throw new ApiError(410, 'Invito non valido, scaduto o revocato', 'PROFESSIONAL_INVITE_INVALID');
  return invitation;
}

async function attachGrant(
  client: import('pg').PoolClient,
  professionalId: string,
  invitation: InvitationRow,
): Promise<string> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM professional_access_grants
      WHERE professional_id = $1 AND family_id = $2
        AND granted_by_user_id IS NOT DISTINCT FROM $3
        AND revoked_at IS NULL
      LIMIT 1 FOR UPDATE`,
    [professionalId, invitation.familyId, invitation.invitedByUserId],
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE professional_access_grants SET scopes=$1::text[], updated_at=NOW() WHERE id=$2`,
      [invitation.scopes, existing.rows[0].id],
    );
    return existing.rows[0].id;
  }
  const grantId = randomUUID();
  await client.query(
    `INSERT INTO professional_access_grants
      (id, professional_id, family_id, granted_by_user_id, scopes)
     VALUES ($1,$2,$3,$4,$5::text[])`,
    [grantId, professionalId, invitation.familyId, invitation.invitedByUserId, invitation.scopes],
  );
  return grantId;
}

router.get('/invitation', rateLimit(60, 15 * 60 * 1000, ['GET']), asyncHandler(async (req, res) => {
  const { token } = invitationSchema.parse(req.query);
  const invitation = await readInvitation(token);
  const account = await pool.query(`SELECT 1 FROM professional_users WHERE LOWER(email)=$1 AND deleted_at IS NULL`, [invitation.email]);
  res.json({
    email: invitation.email,
    familyName: invitation.familyName,
    inviterName: invitation.inviterName,
    scopes: invitation.scopes,
    expiresAt: invitation.expiresAt,
    existingAccount: Boolean(account.rows[0]),
  });
}));

router.post('/register', rateLimit(10, 60 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  const client = await pool.connect();
  let professionalId = '';
  let grantId = '';
  let invitation: InvitationRow | null = null;
  try {
    await client.query('BEGIN');
    invitation = await readInvitation(body.token, true, client);
    const existing = await client.query(`SELECT 1 FROM professional_users WHERE LOWER(email)=$1 AND deleted_at IS NULL`, [invitation.email]);
    if (existing.rows[0]) throw new ApiError(409, 'Esiste già un account professionista con questa email. Accedi e accetta l’invito.', 'PROFESSIONAL_ACCOUNT_EXISTS');

    professionalId = randomUUID();
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    const displayName = `${body.firstName} ${body.lastName}`.trim();
    await client.query(
      `INSERT INTO professional_users
        (id,email,password_hash,display_name,first_name,last_name,organization)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [professionalId, invitation.email, passwordHash, displayName, body.firstName, body.lastName, body.organization?.trim() || null],
    );
    grantId = await attachGrant(client, professionalId, invitation);
    await client.query(`UPDATE professional_invitations SET accepted_at=NOW(), updated_at=NOW() WHERE id=$1`, [invitation.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (!invitation) throw new ApiError(500, 'Invito professionista non disponibile', 'PROFESSIONAL_INVITE_INVALID');
  await appendProfessionalAudit({
    action: 'invitation_accepted', professionalId, grantId, familyId: invitation.familyId,
    actorParentUserId: invitation.invitedByUserId, details: { invitationId: invitation.id, scopes: invitation.scopes },
  });
  res.status(201).json({
    token: signProfessionalAccessToken(professionalId, 0),
    professional: {
      id: professionalId,
      email: invitation.email,
      displayName: `${body.firstName} ${body.lastName}`.trim(),
      firstName: body.firstName,
      lastName: body.lastName,
      organization: body.organization?.trim() || null,
    },
    grantId,
  });
}));

router.post('/login', rateLimit(20, 15 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const { rows } = await pool.query<{
    id: string; email: string; passwordHash: string; displayName: string; firstName: string | null;
    lastName: string | null; organization: string | null; tokenVersion: number;
  }>(
    `SELECT id,email,password_hash AS "passwordHash",display_name AS "displayName",
            first_name AS "firstName",last_name AS "lastName",organization,token_version AS "tokenVersion"
       FROM professional_users
      WHERE LOWER(email)=$1 AND deleted_at IS NULL`,
    [body.email],
  );
  const professional = rows[0];
  if (!professional || !(await bcrypt.compare(body.password, professional.passwordHash))) {
    throw new ApiError(401, 'Email o password non corretti', 'PROFESSIONAL_INVALID_CREDENTIALS');
  }
  res.json({
    token: signProfessionalAccessToken(professional.id, professional.tokenVersion),
    professional: {
      id: professional.id, email: professional.email, displayName: professional.displayName,
      firstName: professional.firstName, lastName: professional.lastName, organization: professional.organization,
    },
  });
}));

router.post('/accept-invitation', requireProfessionalAuth, asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const { token } = invitationSchema.parse(req.body);
  const client = await pool.connect();
  let invitation: InvitationRow | null = null;
  let grantId = '';
  try {
    await client.query('BEGIN');
    invitation = await readInvitation(token, true, client);
    if (invitation.email !== professional.email.toLowerCase()) {
      throw new ApiError(403, 'Questo invito è destinato a un altro indirizzo email', 'PROFESSIONAL_INVITE_EMAIL_MISMATCH');
    }
    grantId = await attachGrant(client, professional.professionalId, invitation);
    await client.query(`UPDATE professional_invitations SET accepted_at=NOW(), updated_at=NOW() WHERE id=$1`, [invitation.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  if (!invitation) throw new ApiError(500, 'Invito professionista non disponibile', 'PROFESSIONAL_INVITE_INVALID');
  await appendProfessionalAudit({
    action: 'invitation_accepted', professionalId: professional.professionalId, grantId,
    familyId: invitation.familyId, actorParentUserId: invitation.invitedByUserId,
    details: { invitationId: invitation.id, scopes: invitation.scopes },
  });
  res.json({ grantId, familyName: invitation.familyName, scopes: invitation.scopes });
}));

router.get('/me', requireProfessionalAuth, asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const { rows } = await pool.query(
    `SELECT id,email,display_name AS "displayName",first_name AS "firstName",last_name AS "lastName",organization,
            qualification,phone,professional_register AS "professionalRegister",registration_number AS "registrationNumber",
            notify_activity AS "notifyActivity",notify_documents AS "notifyDocuments",notify_access_changes AS "notifyAccessChanges"
       FROM professional_users WHERE id=$1 AND deleted_at IS NULL`,
    [professional.professionalId],
  );
  if (!rows[0]) throw new ApiError(404, 'Account professionista non trovato', 'PROFESSIONAL_NOT_FOUND');
  res.json(rows[0]);
}));

router.patch('/me', requireProfessionalAuth, asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const body = settingsSchema.parse(req.body);
  const displayName = `${body.firstName} ${body.lastName}`.trim();
  const { rows } = await pool.query(
    `UPDATE professional_users
        SET first_name=$1,last_name=$2,display_name=$3,organization=$4,qualification=$5,phone=$6,
            professional_register=$7,registration_number=$8,notify_activity=$9,notify_documents=$10,notify_access_changes=$11,updated_at=NOW()
      WHERE id=$12 AND deleted_at IS NULL
      RETURNING id,email,display_name AS "displayName",first_name AS "firstName",last_name AS "lastName",organization,
                qualification,phone,professional_register AS "professionalRegister",registration_number AS "registrationNumber",
                notify_activity AS "notifyActivity",notify_documents AS "notifyDocuments",notify_access_changes AS "notifyAccessChanges"`,
    [body.firstName, body.lastName, displayName, body.organization || null, body.qualification || null, body.phone || null,
     body.professionalRegister || null, body.registrationNumber || null, body.notifyActivity, body.notifyDocuments, body.notifyAccessChanges, professional.professionalId],
  );
  if (!rows[0]) throw new ApiError(404, 'Account professionista non trovato', 'PROFESSIONAL_NOT_FOUND');
  res.json(rows[0]);
}));

router.post('/change-password', requireProfessionalAuth, asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const body = changePasswordSchema.parse(req.body);
  const { rows } = await pool.query<{ passwordHash: string; tokenVersion: number }>(
    `SELECT password_hash AS "passwordHash",token_version AS "tokenVersion" FROM professional_users WHERE id=$1 AND deleted_at IS NULL`,
    [professional.professionalId],
  );
  const account = rows[0];
  if (!account || !(await bcrypt.compare(body.currentPassword, account.passwordHash))) {
    throw new ApiError(401, 'La password attuale non è corretta', 'PROFESSIONAL_PASSWORD_INVALID');
  }
  const passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS);
  const nextVersion = account.tokenVersion + 1;
  await pool.query(
    `UPDATE professional_users SET password_hash=$1,token_version=$2,updated_at=NOW() WHERE id=$3`,
    [passwordHash, nextVersion, professional.professionalId],
  );
  res.json({ token: signProfessionalAccessToken(professional.professionalId, nextVersion) });
}));

export default router;
