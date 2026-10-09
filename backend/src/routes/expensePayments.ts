import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { requireAuth, requireFamily, type ParentRole } from '../auth.js';
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
const rejectSchema = z.object({ reason: z.string().trim().min(3, 'Indica perché il pagamento non risulta ricevuto.').max(2000) });

async function expenseForFamily(expenseId: string, familyId: string, client?: PoolClient) {
  const { rows } = await (client ?? pool).query<{
    id: string; status: string; amount: string; paidByUserId: string; paidByRole: 'father'|'mother'; fatherPercentage: string; motherPercentage: string;
  }>(
    `SELECT e.id, e.status, e.amount::numeric(12,2)::text AS amount,
            e.paid_by_user_id AS "paidByUserId", u.role AS "paidByRole",
            e.father_percentage::text AS "fatherPercentage", e.mother_percentage::text AS "motherPercentage"
       FROM expenses e JOIN users u ON u.id = e.paid_by_user_id
      WHERE e.id = $1 AND e.family_id = $2 ${client ? 'FOR UPDATE OF e' : ''}`,
    [expenseId, familyId],
  );
  const expense = rows[0];
  if (!expense) throw new ApiError(404, 'Spesa non trovata', 'EXPENSE_NOT_FOUND');
  return expense;
}

function dueForExpense(expense: { amount: string; paidByRole: 'father'|'mother'; fatherPercentage: string; motherPercentage: string }): number {
  const percentage = expense.paidByRole === 'father' ? Number(expense.motherPercentage) : Number(expense.fatherPercentage);
  return Math.round(Number(expense.amount) * percentage);
}

async function confirmedCents(expenseId: string, familyId: string, client: PoolClient | typeof pool = pool): Promise<number> {
  const result = await client.query<{ cents: string }>(
    `SELECT ROUND(COALESCE(SUM(amount),0)*100)::text AS cents
       FROM expense_payments
      WHERE expense_id=$1 AND family_id=$2 AND status='confirmed'`,
    [expenseId, familyId],
  );
  return Number(result.rows[0]?.cents ?? '0');
}

async function refreshExpenseStatus(expenseId: string, familyId: string, client: PoolClient): Promise<'to_pay'|'partially_paid'|'paid'> {
  const expense = await expenseForFamily(expenseId, familyId, client);
  const due = dueForExpense(expense);
  const confirmed = await confirmedCents(expenseId, familyId, client);
  const nextStatus: 'to_pay'|'partially_paid'|'paid' = confirmed <= 0 ? 'to_pay' : confirmed >= due ? 'paid' : 'partially_paid';
  await client.query(`UPDATE expenses SET status=$1, updated_at=NOW() WHERE id=$2 AND family_id=$3`, [nextStatus, expenseId, familyId]);
  return nextStatus;
}

async function familyNet(familyId: string): Promise<{ amountCents: number; creditorRole: ParentRole | null; debtorRole: ParentRole | null }> {
  const { rows } = await pool.query<{ fatherNet: string }>(
    `WITH expense_totals AS (
       SELECT COALESCE(SUM(e.amount) FILTER (WHERE u.role='father'),0::numeric) AS father_paid,
              COALESCE(SUM(e.amount * e.father_percentage / 100),0::numeric) AS father_share
         FROM expenses e
         JOIN users u ON u.id=e.paid_by_user_id
        WHERE e.family_id=$1
          AND e.status IN ('approved','to_pay','partially_paid','paid','closed')
     )
     SELECT (father_paid - father_share + COALESCE((
              SELECT SUM(CASE WHEN payer.role='father' THEN p.amount ELSE -p.amount END)
                FROM expense_payments p
                JOIN users payer ON payer.id=p.paid_by_user_id
                JOIN expenses ex ON ex.id=p.expense_id
               WHERE p.family_id=$1 AND p.status='confirmed'
                 AND ex.status IN ('approved','to_pay','partially_paid','paid','closed')
            ),0))::numeric(12,2)::text AS "fatherNet"
       FROM expense_totals`,
    [familyId],
  );
  const net = Number(rows[0]?.fatherNet ?? '0');
  if (Math.abs(net) < 0.005) return { amountCents: 0, creditorRole: null, debtorRole: null };
  return {
    amountCents: Math.round(Math.abs(net) * 100),
    creditorRole: net > 0 ? 'father' : 'mother',
    debtorRole: net > 0 ? 'mother' : 'father',
  };
}

