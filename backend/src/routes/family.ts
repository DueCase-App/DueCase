import { randomBytes, randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth } from '../auth.js';
import { rateLimit } from '../services/rateLimit.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { isEmailConfigured, sendParentInvitationEmail } from '../services/emailService.js';

const router = Router();

const createSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
});

const joinSchema = z.object({
  inviteCode: z.string().trim().min(6).max(32).transform((value) => value.toUpperCase()),
});

const parentInviteSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});

const publicInviteSchema = z.object({
  code: z.string().trim().min(6).max(32).transform((value) => value.toUpperCase()),
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

function oppositeRole(role: 'father' | 'mother'): 'father' | 'mother' {
  return role === 'father' ? 'mother' : 'father';
}

function invitationLandingHtml(input: {
  familyName: string;
  invitedEmail: string;
  invitedRole: 'father' | 'mother';
  code: string;
  expiresAt: Date;
}): string {
  const params = new URLSearchParams({
    inviteCode: input.code,
    email: input.invitedEmail,
    role: input.invitedRole,
  });
  const appLink = `duecase://register?${params.toString()}`;
  const roleLabel = input.invitedRole === 'mother' ? 'Mamma' : 'Papà';
  const familyName = input.familyName.replace(/[&<>"']/g, '');
  const expires = input.expiresAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invito DueCase</title></head><body style="font-family:Arial,Helvetica,sans-serif;background:#FFF8ED;color:#0A3267;margin:0;padding:24px"><main style="max-width:560px;margin:48px auto;background:white;border-radius:22px;padding:28px;box-shadow:0 12px 32px rgba(20,61,105,.12)"><h1 style="margin-top:0">DueCase</h1><h2>Invito alla famiglia ${familyName}</h2><p>Sei stato invitato come <strong>${roleLabel}</strong>. Apri DueCase per registrarti o accedere: il collegamento alla famiglia sarà già predisposto.</p><p style="margin:28px 0"><a href="${appLink}" style="display:inline-block;background:#1769E0;color:white;text-decoration:none;padding:15px 20px;border-radius:12px;font-weight:700">Apri registrazione DueCase</a></p><p style="color:#5D7CA7;font-size:14px">Invito destinato a ${input.invitedEmail}. Scade il ${expires}.</p></main></body></html>`;
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
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') continue;
      throw error;
    }
  }
  throw new ApiError(500, 'Unable to generate a unique family code');
}

// Public landing page reached from the invitation email. The real family join
// remains protected and is completed only after authentication/registration.
router.get('/parent-invitation/open', rateLimit(30, 15 * 60 * 1000), asyncHandler(async (req, res) => {
  const { code } = publicInviteSchema.parse(req.query);
  const { rows } = await pool.query<{
    name: string;
    inviteEmail: string;
    inviteExpiresAt: string;
    currentRole: 'father' | 'mother';
  }>(
    `SELECT f.name,
            f.invite_email AS "inviteEmail",
            f.invite_expires_at AS "inviteExpiresAt",
            u.role AS "currentRole"
       FROM families f
       JOIN users u ON u.family_id = f.id
      WHERE f.invite_code = $1
        AND f.invite_email IS NOT NULL
        AND f.invite_expires_at > NOW()
      ORDER BY u.created_at
      LIMIT 1`,
    [code],
  );
  const invite = rows[0];
  if (!invite) {
    res.status(410).type('html').send('<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:Arial,sans-serif;padding:32px"><h1>Invito non più valido</h1><p>Chiedi all’altro genitore di inviarti un nuovo invito da DueCase.</p></body></html>');
    return;
  }
  res.type('html').send(invitationLandingHtml({
    familyName: invite.name,
    invitedEmail: invite.inviteEmail,
    invitedRole: oppositeRole(invite.currentRole),
    code,
    expiresAt: new Date(invite.inviteExpiresAt),
  }));
}));

router.use(requireAuth);

router.get('/subscription', asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  if (!auth.familyId) {
    res.json({
      planCode: 'premium_monthly',
      priceCents: 499,
      currency: 'EUR',
      billingPeriod: 'month',
      trial: false,
      status: 'inactive',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      entitled: false,
    });
    return;
  }

  const { rows } = await pool.query<{
    planCode: string;
    priceCents: number;
    currency: string;
    billingPeriod: string;
    status: 'inactive' | 'active' | 'past_due' | 'canceled';
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  }>(
    `SELECT plan_code AS "planCode",
            price_cents AS "priceCents",
            currency,
            billing_period AS "billingPeriod",
            status,
            current_period_start AS "currentPeriodStart",
            current_period_end AS "currentPeriodEnd",
            cancel_at_period_end AS "cancelAtPeriodEnd"
       FROM family_subscriptions
      WHERE family_id = $1
      LIMIT 1`,
    [auth.familyId],
  );

  const subscription = rows[0] ?? {
    planCode: 'premium_monthly',
    priceCents: 499,
    currency: 'EUR',
    billingPeriod: 'month',
    status: 'inactive' as const,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
  const periodEnd = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const entitled = Boolean(
    (subscription.status === 'active' || subscription.status === 'canceled')
    && periodEnd
    && !Number.isNaN(periodEnd.getTime())
    && periodEnd.getTime() > Date.now(),
  );

  res.json({ ...subscription, trial: false, entitled });
}));

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
      `UPDATE users SET family_id = $1, updated_at = NOW() WHERE id = $2 AND family_id IS NULL`,
      [familyId, user.id],
    );
    if (updated.rowCount !== 1) throw new ApiError(409, 'Family setup has already changed', 'FAMILY_STATE_CHANGED');

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
    res.status(201).json({ family: { id: familyId, name: familyName, inviteCode }, memberCount: 1 });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

router.post('/join', rateLimit(10, 15*60*1000), asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  const body = joinSchema.parse(req.body);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userResult = await client.query<{
      id: string;
      email: string;
      familyId: string | null;
      displayName: string;
      role: 'father' | 'mother';
    }>(
      `SELECT id, email, family_id AS "familyId", display_name AS "displayName", role
         FROM users
        WHERE id = $1
        FOR UPDATE`,
      [auth.userId],
    );

    const user = userResult.rows[0];
    if (!user) throw new ApiError(401, 'User no longer exists');
    if (user.familyId) throw new ApiError(409, 'You already belong to a family', 'ALREADY_IN_FAMILY');

    const familyResult = await client.query<{ id: string; name: string; inviteCode: string; inviteEmail: string | null }>(
      `SELECT id, name, invite_code AS "inviteCode", invite_email AS "inviteEmail"
         FROM families
        WHERE invite_code = $1 AND invite_expires_at > NOW()
        FOR UPDATE`,
      [body.inviteCode],
    );
    const family = familyResult.rows[0];
    if (!family) throw new ApiError(404, 'Family code not found', 'INVALID_INVITE_CODE');
    if (family.inviteEmail && family.inviteEmail.toLowerCase() !== user.email.toLowerCase()) {
      throw new ApiError(403, 'Questo invito è destinato a un altro indirizzo email', 'INVITE_EMAIL_MISMATCH');
    }

    const membersResult = await client.query<{ role: 'father' | 'mother' }>(
      `SELECT role FROM users WHERE family_id = $1 FOR UPDATE`,
      [family.id],
    );
    if (membersResult.rowCount !== null && membersResult.rowCount >= 2) throw new ApiError(409, 'This family already has two parents', 'FAMILY_FULL');
    if (membersResult.rows.some((member) => member.role === user.role)) {
      const roleLabel = user.role === 'father' ? 'father' : 'mother';
      throw new ApiError(409, `This family already has a ${roleLabel}`, 'ROLE_ALREADY_PRESENT');
    }

    await client.query(`UPDATE users SET family_id = $1, updated_at = NOW() WHERE id = $2`, [family.id, user.id]);
    await client.query(
      `INSERT INTO parents (id, family_id, display_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET family_id = EXCLUDED.family_id,
             display_name = EXCLUDED.display_name,
             role = EXCLUDED.role`,
      [user.id, family.id, user.displayName, user.role],
    );
    await client.query(
      `UPDATE families
          SET invite_email = NULL,
              invite_sent_at = NULL,
              invite_expires_at = NOW()
        WHERE id = $1`,
      [family.id],
    );

    await client.query('COMMIT');
    res.json({ family: { id: family.id, name: family.name, inviteCode: family.inviteCode }, memberCount: (membersResult.rowCount ?? membersResult.rows.length) + 1 });
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

async function loadInvitationContext(familyId: string, userId: string) {
  const { rows } = await pool.query<{
    familyName: string;
    inviteCode: string;
    inviteEmail: string | null;
    inviteExpiresAt: string | null;
    inviteSentAt: string | null;
    inviterName: string;
    inviterRole: 'father' | 'mother';
    memberCount: number;
  }>(
    `SELECT f.name AS "familyName",
            f.invite_code AS "inviteCode",
            f.invite_email AS "inviteEmail",
            f.invite_expires_at AS "inviteExpiresAt",
            f.invite_sent_at AS "inviteSentAt",
            u.display_name AS "inviterName",
            u.role AS "inviterRole",
            (SELECT COUNT(*)::int FROM users m WHERE m.family_id = f.id) AS "memberCount"
       FROM families f
       JOIN users u ON u.id = $2 AND u.family_id = f.id
      WHERE f.id = $1`,
    [familyId, userId],
  );
  return rows[0] ?? null;
}

function parentInvitationPayload(context: Awaited<ReturnType<typeof loadInvitationContext>>) {
  if (!context) return null;
  const expiresAt = context.inviteExpiresAt;
  const pending = context.memberCount < 2 && Boolean(context.inviteEmail && expiresAt && new Date(expiresAt).getTime() > Date.now());
  return {
    email: context.inviteEmail,
    role: oppositeRole(context.inviterRole),
    status: context.memberCount >= 2 ? 'accepted' as const : pending ? 'pending' as const : 'none' as const,
    sentAt: context.inviteSentAt,
    expiresAt,
  };
}

async function sendInvitationForContext(req: import('express').Request, context: NonNullable<Awaited<ReturnType<typeof loadInvitationContext>>>, email: string) {
  if (!isEmailConfigured()) throw new ApiError(503, 'Il servizio email non è ancora configurato', 'EMAIL_NOT_CONFIGURED');
  const code = generateInviteCode(16);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    `UPDATE families
        SET invite_code = $2,
            invite_email = $3,
            invite_sent_at = NOW(),
            invite_expires_at = $4
      WHERE id = $1`,
    [req.auth?.familyId ?? null, code, email, expiresAt],
  );
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const host = req.get('host');
  if (!host) throw new ApiError(500, 'Impossibile creare il link di invito', 'INVITE_LINK_FAILED');
  const inviteLink = `${protocol}://${host}/api/family/parent-invitation/open?code=${encodeURIComponent(code)}`;
  await sendParentInvitationEmail({
    to: email,
    inviterName: context.inviterName,
    familyName: context.familyName,
    invitedRole: oppositeRole(context.inviterRole),
    inviteLink,
    expiresAt,
  });
  return { email, role: oppositeRole(context.inviterRole), status: 'pending' as const, sentAt: new Date().toISOString(), expiresAt: expiresAt.toISOString() };
}

router.get('/parent-invitation', asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  if (!auth.familyId) throw new ApiError(409, 'Crea prima una famiglia', 'FAMILY_REQUIRED');
  const context = await loadInvitationContext(auth.familyId, auth.userId);
  if (!context) throw new ApiError(404, 'Famiglia non trovata');
  res.json(parentInvitationPayload(context));
}));

router.post('/parent-invitation', rateLimit(8, 60 * 60 * 1000), asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  if (!auth.familyId) throw new ApiError(409, 'Crea prima una famiglia', 'FAMILY_REQUIRED');
  const { email } = parentInviteSchema.parse(req.body);
  if (email === auth.email.toLowerCase()) throw new ApiError(400, 'Inserisci l’email dell’altro genitore', 'INVITE_SELF');
  const context = await loadInvitationContext(auth.familyId, auth.userId);
  if (!context) throw new ApiError(404, 'Famiglia non trovata');
  if (context.memberCount >= 2) throw new ApiError(409, 'L’altro genitore è già collegato', 'FAMILY_FULL');

  const existing = await pool.query<{ familyId: string | null }>('SELECT family_id AS "familyId" FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1', [email]);
  if (existing.rows[0]?.familyId && existing.rows[0].familyId !== auth.familyId) {
    throw new ApiError(409, 'Questo account appartiene già a un’altra famiglia', 'INVITEE_ALREADY_IN_FAMILY');
  }

  res.status(201).json(await sendInvitationForContext(req, context, email));
}));

router.post('/parent-invitation/resend', rateLimit(8, 60 * 60 * 1000), asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  if (!auth.familyId) throw new ApiError(409, 'Famiglia non disponibile', 'FAMILY_REQUIRED');
  const context = await loadInvitationContext(auth.familyId, auth.userId);
  if (!context?.inviteEmail) throw new ApiError(404, 'Nessun invito da reinviare', 'INVITE_NOT_FOUND');
  if (context.memberCount >= 2) throw new ApiError(409, 'L’altro genitore è già collegato', 'FAMILY_FULL');
  res.json(await sendInvitationForContext(req, context, context.inviteEmail));
}));

