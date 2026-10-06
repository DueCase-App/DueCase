import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily, type ParentRole } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import {
  formatItalianDate,
  parentRoleSubject,
  sendPushToOtherParent,
  sendPushToUser,
} from '../services/notificationService.js';

const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const createSchema = z.object({
  targetDate: dateString,
  proposedDate: dateString,
  notes: z.string().trim().max(2000).nullish(),
}).refine((value) => value.targetDate !== value.proposedDate, {
  message: 'The two dates must be different',
  path: ['proposedDate'],
});

const responseSchema = z.object({
  note: z.string().trim().max(2000).nullish(),
});

const listSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
});

type SwapRequestRow = {
  id: string;
  familyId: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: ParentRole;
  targetDate: string;
  proposedDate: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  responseNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const swapSelect = `
  SELECT sr.id,
         sr.family_id AS "familyId",
         sr.requested_by AS "requestedBy",
         u.display_name AS "requestedByName",
         u.role AS "requestedByRole",
         sr.target_date::text AS "targetDate",
         sr.proposed_date::text AS "proposedDate",
         sr.status,
         sr.notes,
         sr.response_note AS "responseNote",
         sr.reviewed_by AS "reviewedBy",
         sr.reviewed_at AS "reviewedAt",
         sr.created_at AS "createdAt",
         sr.updated_at AS "updatedAt"
    FROM swap_requests sr
    JOIN users u ON u.id = sr.requested_by
`;

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const query = listSchema.parse(req.query);
  const values: string[] = [auth.familyId];
  let statusFilter = '';

  if (query.status) {
    values.push(query.status);
    statusFilter = ` AND sr.status = $${values.length}`;
  }

  const { rows } = await pool.query<SwapRequestRow>(
    `${swapSelect}
      WHERE sr.family_id = $1${statusFilter}
      ORDER BY CASE WHEN sr.status = 'pending' THEN 0 ELSE 1 END,
               sr.created_at DESC`,
    values,
  );

  res.json(rows.map((row) => ({
    ...row,
    canRespond: row.status === 'pending' && row.requestedBy !== auth.userId,
  })));
}));

