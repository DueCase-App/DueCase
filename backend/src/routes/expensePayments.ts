import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { parentRoleLabel, sendPushToUser } from '../services/notificationService.js';

const router = Router();
router.use(requireAuth);
const uuid = z.string().uuid();
const allowedMimeTypes = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => allowedMimeTypes.has(file.mimetype) ? callback(null, true) : callback(new Error('La prova di pagamento deve essere PDF o immagine.')),
});
function uploadProof(req: Request, res: Response, next: NextFunction): void {
  upload.single('receipt')(req, res, (error) => {
    if (!error) { next(); return; }
    next(new ApiError(400, error instanceof Error ? error.message : 'File non valido', 'INVALID_PAYMENT_RECEIPT'));
  });
}
const money = z.string().trim().regex(/^\d{1,10}(?:[.,]\d{1,2})?$/).transform((v) => Number(v.replace(',','.')).toFixed(2));
const createSchema = z.object({
  amount: money,
  paidAt: z.string().datetime().optional(),
  notes: z.string().trim().max(2000).optional(),
});

async function expenseForFamily(expenseId: string, familyId: string) {
  const { rows } = await pool.query<{
    id: string; status: string; amount: string; paidByUserId: string; paidByRole: 'father'|'mother'; fatherPercentage: string; motherPercentage: string;
  }>(
    `SELECT e.id, e.status, e.amount::numeric(12,2)::text AS amount,
            e.paid_by_user_id AS "paidByUserId", u.role AS "paidByRole",
            e.father_percentage::text AS "fatherPercentage", e.mother_percentage::text AS "motherPercentage"
       FROM expenses e JOIN users u ON u.id = e.paid_by_user_id
      WHERE e.id = $1 AND e.family_id = $2`,
    [expenseId, familyId],
  );
  const expense = rows[0];
  if (!expense) throw new ApiError(404, 'Spesa non trovata', 'EXPENSE_NOT_FOUND');
  return expense;
}

router.get('/:id/payments', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  await expenseForFamily(expenseId, auth.familyId);
  const { rows } = await pool.query(
    `SELECT p.id, p.expense_id AS "expenseId", p.paid_by_user_id AS "paidByUserId",
            payer.display_name AS "paidByName", payer.role AS "paidByRole",
            p.amount::numeric(12,2)::text AS amount, p.status, p.paid_at AS "paidAt",
            p.receipt_filename AS "receiptFilename", p.receipt_mime_type AS "receiptMimeType",
            CASE WHEN p.receipt_data IS NULL THEN NULL ELSE '/expenses/' || p.expense_id::text || '/payments/' || p.id::text || '/receipt' END AS "receiptUrl",
            p.notes, p.confirmed_by_user_id AS "confirmedByUserId", p.confirmed_at AS "confirmedAt", p.created_at AS "createdAt"
       FROM expense_payments p
       LEFT JOIN users payer ON payer.id = p.paid_by_user_id
      WHERE p.family_id = $1 AND p.expense_id = $2
      ORDER BY p.created_at DESC`,
    [auth.familyId, expenseId],
  );
  res.json(rows.map((row: any) => ({ ...row, canConfirm: row.paidByUserId !== auth.userId && row.status === 'declared' })));
}));

