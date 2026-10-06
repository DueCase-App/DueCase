import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireFamily, type ParentRole } from '../auth.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { maskEmail, sendExpenseOtpEmail } from '../services/emailService.js';
import {
  formatEuroAmount,
  parentRoleLabel,
  parentRoleSubject,
  sendPushToOtherParent,
  sendPushToUser,
} from '../services/notificationService.js';

const router = Router();
const uuid = z.string().uuid();
const categories = ['Scuola', 'Salute', 'Sport', 'Svago'] as const;
const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error('La ricevuta deve essere un’immagine JPEG, PNG, WEBP, HEIC o HEIF.'));
      return;
    }
    callback(null, true);
  },
});

function uploadReceipt(req: Request, res: Response, next: NextFunction): void {
  upload.single('receipt')(req, res, (error) => {
    if (!error) { next(); return; }
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'La ricevuta non può superare 8 MB.'
      : error instanceof Error ? error.message : 'Ricevuta non valida.';
    next(new ApiError(400, message, 'INVALID_RECEIPT'));
  });
}

const moneySchema = z.string()
  .trim()
  .regex(/^\d{1,10}(?:[.,]\d{1,2})?$/, 'Usa un importo con massimo due decimali')
  .transform((value) => {
    const normalized = value.replace(',', '.');
    const [whole = '0', decimal = ''] = normalized.split('.');
    return `${whole}.${decimal.padEnd(2, '0')}`;
  })
  .refine((value) => value !== '0.00', 'L’importo deve essere maggiore di zero');

const formBoolean = z.preprocess((value) => {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0' || value === '' || value == null) return false;
  return value;
}, z.boolean());

const percentageSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return Number(value.replace(',', '.'));
  return value;
}, z.number().min(0).max(100).optional());

const childIdsSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}, z.array(uuid).max(12));

const createExpenseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  amount: moneySchema,
  category: z.enum(categories),
  expenseDate: z.string().date().optional(),
  notes: z.string().trim().max(2000).optional(),
  isExtraordinary: formBoolean,
  fatherPercentage: percentageSchema,
  motherPercentage: percentageSchema,
  childIds: childIdsSchema,
}).superRefine((value, ctx) => {
  const father = value.fatherPercentage ?? 50;
  const mother = value.motherPercentage ?? 50;
  if (Math.abs((father + mother) - 100) > 0.001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['motherPercentage'],
      message: 'Le percentuali di Papà e Mamma devono sommare 100%.',
    });
  }
});

const verifyOtpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Inserisci il codice OTP di 6 cifre.'),
});

const legacyOtpSchema = z.object({
  otp: z.string().regex(/^\d{6}$/).optional(),
});

router.use(requireAuth);

function otpHash(expenseId: string, userId: string, otp: string): string {
  return createHmac('sha256', config.OTP_SECRET ?? config.JWT_SECRET)
    .update(`${expenseId}:${userId}:${otp}`)
    .digest('hex');
}

function sameHash(expected: string, candidate: string): boolean {
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(candidate, 'hex');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = raw?.split(',')[0]?.trim();
  return first || req.ip || req.socket.remoteAddress || 'unknown';
}

function serializeExpense(row: Record<string, unknown>, currentUserId: string): Record<string, unknown> {
  const status = row.status as string;
  const paidByUserId = row.paidByUserId as string | null;
  return { ...row, canReview: status === 'pending_approval' && paidByUserId !== currentUserId };
}