router.post('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createSchema.parse(req.body);

  const calendarResult = await pool.query<{ custodyDate: string; custodianRole: ParentRole }>(
    `SELECT custody_date::text AS "custodyDate", custodian_role AS "custodianRole"
       FROM custody_turns
      WHERE family_id = $1
        AND custody_date = ANY($2::date[])
        AND custodian_role IS NOT NULL`,
    [auth.familyId, [body.targetDate, body.proposedDate]],
  );

  const byDate = new Map(calendarResult.rows.map((row) => [row.custodyDate, row]));
  const target = byDate.get(body.targetDate);
  const proposed = byDate.get(body.proposedDate);

  if (!target || !proposed) {
    throw new ApiError(409, 'Both days must already exist in the official custody calendar', 'CALENDAR_DAY_MISSING');
  }
  if (target.custodianRole === auth.role) {
    throw new ApiError(409, 'The requested day already belongs to you', 'TARGET_DAY_ALREADY_YOURS');
  }
  if (proposed.custodianRole !== auth.role) {
    throw new ApiError(409, 'The proposed exchange day must currently belong to you', 'PROPOSED_DAY_NOT_YOURS');
  }

  const id = randomUUID();
  try {
    const { rows } = await pool.query<SwapRequestRow>(
      `WITH inserted AS (
         INSERT INTO swap_requests (
           id, family_id, requested_by, target_date, proposed_date, status, notes
         )
         VALUES ($1, $2, $3, $4::date, $5::date, 'pending', $6)
         RETURNING *
       )
       SELECT i.id,
              i.family_id AS "familyId",
              i.requested_by AS "requestedBy",
              u.display_name AS "requestedByName",
              u.role AS "requestedByRole",
              i.target_date::text AS "targetDate",
              i.proposed_date::text AS "proposedDate",
              i.status,
              i.notes,
              i.response_note AS "responseNote",
              i.reviewed_by AS "reviewedBy",
              i.reviewed_at AS "reviewedAt",
              i.created_at AS "createdAt",
              i.updated_at AS "updatedAt"
         FROM inserted i
         JOIN users u ON u.id = i.requested_by`,
      [id, auth.familyId, auth.userId, body.targetDate, body.proposedDate, body.notes ?? null],
    );

    await sendPushToOtherParent(auth.familyId, auth.userId, {
      title: 'Richiesta cambio turno',
      body: `${parentRoleSubject(auth.role)} ha richiesto uno scambio di turno per il ${formatItalianDate(body.targetDate)}.`,
      data: { type: 'swap_requested', screen: 'calendar', swapRequestId: id },
    });

    res.status(201).json({ ...rows[0], canRespond: false });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ApiError(409, 'An identical swap request is already pending', 'DUPLICATE_SWAP_REQUEST');
    }
    throw error;
  }
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const requestId = uuid.parse(req.params.id);
  const body = responseSchema.parse(req.body ?? {});
  const client = await pool.connect();
  let requesterId: string | null = null;
  let targetDateForNotification: string | null = null;
  let responseRow: SwapRequestRow | undefined;

  try {
    await client.query('BEGIN');

    const requestResult = await client.query<{
      requestedBy: string;
      targetDate: string;
      proposedDate: string;
      status: 'pending' | 'approved' | 'rejected';
      requestedByRole: ParentRole;
    }>(
      `SELECT sr.requested_by AS "requestedBy",
              sr.target_date::text AS "targetDate",
              sr.proposed_date::text AS "proposedDate",
              sr.status,
              u.role AS "requestedByRole"
         FROM swap_requests sr
         JOIN users u ON u.id = sr.requested_by
        WHERE sr.id = $1 AND sr.family_id = $2
        FOR UPDATE OF sr`,
      [requestId, auth.familyId],
    );

    const swap = requestResult.rows[0];
    if (!swap) throw new ApiError(404, 'Swap request not found', 'SWAP_NOT_FOUND');
    if (swap.status !== 'pending') throw new ApiError(409, 'This request has already been reviewed', 'SWAP_ALREADY_REVIEWED');
    if (swap.requestedBy === auth.userId) throw new ApiError(403, 'You cannot approve your own request', 'CANNOT_REVIEW_OWN_REQUEST');
    if (swap.requestedByRole === auth.role) throw new ApiError(403, 'Only the other parent can approve this request', 'INVALID_REVIEWER');

    const daysResult = await client.query<{
      id: string;
      custodyDate: string;
      custodianRole: ParentRole;
    }>(
      `SELECT id,
              custody_date::text AS "custodyDate",
              custodian_role AS "custodianRole"
         FROM custody_turns
        WHERE family_id = $1
          AND custody_date = ANY($2::date[])
          AND custodian_role IS NOT NULL
        FOR UPDATE`,
      [auth.familyId, [swap.targetDate, swap.proposedDate]],
    );

    const byDate = new Map(daysResult.rows.map((row) => [row.custodyDate, row]));
    const target = byDate.get(swap.targetDate);
    const proposed = byDate.get(swap.proposedDate);
    if (!target || !proposed) {
      throw new ApiError(409, 'The official calendar changed and this swap can no longer be applied', 'CALENDAR_CHANGED');
    }
    if (target.custodianRole !== auth.role || proposed.custodianRole !== swap.requestedByRole) {
      throw new ApiError(409, 'The official calendar changed and this swap can no longer be applied', 'CALENDAR_CHANGED');
    }

    await client.query(
      `UPDATE custody_turns
          SET parent_id = $1,
              custodian_role = $2,
              title = $3,
              updated_at = NOW()
        WHERE id = $4`,
      [swap.requestedBy, swap.requestedByRole, swap.requestedByRole === 'father' ? 'Custodia padre' : 'Custodia madre', target.id],
    );

    await client.query(
      `UPDATE custody_turns
          SET parent_id = $1,
              custodian_role = $2,
              title = $3,
              updated_at = NOW()
        WHERE id = $4`,
      [auth.userId, auth.role, auth.role === 'father' ? 'Custodia padre' : 'Custodia madre', proposed.id],
    );

    await client.query(
      `UPDATE swap_requests
          SET status = 'approved',
              response_note = $1,
              reviewed_by = $2,
              reviewed_at = NOW(),
              updated_at = NOW()
        WHERE id = $3`,
      [body.note ?? null, auth.userId, requestId],
    );

    await client.query(
      `INSERT INTO family_activity_history
        (id, family_id, actor_user_id, entity_type, entity_id, action, details)
       VALUES ($1,$2,$3,'swap_request',$4,'approved',$5::jsonb)`,
      [randomUUID(), auth.familyId, auth.userId, requestId, JSON.stringify({ responseNote: body.note ?? null })],
    );

    const { rows } = await client.query<SwapRequestRow>(
      `${swapSelect} WHERE sr.id = $1`,
      [requestId],
    );

    requesterId = swap.requestedBy;
    targetDateForNotification = swap.targetDate;
    responseRow = rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  if (requesterId && targetDateForNotification) {
    await sendPushToUser(requesterId, {
      title: 'Scambio approvato',
      body: `${parentRoleSubject(auth.role)} ha approvato lo scambio del ${formatItalianDate(targetDateForNotification)}.`,
      data: { type: 'swap_approved', screen: 'calendar', swapRequestId: requestId },
    });
  }

  res.json({ ...responseRow, canRespond: false });
}));