router.delete('/parent-invitation', asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  if (!auth.familyId) throw new ApiError(409, 'Famiglia non disponibile', 'FAMILY_REQUIRED');
  await pool.query(
    `UPDATE families
        SET invite_email = NULL,
            invite_sent_at = NULL,
            invite_expires_at = NOW()
      WHERE id = $1`,
    [auth.familyId],
  );
  res.json({ canceled: true });
}));

router.get('/invitation',asyncHandler(async(req,res)=>{
 const a=getAuth(req);const {rows}=await pool.query('SELECT invite_code AS code,invite_expires_at AS "expiresAt" FROM families WHERE id=$1',[a.familyId]);
 if(!rows[0])throw new ApiError(404,'Famiglia non trovata.');res.json(rows[0]);
}));
router.post('/invitation/rotate',rateLimit(5,3600000),asyncHandler(async(req,res)=>{
 const a=getAuth(req);const {rows}=await pool.query("UPDATE families SET invite_code=$2,invite_expires_at=NOW()+INTERVAL '7 days' WHERE id=$1 RETURNING invite_code AS code,invite_expires_at AS \"expiresAt\"",[a.familyId,generateInviteCode(16)]);
 if(!rows[0])throw new ApiError(404,'Famiglia non trovata.');res.json(rows[0]);
}));
router.delete('/invitation',asyncHandler(async(req,res)=>{
 const a=getAuth(req);await pool.query('UPDATE families SET invite_expires_at=NOW() WHERE id=$1',[a.familyId]);res.json({revoked:true});
}));
export default router;