router.get('/settlements', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query(
    `SELECT s.id,
            s.amount::numeric(12,2)::text AS amount,
            s.status,
            s.paid_at AS "paidAt",
            s.notes,
            s.receipt_filename AS "receiptFilename",
            s.receipt_mime_type AS "receiptMimeType",
            CASE WHEN s.receipt_data IS NULL THEN NULL ELSE '/expenses/settlements/' || s.id::text || '/receipt' END AS "receiptUrl",
            s.paid_by_user_id AS "paidByUserId",
            payer.display_name AS "paidByName",
            payer.role AS "paidByRole",
            s.received_by_user_id AS "receivedByUserId",
            receiver.display_name AS "receivedByName",
            receiver.role AS "receivedByRole",
            s.confirmed_at AS "confirmedAt",
            s.rejected_at AS "rejectedAt",
            s.rejection_reason AS "rejectionReason",
            s.allocation_summary AS "allocationSummary",
            s.created_at AS "createdAt"
       FROM family_settlements s
       JOIN users payer ON payer.id=s.paid_by_user_id
       JOIN users receiver ON receiver.id=s.received_by_user_id
      WHERE s.family_id=$1
      ORDER BY s.created_at DESC`,
    [auth.familyId],
  );
  res.json(rows.map((row: any) => ({ ...row, canConfirm: row.receivedByUserId === auth.userId && row.status === 'declared' })));
}));

