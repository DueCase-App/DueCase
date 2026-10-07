import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth, requireFamily } from '../auth.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { isEmailConfigured, sendProfessionalInvitationEmail } from '../services/emailService.js';
import { rateLimit } from '../services/rateLimit.js';
import {
  appendProfessionalAudit,
  createProfessionalInvitationToken,
  hashProfessionalInvitationToken,
  professionalScopesSchema,
} from '../services/professionalAccessService.js';

const router = Router();
router.use(requireAuth);

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const inviteSchema = z.object({ email: emailSchema, scopes: professionalScopesSchema });
const updateScopesSchema = z.object({ scopes: professionalScopesSchema });
const uuidSchema = z.string().uuid();
const INVITE_DAYS = 7;

function invitationLink(rawToken: string): string {
  return `${config.SITE_URL.replace(/\/$/, '')}/professionisti/accetta?token=${encodeURIComponent(rawToken)}`;
}

async function sendInviteEmail(input: {
  to: string;
  inviterName: string;
  familyName: string;
  rawToken: string;
  scopes: string[];
  expiresAt: Date;
}): Promise<void> {
  if (!isEmailConfigured()) {
    throw new ApiError(503, 'Il servizio email DueCase non è ancora attivo', 'EMAIL_SERVICE_NOT_CONFIGURED');
  }
  try {
    await sendProfessionalInvitationEmail({
      to: input.to,
      inviterName: input.inviterName,
      familyName: input.familyName,
      inviteLink: invitationLink(input.rawToken),
      scopes: input.scopes,
      expiresAt: input.expiresAt,
    });
  } catch (error) {
    console.error('Professional invitation email failed', error instanceof Error ? error.message : error);
    throw new ApiError(503, 'Invito creato ma email non inviata. Riprova tra poco.', 'PROFESSIONAL_INVITE_EMAIL_FAILED');
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  if (!auth.familyId) { res.json({ invitations: [], grants: [] }); return; }

  const [invitations, grants] = await Promise.all([
    pool.query(
      `SELECT id,
              invite_email AS email,
              scopes,
              expires_at AS "expiresAt",
              accepted_at AS "acceptedAt",
              created_at AS "createdAt",
              CASE
                WHEN revoked_at IS NOT NULL THEN 'revoked'
                WHEN accepted_at IS NOT NULL THEN 'accepted'
                WHEN expires_at <= NOW() THEN 'expired'
                ELSE 'pending'
              END AS status
         FROM professional_invitations
        WHERE family_id = $1 AND invited_by_user_id = $2
        ORDER BY created_at DESC
        LIMIT 50`,
      [auth.familyId, auth.userId],
    ),
    pool.query(
      `SELECT g.id,
              g.scopes,
              g.created_at AS "createdAt",
              p.id AS "professionalId",
              p.email,
              p.display_name AS "displayName",
              p.organization
         FROM professional_access_grants g
         JOIN professional_users p ON p.id = g.professional_id AND p.deleted_at IS NULL
        WHERE g.family_id = $1
          AND g.granted_by_user_id = $2
          AND g.revoked_at IS NULL
        ORDER BY g.created_at DESC`,
      [auth.familyId, auth.userId],
    ),
  ]);

  res.json({ invitations: invitations.rows, grants: grants.rows });
}));