router.get('/:id/payments/:paymentId/receipt', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const paymentId = uuid.parse(req.params.paymentId);
  const { rows } = await pool.query<{ data: Buffer | null; mime: string | null; filename: string | null }>(
    `SELECT receipt_data AS data, receipt_mime_type AS mime, receipt_filename AS filename
       FROM expense_payments WHERE id = $1 AND expense_id = $2 AND family_id = $3`,
    [paymentId, expenseId, auth.familyId],
  );
  const file = rows[0];
  if (!file?.data) throw new ApiError(404, 'Prova di pagamento non trovata', 'PAYMENT_RECEIPT_NOT_FOUND');
  res.setHeader('Content-Type', file.mime ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${(file.filename ?? 'pagamento').replace(/["\\\r\n]/g, '_')}"`);
  res.send(file.data);
}));

router.post('/:id/payments', uploadProof, asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const body = createSchema.parse(req.body);
  const expense = await expenseForFamily(expenseId, auth.familyId);
  if (!['approved','to_pay','partially_paid','paid'].includes(expense.status)) throw new ApiError(409, 'La spesa deve essere approvata prima del pagamento', 'EXPENSE_NOT_PAYABLE');
  if (expense.paidByUserId === auth.userId) throw new ApiError(409, 'Hai già anticipato questa spesa: il rimborso deve essere registrato dall’altro genitore', 'PAYMENT_WRONG_PAYER');

  const id = randomUUID();
  const paidAt = body.paidAt ?? new Date().toISOString();
  await pool.query(
    `INSERT INTO expense_payments
      (id, family_id, expense_id, paid_by_user_id, amount, paid_at, receipt_filename, receipt_mime_type, receipt_data, notes)
     VALUES ($1,$2,$3,$4,$5::numeric,$6::timestamptz,$7,$8,$9,$10)`,
    [id, auth.familyId, expenseId, auth.userId, body.amount, paidAt, req.file?.originalname ?? null, req.file?.mimetype ?? null, req.file?.buffer ?? null, body.notes ?? null],
  );
  await pool.query(`UPDATE expenses SET status = CASE WHEN status = 'paid' THEN status ELSE 'partially_paid' END, updated_at = NOW() WHERE id = $1 AND family_id = $2`, [expenseId, auth.familyId]);
  await pool.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'expense_payment',$4,'payment_declared',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, id, JSON.stringify({ expenseId, amount: body.amount, paidAt })],
  );
  await sendPushToUser(expense.paidByUserId, {
    title: 'Pagamento registrato',
    body: `${parentRoleLabel(auth.role)} ha indicato un pagamento di € ${body.amount}. Conferma la ricezione.`,
    data: { type: 'payment_declared', screen: 'expenses', expenseId, paymentId: id },
  });
  res.status(201).json({ id, expenseId, amount: body.amount, status: 'declared', paidAt, canConfirm: false });
}));

router.post('/:id/payments/:paymentId/confirm', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const paymentId = uuid.parse(req.params.paymentId);
  const expense = await expenseForFamily(expenseId, auth.familyId);
  if (expense.paidByUserId !== auth.userId) throw new ApiError(403, 'Solo chi ha anticipato la spesa può confermare la ricezione', 'PAYMENT_CONFIRM_NOT_ALLOWED');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const paymentResult = await client.query<{ paidByUserId: string; amount: string }>(
      `UPDATE expense_payments
          SET status = 'confirmed', confirmed_by_user_id = $1, confirmed_at = clock_timestamp()
        WHERE id = $2 AND expense_id = $3 AND family_id = $4 AND status = 'declared' AND paid_by_user_id <> $1
        RETURNING paid_by_user_id AS "paidByUserId", amount::numeric(12,2)::text AS amount`,
      [auth.userId, paymentId, expenseId, auth.familyId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new ApiError(409, 'Pagamento non disponibile per la conferma', 'PAYMENT_NOT_CONFIRMABLE');

    const confirmed = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount),0)::numeric(12,2)::text AS total
         FROM expense_payments WHERE expense_id = $1 AND family_id = $2 AND status = 'confirmed'`,
      [expenseId, auth.familyId],
    );
    const percentage = expense.paidByRole === 'father' ? Number(expense.motherPercentage) : Number(expense.fatherPercentage);
    const due = Number(expense.amount) * percentage / 100;
    const confirmedTotal = Number(confirmed.rows[0]?.total ?? '0');
    const nextStatus = confirmedTotal + 0.005 >= due ? 'paid' : 'partially_paid';
    await client.query(`UPDATE expenses SET status = $1, updated_at = NOW() WHERE id = $2 AND family_id = $3`, [nextStatus, expenseId, auth.familyId]);
    await client.query(
      `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
       VALUES ($1,$2,$3,'expense_payment',$4,'payment_confirmed',$5::jsonb)`,
      [randomUUID(), auth.familyId, auth.userId, paymentId, JSON.stringify({ expenseId, amount: payment.amount, expenseStatus: nextStatus })],
    );
    await client.query('COMMIT');

    await sendPushToUser(payment.paidByUserId, {
      title: 'Pagamento ricevuto',
      body: `${parentRoleLabel(auth.role)} ha confermato di aver ricevuto il pagamento di € ${payment.amount}.`,
      data: { type: 'payment_confirmed', screen: 'expenses', expenseId, paymentId },
    });
    res.json({ id: paymentId, status: 'confirmed', expenseStatus: nextStatus });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}));

export default router;