const expenseSelect = `
  SELECT e.id,
         e.family_id AS "familyId",
         e.title,
         e.amount::numeric(12,2)::text AS amount,
         e.category,
         e.paid_by_user_id AS "paidByUserId",
         u.display_name AS "paidByName",
         u.role AS "paidByRole",
         e.receipt_url AS "receiptUrl",
         e.status,
         e.expense_date AS "expenseDate",
         e.notes,
         e.is_extraordinary AS "isExtraordinary",
         e.otp_signature_metadata AS "otpSignatureMetadata",
         e.father_percentage::numeric(5,2)::text AS "fatherPercentage",
         e.mother_percentage::numeric(5,2)::text AS "motherPercentage",
         COALESCE((
           SELECT json_agg(ec.child_id ORDER BY c.display_name)
             FROM expense_children ec
             JOIN children c ON c.id = ec.child_id AND c.family_id = ec.family_id
            WHERE ec.expense_id = e.id AND ec.family_id = e.family_id
         ), '[]'::json) AS "childIds",
         COALESCE((
           SELECT json_agg(json_build_object('id', c.id, 'displayName', c.display_name) ORDER BY c.display_name)
             FROM expense_children ec
             JOIN children c ON c.id = ec.child_id AND c.family_id = ec.family_id
            WHERE ec.expense_id = e.id AND ec.family_id = e.family_id
         ), '[]'::json) AS children,
         e.reviewed_by_user_id AS "reviewedByUserId",
         e.reviewed_at AS "reviewedAt",
         e.approval_otp_verified_at AS "approvalOtpVerifiedAt",
         e.created_at AS "createdAt",
         e.updated_at AS "updatedAt"
    FROM expenses e
    LEFT JOIN users u ON u.id = e.paid_by_user_id
`;

async function readExpense(expenseId: string, familyId: string, currentUserId: string): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(`${expenseSelect} WHERE e.id = $1 AND e.family_id = $2`, [expenseId, familyId]);
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row) throw new ApiError(404, 'Spesa non trovata', 'EXPENSE_NOT_FOUND');
  return serializeExpense(row, currentUserId);
}

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query(
    `${expenseSelect} WHERE e.family_id = $1 ORDER BY e.expense_date DESC, e.created_at DESC`,
    [auth.familyId],
  );
  res.json(rows.map((row) => serializeExpense(row, auth.userId)));
}));

router.get('/balance', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query<{
    fatherPaid: string;
    motherPaid: string;
    totalApproved: string;
    fatherShare: string;
    motherShare: string;
    settlementAmount: string;
    creditorRole: ParentRole | null;
    debtorRole: ParentRole | null;
  }>(
    `WITH expense_totals AS (
       SELECT COALESCE(SUM(e.amount) FILTER (WHERE u.role = 'father'), 0::numeric) AS father_paid,
              COALESCE(SUM(e.amount) FILTER (WHERE u.role = 'mother'), 0::numeric) AS mother_paid,
              COALESCE(SUM(e.amount * e.father_percentage / 100), 0::numeric) AS father_share,
              COALESCE(SUM(e.amount * e.mother_percentage / 100), 0::numeric) AS mother_share
         FROM expenses e
         JOIN users u ON u.id = e.paid_by_user_id
        WHERE e.family_id = $1
          AND e.status IN ('approved','to_pay','partially_paid','paid','closed')
     ), calculated AS (
       SELECT father_paid,
              mother_paid,
              father_share,
              mother_share,
              father_paid - father_share + COALESCE((
                SELECT SUM(CASE WHEN payer.role = 'father' THEN p.amount ELSE -p.amount END)
                FROM expense_payments p JOIN users payer ON payer.id = p.paid_by_user_id
                JOIN expenses paid_expense ON paid_expense.id = p.expense_id
                WHERE p.family_id = $1 AND p.status = 'confirmed'
                  AND paid_expense.status IN ('approved','to_pay','partially_paid','paid','closed')
              ),0) AS father_net
         FROM expense_totals
     )
     SELECT father_paid::numeric(12,2)::text AS "fatherPaid",
            mother_paid::numeric(12,2)::text AS "motherPaid",
            (father_paid + mother_paid)::numeric(12,2)::text AS "totalApproved",
            father_share::numeric(12,2)::text AS "fatherShare",
            mother_share::numeric(12,2)::text AS "motherShare",
            ABS(father_net)::numeric(12,2)::text AS "settlementAmount",
            CASE WHEN father_net > 0.004 THEN 'father' WHEN father_net < -0.004 THEN 'mother' ELSE NULL END AS "creditorRole",
            CASE WHEN father_net > 0.004 THEN 'mother' WHEN father_net < -0.004 THEN 'father' ELSE NULL END AS "debtorRole"
       FROM calculated`,
    [auth.familyId],
  );
  const balance = rows[0];
  if (!balance) throw new ApiError(500, 'Impossibile calcolare il bilancio', 'BALANCE_ERROR');
  const direction = balance.creditorRole === null ? 'settled' : balance.creditorRole === auth.role ? 'receive' : 'pay';
  res.json({
    ...balance,
    perParentShare: Number(balance.fatherShare) === Number(balance.motherShare) ? balance.fatherShare : null,
    currentUserRole: auth.role,
    direction,
  });
}));