router.get('/settlements/:settlementId/receipt', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const settlementId = uuid.parse(req.params.settlementId);
  const { rows } = await pool.query<{ data: Buffer | null; mime: string | null; filename: string | null }>(
    `SELECT receipt_data AS data, receipt_mime_type AS mime, receipt_filename AS filename
       FROM family_settlements WHERE id=$1 AND family_id=$2`,
    [settlementId, auth.familyId],
  );
  const file = rows[0];
  if (!file?.data) throw new ApiError(404, 'Prova di pagamento non trovata', 'SETTLEMENT_RECEIPT_NOT_FOUND');
  res.setHeader('Content-Type', file.mime ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${(file.filename ?? 'saldo').replace(/["\\\r\n]/g, '_')}"`);
  res.send(file.data);
}));

router.post('/settlements', uploadProof, asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createSchema.parse(req.body);
  const net = await familyNet(auth.familyId);
  if (!net.debtorRole || !net.creditorRole || net.amountCents <= 0) throw new ApiError(409, 'Non ci sono saldi da regolare.', 'NO_SETTLEMENT_DUE');
  if (auth.role !== net.debtorRole) throw new ApiError(403, 'Il saldo può essere registrato solo dal genitore che deve rimborsare.', 'SETTLEMENT_WRONG_PAYER');

  const pending = await pool.query<{ cents: string }>(
    `SELECT ROUND(COALESCE(SUM(amount),0)*100)::text AS cents
       FROM family_settlements
      WHERE family_id=$1 AND paid_by_user_id=$2 AND status='declared'`,
    [auth.familyId, auth.userId],
  );
  const available = net.amountCents - Number(pending.rows[0]?.cents ?? '0');
  const cents = Math.round(Number(body.amount) * 100);
  if (cents <= 0 || cents > available) throw new ApiError(409, 'L’importo supera il saldo netto ancora da regolare.', 'INVALID_SETTLEMENT_AMOUNT');

  const receiver = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE family_id=$1 AND role=$2 AND id<>$3 AND deactivated_at IS NULL LIMIT 1`,
    [auth.familyId, net.creditorRole, auth.userId],
  );
  const receiverId = receiver.rows[0]?.id;
  if (!receiverId) throw new ApiError(409, 'L’altro genitore non è disponibile nella famiglia.', 'OTHER_PARENT_NOT_FOUND');

  const id = randomUUID();
  const paidAt = body.paidAt ?? new Date().toISOString();
  await pool.query(
    `INSERT INTO family_settlements
      (id,family_id,paid_by_user_id,received_by_user_id,amount,paid_at,receipt_filename,receipt_mime_type,receipt_data,notes)
     VALUES ($1,$2,$3,$4,$5::numeric,$6::timestamptz,$7,$8,$9,$10)`,
    [id, auth.familyId, auth.userId, receiverId, body.amount, paidAt, req.file?.originalname ?? null, req.file?.mimetype ?? null, req.file?.buffer ?? null, body.notes ?? null],
  );
  await pool.query(
    `INSERT INTO family_activity_history (id,family_id,actor_user_id,entity_type,entity_id,action,details)
     VALUES ($1,$2,$3,'family_settlement',$4,'settlement_declared',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, id, JSON.stringify({ amount: body.amount, paidAt, creditorRole: net.creditorRole, debtorRole: net.debtorRole })],
  );
  await sendPushToUser(receiverId, {
    title: 'Saldo familiare registrato',
    body: `${parentRoleLabel(auth.role)} ha registrato un pagamento netto di € ${body.amount}. Conferma la ricezione.`,
    data: { type: 'settlement_declared', screen: 'expenses', settlementId: id },
  });
  res.status(201).json({ id, amount: body.amount, status: 'declared', paidAt, canConfirm: false });
}));

router.post('/settlements/:settlementId/reject', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const settlementId = uuid.parse(req.params.settlementId);
  const { reason } = rejectSchema.parse(req.body);
  const result = await pool.query<{ paidByUserId: string; amount: string }>(
    `UPDATE family_settlements
        SET status='rejected', rejected_by_user_id=$1, rejected_at=clock_timestamp(), rejection_reason=$2
      WHERE id=$3 AND family_id=$4 AND received_by_user_id=$1 AND status='declared'
      RETURNING paid_by_user_id AS "paidByUserId", amount::numeric(12,2)::text AS amount`,
    [auth.userId, reason, settlementId, auth.familyId],
  );
  const settlement = result.rows[0];
  if (!settlement) throw new ApiError(409, 'Saldo non disponibile per la contestazione.', 'SETTLEMENT_NOT_REJECTABLE');
  await pool.query(
    `INSERT INTO family_activity_history (id,family_id,actor_user_id,entity_type,entity_id,action,details)
     VALUES ($1,$2,$3,'family_settlement',$4,'settlement_rejected',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, settlementId, JSON.stringify({ amount: settlement.amount, reason })],
  );
  await sendPushToUser(settlement.paidByUserId, {
    title: 'Saldo non ricevuto',
    body: `${parentRoleLabel(auth.role)} ha segnalato di non aver ricevuto il pagamento di € ${settlement.amount}.`,
    data: { type: 'settlement_rejected', screen: 'expenses', settlementId },
  });
  res.json({ id: settlementId, status: 'rejected', rejectionReason: reason });
}));

router.post('/settlements/:settlementId/confirm', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const settlementId = uuid.parse(req.params.settlementId);
  const client = await pool.connect();
  let payerId = '';
  let amount = '';
  const allocations: Array<{ expenseId: string; amount: string }> = [];
  try {
    await client.query('BEGIN');
    const settlementResult = await client.query<{ paidByUserId: string; receivedByUserId: string; amount: string }>(
      `SELECT paid_by_user_id AS "paidByUserId", received_by_user_id AS "receivedByUserId", amount::numeric(12,2)::text AS amount
         FROM family_settlements
        WHERE id=$1 AND family_id=$2 AND status='declared'
        FOR UPDATE`,
      [settlementId, auth.familyId],
    );
    const settlement = settlementResult.rows[0];
    if (!settlement || settlement.receivedByUserId !== auth.userId) throw new ApiError(409, 'Saldo non disponibile per la conferma.', 'SETTLEMENT_NOT_CONFIRMABLE');
    payerId = settlement.paidByUserId;
    amount = settlement.amount;
    let remaining = Math.round(Number(settlement.amount) * 100);

    const payer = await client.query<{ role: ParentRole }>(`SELECT role FROM users WHERE id=$1 AND family_id=$2`, [payerId, auth.familyId]);
    const payerRole = payer.rows[0]?.role;
    if (!payerRole) throw new ApiError(409, 'Genitore pagatore non disponibile.', 'SETTLEMENT_PAYER_NOT_FOUND');

    const expenses = await client.query<{
      id: string; amount: string; paidByRole: 'father'|'mother'; fatherPercentage: string; motherPercentage: string;
    }>(
      `SELECT e.id, e.amount::numeric(12,2)::text AS amount, owner.role AS "paidByRole",
              e.father_percentage::text AS "fatherPercentage", e.mother_percentage::text AS "motherPercentage"
         FROM expenses e
         JOIN users owner ON owner.id=e.paid_by_user_id
        WHERE e.family_id=$1 AND e.paid_by_user_id=$2
          AND e.status IN ('approved','to_pay','partially_paid')
        ORDER BY e.expense_date ASC, e.created_at ASC
        FOR UPDATE OF e`,
      [auth.familyId, auth.userId],
    );

    for (const expense of expenses.rows) {
      if (remaining <= 0) break;
      const due = dueForExpense(expense);
      const already = await confirmedCents(expense.id, auth.familyId, client);
      const outstanding = Math.max(0, due - already);
      if (outstanding <= 0) continue;
      const allocated = Math.min(remaining, outstanding);
      const paymentId = randomUUID();
      const allocatedAmount = (allocated / 100).toFixed(2);
      await client.query(
        `INSERT INTO expense_payments
          (id,family_id,expense_id,paid_by_user_id,amount,status,paid_at,confirmed_by_user_id,confirmed_at,settlement_id,notes)
         VALUES ($1,$2,$3,$4,$5::numeric,'confirmed',clock_timestamp(),$6,clock_timestamp(),$7,'Compensazione tramite Regola saldo')`,
        [paymentId, auth.familyId, expense.id, payerId, allocatedAmount, auth.userId, settlementId],
      );
      allocations.push({ expenseId: expense.id, amount: allocatedAmount });
      remaining -= allocated;
      const confirmedAfter = already + allocated;
      const nextStatus = confirmedAfter >= due ? 'paid' : 'partially_paid';
      await client.query(`UPDATE expenses SET status=$1, updated_at=NOW() WHERE id=$2 AND family_id=$3`, [nextStatus, expense.id, auth.familyId]);
      await client.query(
        `INSERT INTO family_activity_history (id,family_id,actor_user_id,entity_type,entity_id,action,details)
         VALUES ($1,$2,$3,'expense_payment',$4,'settlement_allocated',$5::jsonb)`,
        [randomUUID(), auth.familyId, auth.userId, paymentId, JSON.stringify({ expenseId: expense.id, settlementId, amount: allocatedAmount, expenseStatus: nextStatus })],
      );
    }

    if (remaining > 0) throw new ApiError(409, 'Non è stato possibile distribuire completamente il saldo sulle spese aperte. Ricarica la pagina e riprova.', 'SETTLEMENT_ALLOCATION_MISMATCH');

    await client.query(
      `UPDATE family_settlements
          SET status='confirmed', confirmed_by_user_id=$1, confirmed_at=clock_timestamp(), allocation_summary=$2::jsonb
        WHERE id=$3 AND family_id=$4`,
      [auth.userId, JSON.stringify(allocations), settlementId, auth.familyId],
    );
    await client.query(
      `INSERT INTO family_activity_history (id,family_id,actor_user_id,entity_type,entity_id,action,details)
       VALUES ($1,$2,$3,'family_settlement',$4,'settlement_confirmed',$5::jsonb)`,
      [randomUUID(), auth.familyId, auth.userId, settlementId, JSON.stringify({ amount, allocations })],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  await sendPushToUser(payerId, {
    title: 'Saldo ricevuto',
    body: `${parentRoleLabel(auth.role)} ha confermato il pagamento netto di € ${amount}. Le spese collegate sono state aggiornate.`,
    data: { type: 'settlement_confirmed', screen: 'expenses', settlementId },
  });
  res.json({ id: settlementId, status: 'confirmed', allocations });
}));

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
            p.notes, p.confirmed_by_user_id AS "confirmedByUserId", p.confirmed_at AS "confirmedAt",
            p.rejected_by_user_id AS "rejectedByUserId", p.rejected_at AS "rejectedAt", p.rejection_reason AS "rejectionReason",
            p.settlement_id AS "settlementId", p.created_at AS "createdAt"
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
  const id = randomUUID();
  const paidAt = body.paidAt ?? new Date().toISOString();
  const client = await pool.connect();
  let recipient: string;
  try {
    await client.query('BEGIN');
    const expense = await expenseForFamily(expenseId, auth.familyId, client);
    if (!['approved','to_pay','partially_paid'].includes(expense.status)) throw new ApiError(409, 'La spesa deve essere approvata prima del pagamento', 'EXPENSE_NOT_PAYABLE');
    if (expense.paidByUserId === auth.userId) throw new ApiError(409, 'Hai già anticipato questa spesa: il rimborso deve essere registrato dall’altro genitore', 'PAYMENT_WRONG_PAYER');

    const due = dueForExpense(expense);
    const reserved = await client.query<{ cents: string }>(`SELECT ROUND(COALESCE(SUM(amount),0)*100)::text AS cents FROM expense_payments WHERE expense_id=$1 AND family_id=$2 AND status IN ('declared','confirmed')`, [expenseId,auth.familyId]);
    const cents = Math.round(Number(body.amount)*100);
    if(cents <= 0 || cents > due-Number(reserved.rows[0]?.cents ?? '0')) throw new ApiError(409,'L’importo supera il residuo da rimborsare, inclusi i pagamenti in attesa di conferma.','INVALID_PAYMENT_AMOUNT');
    await client.query(
      `INSERT INTO expense_payments
        (id, family_id, expense_id, paid_by_user_id, amount, paid_at, receipt_filename, receipt_mime_type, receipt_data, notes)
       VALUES ($1,$2,$3,$4,$5::numeric,$6::timestamptz,$7,$8,$9,$10)`,
      [id, auth.familyId, expenseId, auth.userId, body.amount, paidAt, req.file?.originalname ?? null, req.file?.mimetype ?? null, req.file?.buffer ?? null, body.notes ?? null],
    );
    await client.query(
      `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
       VALUES ($1,$2,$3,'expense_payment',$4,'payment_declared',$5::jsonb)`,
      [randomUUID(), auth.familyId, auth.userId, id, JSON.stringify({ expenseId, amount: body.amount, paidAt })],
    );
    recipient = expense.paidByUserId;
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  await sendPushToUser(recipient, {
    title: 'Pagamento registrato',
    body: `${parentRoleLabel(auth.role)} ha registrato un pagamento di € ${body.amount}. Conferma se lo hai ricevuto.`,
    data: { type: 'payment_declared', screen: 'expenses', expenseId, paymentId: id },
  });
  res.status(201).json({ id, expenseId, amount: body.amount, status: 'declared', paidAt, canConfirm: false });
}));

