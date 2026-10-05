import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireFamily, type ParentRole } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
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

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

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
    if (!error) {
      next();
      return;
    }

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

const createExpenseSchema = z.object({
  title: z.string().trim().min(1).max(160),
  amount: moneySchema,
  category: z.enum(categories),
  expenseDate: z.string().date().optional(),
  notes: z.string().trim().max(2000).optional(),
});

router.use(requireAuth);

function serializeExpense(row: Record<string, unknown>, currentUserId: string): Record<string, unknown> {
  const status = row.status as string;
  const paidByUserId = row.paidByUserId as string | null;
  return {
    ...row,
    canReview: status === 'pending_approval' && paidByUserId !== currentUserId,
  };
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
         e.reviewed_by_user_id AS "reviewedByUserId",
         e.reviewed_at AS "reviewedAt",
         e.created_at AS "createdAt",
         e.updated_at AS "updatedAt"
    FROM expenses e
    LEFT JOIN users u ON u.id = e.paid_by_user_id
`;

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query(
    `${expenseSelect}
      WHERE e.family_id = $1
      ORDER BY e.expense_date DESC, e.created_at DESC`,
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
    perParentShare: string;
    settlementAmount: string;
    creditorRole: ParentRole | null;
    debtorRole: ParentRole | null;
  }>(
    `WITH totals AS (
       SELECT COALESCE(SUM(e.amount) FILTER (WHERE u.role = 'father'), 0::numeric) AS father_paid,
              COALESCE(SUM(e.amount) FILTER (WHERE u.role = 'mother'), 0::numeric) AS mother_paid
         FROM expenses e
         JOIN users u ON u.id = e.paid_by_user_id
        WHERE e.family_id = $1
          AND e.status = 'approved'
     )
     SELECT father_paid::numeric(12,2)::text AS "fatherPaid",
            mother_paid::numeric(12,2)::text AS "motherPaid",
            (father_paid + mother_paid)::numeric(12,2)::text AS "totalApproved",
            ROUND((father_paid + mother_paid) / 2, 2)::numeric(12,2)::text AS "perParentShare",
            ROUND(ABS(father_paid - mother_paid) / 2, 2)::numeric(12,2)::text AS "settlementAmount",
            CASE
              WHEN father_paid > mother_paid THEN 'father'
              WHEN mother_paid > father_paid THEN 'mother'
              ELSE NULL
            END AS "creditorRole",
            CASE
              WHEN father_paid > mother_paid THEN 'mother'
              WHEN mother_paid > father_paid THEN 'father'
              ELSE NULL
            END AS "debtorRole"
       FROM totals`,
    [auth.familyId],
  );

  const balance = rows[0];
  if (!balance) throw new ApiError(500, 'Impossibile calcolare il bilancio', 'BALANCE_ERROR');

  const direction = balance.creditorRole === null
    ? 'settled'
    : balance.creditorRole === auth.role ? 'receive' : 'pay';

  res.json({
    ...balance,
    currentUserRole: auth.role,
    direction,
  });
}));

router.get('/:id/receipt', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const { rows } = await pool.query<{
    receiptData: Buffer | null;
    receiptMimeType: string | null;
    receiptFilename: string | null;
  }>(
    `SELECT receipt_data AS "receiptData",
            receipt_mime_type AS "receiptMimeType",
            receipt_filename AS "receiptFilename"
       FROM expenses
      WHERE id = $1 AND family_id = $2`,
    [expenseId, auth.familyId],
  );

  const receipt = rows[0];
  if (!receipt?.receiptData) {
    throw new ApiError(404, 'Ricevuta non trovata', 'RECEIPT_NOT_FOUND');
  }

  res.setHeader('Content-Type', receipt.receiptMimeType ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${(receipt.receiptFilename ?? 'ricevuta').replace(/["\\\r\n]/g, '_')}"`,
  );
  res.send(receipt.receiptData);
}));