router.get('/:id/receipt', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const { rows } = await pool.query<{ receiptData: Buffer | null; receiptMimeType: string | null; receiptFilename: string | null }>(
    `SELECT receipt_data AS "receiptData", receipt_mime_type AS "receiptMimeType", receipt_filename AS "receiptFilename"
       FROM expenses WHERE id = $1 AND family_id = $2`,
    [expenseId, auth.familyId],
  );
  const receipt = rows[0];
  if (!receipt?.receiptData) throw new ApiError(404, 'Ricevuta non trovata', 'RECEIPT_NOT_FOUND');
  res.setHeader('Content-Type', receipt.receiptMimeType ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${(receipt.receiptFilename ?? 'ricevuta').replace(/["\\\r\n]/g, '_')}"`);
  res.send(receipt.receiptData);
}));

router.post('/', uploadReceipt, asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createExpenseSchema.parse(req.body);
  const id = randomUUID();
  const receiptUrl = req.file ? `/expenses/${id}/receipt` : null;
  const fatherPercentage = body.fatherPercentage ?? 50;
  const motherPercentage = body.motherPercentage ?? 50;
  const childIds = [...new Set(body.childIds)];
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (childIds.length > 0) {
      const validChildren = await client.query<{ id: string }>(
        `SELECT id FROM children WHERE family_id = $1 AND id = ANY($2::uuid[])`,
        [auth.familyId, childIds],
      );
      if (validChildren.rows.length !== childIds.length) {
        throw new ApiError(400, 'Uno o più figli selezionati non appartengono alla famiglia.', 'INVALID_EXPENSE_CHILD');
      }
    }

    await client.query(
      `INSERT INTO expenses
        (id, family_id, title, amount, category, paid_by_user_id,
         receipt_url, receipt_mime_type, receipt_filename, receipt_data,
         status, expense_date, notes, is_extraordinary, father_percentage, mother_percentage)
       VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8, $9, $10,
               'pending_approval', COALESCE($11::date, CURRENT_DATE), $12, $13, $14::numeric, $15::numeric)`,
      [
        id,
        auth.familyId,
        body.title,
        body.amount,
        body.category,
        auth.userId,
        receiptUrl,
        req.file?.mimetype ?? null,
        req.file?.originalname ?? null,
        req.file?.buffer ?? null,
        body.expenseDate ?? null,
        body.notes || null,
        body.isExtraordinary,
        fatherPercentage,
        motherPercentage,
      ],
    );

    for (const childId of childIds) {
      await client.query(
        `INSERT INTO expense_children (expense_id, child_id, family_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (expense_id, child_id) DO NOTHING`,
        [id, childId, auth.familyId],
      );
    }

    await client.query(
      `INSERT INTO family_activity_history
        (id, family_id, actor_user_id, entity_type, entity_id, action, details)
       VALUES ($1,$2,$3,'expense',$4,'created',$5::jsonb)`,
      [
        randomUUID(),
        auth.familyId,
        auth.userId,
        id,
        JSON.stringify({
          amount: body.amount,
          category: body.category,
          fatherPercentage,
          motherPercentage,
          childIds,
          isExtraordinary: body.isExtraordinary,
          role: auth.role,
        }),
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await sendPushToOtherParent(auth.familyId, auth.userId, {
    title: body.isExtraordinary ? 'Nuova spesa straordinaria' : 'Nuova spesa da approvare',
    body: `${parentRoleSubject(auth.role)} ha inserito una spesa di ${formatEuroAmount(body.amount)}. Approvala!`,
    data: { type: 'expense_created', screen: 'expenses', expenseId: id },
  });

  res.status(201).json(await readExpense(id, auth.familyId, auth.userId));
}));

async function requestOtp(req: Request, res: Response): Promise<void> {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const { rows } = await pool.query<{
    paidByUserId: string;
    status: string;
    isExtraordinary: boolean;
    title: string;
    amount: string;
  }>(
    `SELECT paid_by_user_id AS "paidByUserId", status, is_extraordinary AS "isExtraordinary",
            title, amount::numeric(12,2)::text AS amount
       FROM expenses
      WHERE id = $1 AND family_id = $2`,
    [expenseId, auth.familyId],
  );
  const expense = rows[0];
  if (!expense) throw new ApiError(404, 'Spesa non trovata', 'EXPENSE_NOT_FOUND');
  if (!expense.isExtraordinary) throw new ApiError(409, 'La firma OTP è prevista solo per le spese straordinarie.', 'OTP_NOT_REQUIRED');
  if (expense.paidByUserId === auth.userId) throw new ApiError(403, 'Non puoi approvare una spesa inserita da te', 'SELF_REVIEW_NOT_ALLOWED');
  if (expense.status !== 'pending_approval') throw new ApiError(409, 'Questa spesa è già stata valutata', 'EXPENSE_ALREADY_REVIEWED');

  const userResult = await pool.query<{ email: string; displayName: string }>(
    `SELECT email, display_name AS "displayName" FROM users WHERE id = $1 AND family_id = $2`,
    [auth.userId, auth.familyId],
  );
  const user = userResult.rows[0];
  if (!user) throw new ApiError(404, 'Utente non trovato', 'USER_NOT_FOUND');

  const otp = String(randomInt(100000, 1000000));
  const digest = otpHash(expenseId, auth.userId, otp);
  const requestId = randomUUID();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE otp_requests SET status = 'expired'
        WHERE expense_id = $1 AND user_id = $2 AND status = 'pending'`,
      [expenseId, auth.userId],
    );
    await client.query(
      `INSERT INTO otp_requests (id, user_id, expense_id, code_hash, expires_at, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [requestId, auth.userId, expenseId, digest, expiresAt],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  try {
    await sendExpenseOtpEmail({
      to: user.email,
      recipientName: user.displayName,
      otp,
      expenseTitle: expense.title,
      amount: expense.amount,
      expiresInMinutes: OTP_TTL_MINUTES,
    });
  } catch (error) {
    await pool.query(`UPDATE otp_requests SET status = 'expired' WHERE id = $1 AND status = 'pending'`, [requestId]);
    if (error instanceof Error && error.message === 'SMTP_NOT_CONFIGURED') {
      throw new ApiError(503, 'Invio email non configurato. Configura il servizio SMTP di DueCase.', 'OTP_EMAIL_NOT_CONFIGURED');
    }
    throw new ApiError(502, 'Non è stato possibile inviare il codice OTP via email. Riprova.', 'OTP_EMAIL_DELIVERY_FAILED');
  }

  res.json({ ok: true, expiresInSeconds: OTP_TTL_MINUTES * 60, maskedEmail: maskEmail(user.email) });
}

async function verifyExpenseOtp(req: Request, code: string): Promise<Record<string, unknown>> {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const client = await pool.connect();
  let committed = false;

  try {
    await client.query('BEGIN');
    const expenseResult = await client.query<{
      paidByUserId: string;
      status: string;
      isExtraordinary: boolean;
    }>(
      `SELECT paid_by_user_id AS "paidByUserId", status, is_extraordinary AS "isExtraordinary"
         FROM expenses
        WHERE id = $1 AND family_id = $2
        FOR UPDATE`,
      [expenseId, auth.familyId],
    );
    const expense = expenseResult.rows[0];
    if (!expense) throw new ApiError(404, 'Spesa non trovata', 'EXPENSE_NOT_FOUND');
    if (!expense.isExtraordinary) throw new ApiError(409, 'Questa spesa non richiede firma OTP.', 'OTP_NOT_REQUIRED');
    if (expense.paidByUserId === auth.userId) throw new ApiError(403, 'Non puoi approvare una spesa inserita da te', 'SELF_REVIEW_NOT_ALLOWED');
    if (expense.status !== 'pending_approval') throw new ApiError(409, 'Questa spesa è già stata valutata', 'EXPENSE_ALREADY_REVIEWED');

    const otpResult = await client.query<{
      id: string;
      codeHash: string;
      expiresAt: Date;
      attempts: number;
    }>(
      `SELECT id, code_hash AS "codeHash", expires_at AS "expiresAt", attempts
         FROM otp_requests
        WHERE expense_id = $1 AND user_id = $2 AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [expenseId, auth.userId],
    );
    const otpRequest = otpResult.rows[0];
    if (!otpRequest) throw new ApiError(409, 'Richiedi un nuovo codice OTP prima di approvare.', 'OTP_REQUIRED');

    if (new Date(otpRequest.expiresAt).getTime() <= Date.now()) {
      await client.query(`UPDATE otp_requests SET status = 'expired' WHERE id = $1`, [otpRequest.id]);
      await client.query('COMMIT');
      committed = true;
      throw new ApiError(410, 'Il codice OTP è scaduto. Richiedine uno nuovo.', 'OTP_EXPIRED');
    }

    const candidate = otpHash(expenseId, auth.userId, code);
    if (!sameHash(otpRequest.codeHash, candidate)) {
      const nextAttempts = otpRequest.attempts + 1;
      await client.query(
        `UPDATE otp_requests
            SET attempts = $1,
                status = CASE WHEN $1 >= $2 THEN 'expired'::otp_request_status ELSE status END
          WHERE id = $3`,
        [nextAttempts, OTP_MAX_ATTEMPTS, otpRequest.id],
      );
      await client.query('COMMIT');
      committed = true;
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        throw new ApiError(429, 'Troppi tentativi. Richiedi un nuovo codice OTP.', 'OTP_TOO_MANY_ATTEMPTS');
      }
      throw new ApiError(400, 'Codice OTP non corretto.', 'OTP_INVALID');
    }

    const clock = await client.query<{ verifiedAt: Date }>(`SELECT clock_timestamp() AS "verifiedAt"`);
    const verifiedAt = clock.rows[0]?.verifiedAt ?? new Date();
    const iso = new Date(verifiedAt).toISOString();
    const metadata = {
      version: 1,
      verifiedAt: iso,
      date: iso.slice(0, 10),
      time: iso.slice(11, 23) + 'Z',
      ipAddress: getClientIp(req),
      otpHash: otpRequest.codeHash,
      hashAlgorithm: 'HMAC-SHA-256',
      otpRequestId: otpRequest.id,
      signerUserId: auth.userId,
      userAgent: req.get('user-agent') ?? null,
    };

    await client.query(
      `UPDATE otp_requests
          SET status = 'verified', verified_at = $1
        WHERE id = $2`,
      [verifiedAt, otpRequest.id],
    );
    await client.query(
      `UPDATE otp_requests
          SET status = 'expired'
        WHERE expense_id = $1 AND user_id = $2 AND status = 'pending' AND id <> $3`,
      [expenseId, auth.userId, otpRequest.id],
    );
    await client.query(
      `UPDATE expenses
          SET status = 'approved',
              reviewed_by_user_id = $1,
              reviewed_at = $2,
              approval_otp_verified_at = $2,
              otp_signature_metadata = $3::jsonb,
              approval_otp_hash = NULL,
              approval_otp_expires_at = NULL,
              approval_otp_requested_by = NULL,
              approval_otp_attempts = 0,
              updated_at = NOW()
        WHERE id = $4 AND family_id = $5`,
      [auth.userId, verifiedAt, JSON.stringify(metadata), expenseId, auth.familyId],
    );
    await client.query(
      `INSERT INTO family_activity_history
        (id, family_id, actor_user_id, entity_type, entity_id, action, details)
       VALUES ($1,$2,$3,'expense',$4,'approved_otp',$5::jsonb)`,
      [randomUUID(), auth.familyId, auth.userId, expenseId, JSON.stringify({ otpRequestId: otpRequest.id, verifiedAt: iso, role: auth.role })],
    );
    await client.query('COMMIT');
    committed = true;
  } catch (error) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
    }
    throw error;
  } finally {
    client.release();
  }

  const updated = await readExpense(expenseId, auth.familyId, auth.userId);
  const paidByUserId = updated.paidByUserId as string | null;
  if (paidByUserId) {
    await sendPushToUser(paidByUserId, {
      title: 'Spesa straordinaria approvata',
      body: `La spesa “${String(updated.title)}” di ${formatEuroAmount(String(updated.amount))} è stata approvata con firma OTP da ${parentRoleLabel(auth.role)}.`,
      data: { type: 'expense_approved', screen: 'expenses', expenseId },
    });
  }
  return updated;
}