router.post('/:id/reject', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const requestId = uuid.parse(req.params.id);
  const body = responseSchema.parse(req.body ?? {});
  const client = await pool.connect();
  let rejected: SwapRequestRow | undefined;

  try {
    await client.query('BEGIN');
    const { rows } = await client.query<SwapRequestRow>(
      `WITH updated AS (
         UPDATE swap_requests
            SET status = 'rejected',
                response_note = $1,
                reviewed_by = $2,
                reviewed_at = NOW(),
                updated_at = NOW()
          WHERE id = $3
            AND family_id = $4
            AND status = 'pending'
            AND requested_by <> $2
         RETURNING *
       )
       SELECT u2.id,
              u2.family_id AS "familyId",
              u2.requested_by AS "requestedBy",
              usr.display_name AS "requestedByName",
              usr.role AS "requestedByRole",
              u2.target_date::text AS "targetDate",
              u2.proposed_date::text AS "proposedDate",
              u2.status,
              u2.notes,
              u2.response_note AS "responseNote",
              u2.reviewed_by AS "reviewedBy",
              u2.reviewed_at AS "reviewedAt",
              u2.created_at AS "createdAt",
              u2.updated_at AS "updatedAt"
         FROM updated u2
         JOIN users usr ON usr.id = u2.requested_by`,
      [body.note ?? null, auth.userId, requestId, auth.familyId],
    );

    rejected = rows[0];
    if (!rejected) {
      const existing = await client.query<{ requestedBy: string; status: string }>(
        `SELECT requested_by AS "requestedBy", status
           FROM swap_requests
          WHERE id = $1 AND family_id = $2`,
        [requestId, auth.familyId],
      );
      if (!existing.rows[0]) throw new ApiError(404, 'Swap request not found', 'SWAP_NOT_FOUND');
      if (existing.rows[0].requestedBy === auth.userId) throw new ApiError(403, 'You cannot reject your own request', 'CANNOT_REVIEW_OWN_REQUEST');
      throw new ApiError(409, 'This request has already been reviewed', 'SWAP_ALREADY_REVIEWED');
    }

    await client.query(
      `INSERT INTO family_activity_history
        (id, family_id, actor_user_id, entity_type, entity_id, action, details)
       VALUES ($1,$2,$3,'swap_request',$4,'rejected',$5::jsonb)`,
      [randomUUID(), auth.familyId, auth.userId, requestId, JSON.stringify({ responseNote: body.note ?? null })],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await sendPushToUser(rejected.requestedBy, {
    title: 'Scambio rifiutato',
    body: `${parentRoleSubject(auth.role)} ha rifiutato lo scambio del ${formatItalianDate(rejected.targetDate)}.`,
    data: { type: 'swap_rejected', screen: 'calendar', swapRequestId: requestId },
  });

  res.json({ ...rejected, canRespond: false });
}));

export default router;