router.post('/', uploadReceipt, asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createExpenseSchema.parse(req.body);
  const id = randomUUID();
  const receiptUrl = req.file ? `/expenses/${id}/receipt` : null;

  await pool.query(
    `INSERT INTO expenses
      (id, family_id, title, amount, category, paid_by_user_id,
       receipt_url, receipt_mime_type, receipt_filename, receipt_data,
       status, expense_date, notes)
     VALUES ($1, $2, $3, $4::numeric, $5, $6, $7, $8, $9, $10,
             'pending_approval', COALESCE($11::date, CURRENT_DATE), $12)`,
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
    ],
  );

  const { rows } = await pool.query(
    `${expenseSelect} WHERE e.id = $1 AND e.family_id = $2`,
    [id, auth.familyId],
  );

  await sendPushToOtherParent(auth.familyId, auth.userId, {
    title: 'Nuova spesa da approvare',
    body: `${parentRoleSubject(auth.role)} ha inserito una spesa di ${formatEuroAmount(body.amount)}. Approvala!`,
    data: { type: 'expense_created', screen: 'expenses', expenseId: id },
  });

  res.status(201).json(serializeExpense(rows[0] as Record<string, unknown>, auth.userId));
}));

async function reviewExpense(
  req: Request,
  status: 'approved' | 'declined',
): Promise<Record<string, unknown>> {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);

  const result = await pool.query(
    `UPDATE expenses
        SET status = $1,
            reviewed_by_user_id = $2,
            reviewed_at = NOW(),
            updated_at = NOW()
      WHERE id = $3
        AND family_id = $4
        AND paid_by_user_id <> $2
        AND status = 'pending_approval'
      RETURNING id`,
    [status, auth.userId, expenseId, auth.familyId],
  );

  if (result.rowCount !== 1) {
    const existing = await pool.query<{ paidByUserId: string | null; status: string }>(
      `SELECT paid_by_user_id AS "paidByUserId", status
         FROM expenses
        WHERE id = $1 AND family_id = $2`,
      [expenseId, auth.familyId],
    );
    const expense = existing.rows[0];
    if (!expense) throw new ApiError(404, 'Spesa non trovata', 'EXPENSE_NOT_FOUND');
    if (expense.paidByUserId === auth.userId) {
      throw new ApiError(403, 'Non puoi approvare o contestare una spesa inserita da te', 'SELF_REVIEW_NOT_ALLOWED');
    }
    throw new ApiError(409, 'Questa spesa è già stata valutata', 'EXPENSE_ALREADY_REVIEWED');
  }

  const { rows } = await pool.query(
    `${expenseSelect} WHERE e.id = $1 AND e.family_id = $2`,
    [expenseId, auth.familyId],
  );

  const updated = rows[0] as Record<string, unknown> | undefined;
  if (!updated) throw new ApiError(500, 'Impossibile rileggere la spesa aggiornata', 'EXPENSE_REFRESH_ERROR');

  const paidByUserId = updated.paidByUserId as string | null;
  if (paidByUserId) {
    const verb = status === 'approved' ? 'approvata' : 'contestata';
    await sendPushToUser(paidByUserId, {
      title: status === 'approved' ? 'Spesa approvata' : 'Spesa contestata',
      body: `La spesa “${String(updated.title)}” di ${formatEuroAmount(String(updated.amount))} è stata ${verb} da ${parentRoleLabel(auth.role)}.`,
      data: {
        type: status === 'approved' ? 'expense_approved' : 'expense_declined',
        screen: 'expenses',
        expenseId,
      },
    });
  }

  return serializeExpense(updated, auth.userId);
}

router.post('/:id/approve', asyncHandler(async (req, res) => {
  res.json(await reviewExpense(req, 'approved'));
}));

router.post('/:id/decline', asyncHandler(async (req, res) => {
  res.json(await reviewExpense(req, 'declined'));
}));

export default router;