async function approveOrdinaryExpense(req: Request): Promise<Record<string, unknown>> {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const result = await pool.query(
    `UPDATE expenses
        SET status = 'approved', reviewed_by_user_id = $1, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $2
        AND family_id = $3
        AND paid_by_user_id <> $1
        AND status = 'pending_approval'
        AND is_extraordinary = FALSE
      RETURNING id`,
    [auth.userId, expenseId, auth.familyId],
  );
  if (result.rowCount !== 1) {
    const check = await pool.query<{ isExtraordinary: boolean }>(
      `SELECT is_extraordinary AS "isExtraordinary" FROM expenses WHERE id = $1 AND family_id = $2`,
      [expenseId, auth.familyId],
    );
    if (check.rows[0]?.isExtraordinary) throw new ApiError(409, 'Questa spesa straordinaria richiede la firma OTP.', 'OTP_REQUIRED');
    throw new ApiError(409, 'Spesa non disponibile per la revisione', 'EXPENSE_NOT_REVIEWABLE');
  }

  await pool.query(
    `INSERT INTO family_activity_history
      (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'expense',$4,'approved',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, expenseId, JSON.stringify({ role: auth.role })],
  );

  const updated = await readExpense(expenseId, auth.familyId, auth.userId);
  const paidByUserId = updated.paidByUserId as string | null;
  if (paidByUserId) {
    await sendPushToUser(paidByUserId, {
      title: 'Spesa approvata',
      body: `La spesa “${String(updated.title)}” di ${formatEuroAmount(String(updated.amount))} è stata approvata da ${parentRoleLabel(auth.role)}.`,
      data: { type: 'expense_approved', screen: 'expenses', expenseId },
    });
  }
  return updated;
}

async function declineExpense(req: Request): Promise<Record<string, unknown>> {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const result = await pool.query(
    `UPDATE expenses
        SET status = 'declined', reviewed_by_user_id = $1, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $2 AND family_id = $3 AND paid_by_user_id <> $1 AND status = 'pending_approval'
      RETURNING id`,
    [auth.userId, expenseId, auth.familyId],
  );
  if (result.rowCount !== 1) throw new ApiError(409, 'Spesa non disponibile per la revisione', 'EXPENSE_NOT_REVIEWABLE');
  await pool.query(`UPDATE otp_requests SET status = 'expired' WHERE expense_id = $1 AND status = 'pending'`, [expenseId]);
  await pool.query(
    `INSERT INTO family_activity_history
      (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'expense',$4,'declined',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, expenseId, JSON.stringify({ role: auth.role })],
  );

  const updated = await readExpense(expenseId, auth.familyId, auth.userId);
  const paidByUserId = updated.paidByUserId as string | null;
  if (paidByUserId) {
    await sendPushToUser(paidByUserId, {
      title: 'Spesa contestata',
      body: `La spesa “${String(updated.title)}” di ${formatEuroAmount(String(updated.amount))} è stata contestata da ${parentRoleLabel(auth.role)}.`,
      data: { type: 'expense_declined', screen: 'expenses', expenseId },
    });
  }
  return updated;
}

router.post('/:id/request-otp', asyncHandler(requestOtp));
router.post('/:id/request-approval-otp', asyncHandler(requestOtp));

router.post('/:id/verify-otp', asyncHandler(async (req, res) => {
  const { code } = verifyOtpSchema.parse(req.body);
  res.json(await verifyExpenseOtp(req, code));
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const check = await pool.query<{ isExtraordinary: boolean }>(
    `SELECT is_extraordinary AS "isExtraordinary" FROM expenses WHERE id = $1 AND family_id = $2`,
    [expenseId, auth.familyId],
  );
  if (!check.rows[0]) throw new ApiError(404, 'Spesa non trovata', 'EXPENSE_NOT_FOUND');
  if (check.rows[0].isExtraordinary) {
    const legacy = legacyOtpSchema.parse(req.body ?? {});
    if (!legacy.otp) throw new ApiError(409, 'Richiedi e verifica il codice OTP per approvare questa spesa straordinaria.', 'OTP_REQUIRED');
    res.json(await verifyExpenseOtp(req, legacy.otp));
    return;
  }
  res.json(await approveOrdinaryExpense(req));
}));

router.post('/:id/decline', asyncHandler(async (req, res) => {
  res.json(await declineExpense(req));
}));

export default router;