router.post('/:id/payments/:paymentId/reject', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const paymentId = uuid.parse(req.params.paymentId);
  const { reason } = rejectSchema.parse(req.body);
  const client = await pool.connect();
  let payerId = '';
  let amount = '';
  let expenseStatus: 'to_pay'|'partially_paid'|'paid' = 'to_pay';
  try {
    await client.query('BEGIN');
    const expense = await expenseForFamily(expenseId, auth.familyId, client);
    if (expense.paidByUserId !== auth.userId) throw new ApiError(403, 'Solo chi ha anticipato la spesa può segnalare un pagamento non ricevuto.', 'PAYMENT_REJECT_NOT_ALLOWED');
    const result = await client.query<{ paidByUserId: string; amount: string }>(
      `UPDATE expense_payments
          SET status='rejected', rejected_by_user_id=$1, rejected_at=clock_timestamp(), rejection_reason=$2
        WHERE id=$3 AND expense_id=$4 AND family_id=$5 AND status='declared' AND paid_by_user_id<>$1
        RETURNING paid_by_user_id AS "paidByUserId", amount::numeric(12,2)::text AS amount`,
      [auth.userId, reason, paymentId, expenseId, auth.familyId],
    );
    const payment = result.rows[0];
    if (!payment) throw new ApiError(409, 'Pagamento non disponibile per la contestazione.', 'PAYMENT_NOT_REJECTABLE');
    payerId = payment.paidByUserId;
    amount = payment.amount;
    expenseStatus = await refreshExpenseStatus(expenseId, auth.familyId, client);
    await client.query(
      `INSERT INTO family_activity_history (id,family_id,actor_user_id,entity_type,entity_id,action,details)
       VALUES ($1,$2,$3,'expense_payment',$4,'payment_rejected',$5::jsonb)`,
      [randomUUID(), auth.familyId, auth.userId, paymentId, JSON.stringify({ expenseId, amount, reason, expenseStatus })],
    );
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  await sendPushToUser(payerId, {
    title: 'Pagamento non ricevuto',
    body: `${parentRoleLabel(auth.role)} ha segnalato di non aver ricevuto il pagamento di € ${amount}. Apri DueCase per leggere la motivazione.`,
    data: { type: 'payment_rejected', screen: 'expenses', expenseId, paymentId },
  });
  res.json({ id: paymentId, status: 'rejected', expenseStatus, rejectionReason: reason });
}));

