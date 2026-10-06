import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { parentRoleLabel, sendPushToUser } from '../services/notificationService.js';

const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const disputeSchema = z.object({
  reason: z.string().trim().min(3, 'Indica il motivo della contestazione.').max(2000),
});

type ExpenseOwner = {
  id: string;
  title: string;
  amount: string;
  status: string;
  paidByUserId: string;
};

async function getExpense(expenseId: string, familyId: string): Promise<ExpenseOwner> {
  const { rows } = await pool.query<ExpenseOwner>(
    `SELECT id,
            title,
            amount::numeric(12,2)::text AS amount,
            status,
            paid_by_user_id AS "paidByUserId"
       FROM expenses
      WHERE id = $1 AND family_id = $2`,
    [expenseId, familyId],
  );
  const expense = rows[0];
  if (!expense) throw new ApiError(404, 'Spesa non trovata', 'EXPENSE_NOT_FOUND');
  return expense;
}

router.get('/:id/history', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  await getExpense(expenseId, auth.familyId);

  const { rows } = await pool.query(
    `SELECT h.id,
            h.entity_type AS "entityType",
            h.entity_id AS "entityId",
            h.action,
            h.details,
            to_char(h.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
            h.actor_user_id AS "actorUserId",
            u.display_name AS "actorName",
            u.role AS "actorRole"
       FROM family_activity_history h
       LEFT JOIN users u ON u.id = h.actor_user_id
      WHERE h.family_id = $1
        AND (
          (h.entity_type = 'expense' AND h.entity_id = $2)
          OR
          (h.entity_type = 'expense_payment' AND h.details->>'expenseId' = $2::text)
        )
      ORDER BY h.created_at DESC, h.id DESC`,
    [auth.familyId, expenseId],
  );

  res.json(rows);
}));

router.post('/:id/dispute', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const expenseId = uuid.parse(req.params.id);
  const body = disputeSchema.parse(req.body);
  const expense = await getExpense(expenseId, auth.familyId);

  if (expense.paidByUserId === auth.userId) {
    throw new ApiError(403, 'Non puoi contestare una spesa inserita da te', 'SELF_REVIEW_NOT_ALLOWED');
  }
  if (expense.status !== 'pending_approval') {
    throw new ApiError(409, 'Questa spesa non è disponibile per la contestazione', 'EXPENSE_NOT_REVIEWABLE');
  }

  const client = await pool.connect();
  let reviewedAt = new Date().toISOString();
  try {
    await client.query('BEGIN');
    const result = await client.query<{ reviewedAt: string }>(
      `UPDATE expenses
          SET status = 'disputed',
              reviewed_by_user_id = $1,
              reviewed_at = clock_timestamp(),
              updated_at = NOW()
        WHERE id = $2
          AND family_id = $3
          AND paid_by_user_id <> $1
          AND status = 'pending_approval'
        RETURNING to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "reviewedAt"`,
      [auth.userId, expenseId, auth.familyId],
    );
    const updated = result.rows[0];
    if (!updated) throw new ApiError(409, 'La spesa è già stata valutata', 'EXPENSE_NOT_REVIEWABLE');
    reviewedAt = updated.reviewedAt;

    await client.query(
      `UPDATE otp_requests
          SET status = 'expired'
        WHERE expense_id = $1 AND status = 'pending'`,
      [expenseId],
    );

    await client.query(
      `INSERT INTO family_activity_history
        (id, family_id, actor_user_id, entity_type, entity_id, action, details)
       VALUES ($1,$2,$3,'expense',$4,'disputed',$5::jsonb)`,
      [
        randomUUID(),
        auth.familyId,
        auth.userId,
        expenseId,
        JSON.stringify({ reason: body.reason, role: auth.role, status: 'disputed' }),
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    throw error;
  } finally {
    client.release();
  }

  await sendPushToUser(expense.paidByUserId, {
    title: 'Spesa contestata',
    body: `${parentRoleLabel(auth.role)} ha contestato la spesa “${expense.title}”. Apri DueCase per leggere la motivazione.`,
    data: { type: 'expense_disputed', screen: 'expenses', expenseId },
  });

  res.json({
    id: expenseId,
    status: 'disputed',
    reviewedAt,
    disputeReason: body.reason,
  });
}));

export default router;