router.post('/invitations', rateLimit(10, 60 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = inviteSchema.parse(req.body);
  if (body.email === auth.email.toLowerCase()) throw new ApiError(400, 'Non puoi invitare il tuo stesso indirizzo email', 'PROFESSIONAL_INVITE_SELF');

  const parentEmail = await pool.query(`SELECT 1 FROM users WHERE family_id = $1 AND LOWER(email) = $2 AND deleted_at IS NULL`, [auth.familyId, body.email]);
  if (parentEmail.rows[0]) throw new ApiError(400, 'L’indirizzo appartiene già a un genitore della famiglia', 'PROFESSIONAL_INVITE_PARENT_EMAIL');

  const rawToken = createProfessionalInvitationToken();
  const tokenHash = hashProfessionalInvitationToken(rawToken);
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  await pool.query(
    `UPDATE professional_invitations
        SET revoked_at = NOW(), updated_at = NOW()
      WHERE family_id = $1
        AND invited_by_user_id = $2
        AND LOWER(invite_email) = $3
        AND accepted_at IS NULL
        AND revoked_at IS NULL`,
    [auth.familyId, auth.userId, body.email],
  );

  await pool.query(
    `INSERT INTO professional_invitations
      (id, family_id, invited_by_user_id, invite_email, token_hash, scopes, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6::text[],$7)`,
    [id, auth.familyId, auth.userId, body.email, tokenHash, body.scopes, expiresAt],
  );

  try {
    await sendInviteEmail({
      to: body.email,
      inviterName: auth.displayName,
      familyName: auth.familyName ?? 'Famiglia DueCase',
      rawToken,
      scopes: body.scopes,
      expiresAt,
    });
  } catch (error) {
    await pool.query(`UPDATE professional_invitations SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
    throw error;
  }

  await appendProfessionalAudit({
    action: 'invited', familyId: auth.familyId, actorParentUserId: auth.userId,
    details: { invitationId: id, email: body.email, scopes: body.scopes, expiresAt: expiresAt.toISOString() },
  });

  res.status(201).json({ id, email: body.email, scopes: body.scopes, expiresAt: expiresAt.toISOString(), status: 'pending' });
}));

router.post('/invitations/:id/resend', rateLimit(10, 60 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const invitationId = uuidSchema.parse(req.params.id);
  const { rows } = await pool.query<{ email: string; scopes: string[] }>(
    `SELECT invite_email AS email, scopes
       FROM professional_invitations
      WHERE id = $1 AND family_id = $2 AND invited_by_user_id = $3
        AND accepted_at IS NULL AND revoked_at IS NULL`,
    [invitationId, auth.familyId, auth.userId],
  );
  const invitation = rows[0];
  if (!invitation) throw new ApiError(404, 'Invito non disponibile', 'PROFESSIONAL_INVITE_NOT_FOUND');

  const rawToken = createProfessionalInvitationToken();
  const tokenHash = hashProfessionalInvitationToken(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  await pool.query(`UPDATE professional_invitations SET token_hash=$1, expires_at=$2, updated_at=NOW() WHERE id=$3`, [tokenHash, expiresAt, invitationId]);

  await sendInviteEmail({
    to: invitation.email,
    inviterName: auth.displayName,
    familyName: auth.familyName ?? 'Famiglia DueCase',
    rawToken,
    scopes: invitation.scopes,
    expiresAt,
  });
  await appendProfessionalAudit({
    action: 'invitation_resent', familyId: auth.familyId, actorParentUserId: auth.userId,
    details: { invitationId, email: invitation.email, scopes: invitation.scopes, expiresAt: expiresAt.toISOString() },
  });
  res.json({ id: invitationId, email: invitation.email, scopes: invitation.scopes, expiresAt: expiresAt.toISOString(), status: 'pending' });
}));

router.delete('/invitations/:id', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const invitationId = uuidSchema.parse(req.params.id);
  const result = await pool.query(
    `UPDATE professional_invitations
        SET revoked_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND family_id = $2 AND invited_by_user_id = $3
        AND accepted_at IS NULL AND revoked_at IS NULL`,
    [invitationId, auth.familyId, auth.userId],
  );
  if (result.rowCount !== 1) throw new ApiError(404, 'Invito non disponibile', 'PROFESSIONAL_INVITE_NOT_FOUND');
  await appendProfessionalAudit({ action: 'invitation_revoked', familyId: auth.familyId, actorParentUserId: auth.userId, details: { invitationId } });
  res.status(204).send();
}));

router.patch('/grants/:id', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const grantId = uuidSchema.parse(req.params.id);
  const body = updateScopesSchema.parse(req.body);
  const { rows } = await pool.query(
    `UPDATE professional_access_grants
        SET scopes = $1::text[], updated_at = NOW()
      WHERE id = $2 AND family_id = $3 AND granted_by_user_id = $4 AND revoked_at IS NULL
      RETURNING id, scopes, updated_at AS "updatedAt"`,
    [body.scopes, grantId, auth.familyId, auth.userId],
  );
  const grant = rows[0];
  if (!grant) throw new ApiError(404, 'Accesso professionista non trovato', 'PROFESSIONAL_GRANT_NOT_FOUND');
  await appendProfessionalAudit({ action: 'access_scopes_updated', grantId, familyId: auth.familyId, actorParentUserId: auth.userId, details: { scopes: body.scopes } });
  res.json(grant);
}));

router.delete('/grants/:id', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const grantId = uuidSchema.parse(req.params.id);
  const { rows } = await pool.query<{ professionalId: string }>(
    `UPDATE professional_access_grants
        SET revoked_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND family_id = $2 AND granted_by_user_id = $3 AND revoked_at IS NULL
      RETURNING professional_id AS "professionalId"`,
    [grantId, auth.familyId, auth.userId],
  );
  const grant = rows[0];
  if (!grant) throw new ApiError(404, 'Accesso professionista non trovato', 'PROFESSIONAL_GRANT_NOT_FOUND');
  await appendProfessionalAudit({ action: 'access_revoked', professionalId: grant.professionalId, grantId, familyId: auth.familyId, actorParentUserId: auth.userId });
  res.status(204).send();
}));

export default router;