router.post('/:id/payments/:paymentId/confirm', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const paymentId = uuid.parse(req.params.paymentId);
  const client = await pool.connect();
  let payerId = '';
  let amount = '';
  let nextStatus: 'to_pay'|'partially_paid'|'paid' = 'to_pay';
  try {
    await client.query('BEGIN');
    const expense = await expenseForFamily(expenseId, auth.familyId, client);
    if (expense.paidByUserId !== auth.userId) throw new ApiError(403, 'Solo chi ha anticipato la spesa può confermare la ricezione', 'PAYMENT_CONFIRM_NOT_ALLOWED');

    const paymentResult = await client.query<{ paidByUserId: string; amount: string }>(
      `UPDATE expense_payments
          SET status = 'confirmed', confirmed_by_user_id = $1, confirmed_at = clock_timestamp()
        WHERE id = $2 AND expense_id = $3 AND family_id = $4 AND status = 'declared' AND paid_by_user_id <> $1
        RETURNING paid_by_user_id AS "paidByUserId", amount::numeric(12,2)::text AS amount`,
      [auth.userId, paymentId, expenseId, auth.familyId],
    );
    const payment = paymentResult.rows[0];
    if (!payment) throw new ApiError(409, 'Pagamento non disponibile per la conferma', 'PAYMENT_NOT_CONFIRMABLE');
    payerId = payment.paidByUserId;
    amount = payment.amount;
    nextStatus = await refreshExpenseStatus(expenseId, auth.familyId, client);
    await client.query(
      `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
       VALUES ($1,$2,$3,'expense_payment',$4,'payment_confirmed',$5::jsonb)`,
      [randomUUID(), auth.familyId, auth.userId, paymentId, JSON.stringify({ expenseId, amount, expenseStatus: nextStatus })],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  await sendPushToUser(payerId, {
    title: 'Pagamento ricevuto',
    body: `${parentRoleLabel(auth.role)} ha confermato di aver ricevuto il pagamento di € ${amount}.`,
    data: { type: 'payment_confirmed', screen: 'expenses', expenseId, paymentId },
  });
  res.json({ id: paymentId, status: 'confirmed', expenseStatus: nextStatus });
}));

export default router;
