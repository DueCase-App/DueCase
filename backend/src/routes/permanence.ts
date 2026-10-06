import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { parentRoleSubject, sendPushToOtherParent } from '../services/notificationService.js';

const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const role = z.enum(['father','mother']);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const patternSchema = z.object({
  custodianRole: role,
  overnight: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).nullable().optional(),
});
const exceptionSchema = z.object({
  childId: uuid,
  custodyDate: dateString,
  custodianRole: role,
  overnight: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).nullable().optional(),
});
const responseSchema = z.object({
  status: z.enum(['approved','rejected']),
});

function romeDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

router.get('/pattern', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query(
    `SELECT p.id, p.child_id AS "childId", c.display_name AS "childName",
            p.weekday, p.custodian_role AS "custodianRole", p.overnight, p.notes,
            p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM custody_weekly_patterns p
       JOIN children c ON c.id = p.child_id AND c.family_id = p.family_id
      WHERE p.family_id = $1
      ORDER BY c.display_name, p.weekday`,
    [auth.familyId],
  );
  res.json(rows);
}));

router.put('/pattern/:childId/:weekday', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const childId = uuid.parse(req.params.childId);
  const weekday = z.coerce.number().int().min(1).max(7).parse(req.params.weekday);
  const body = patternSchema.parse(req.body);

  const child = await pool.query(`SELECT id FROM children WHERE id = $1 AND family_id = $2`, [childId, auth.familyId]);
  if (!child.rows[0]) throw new ApiError(404, 'Figlio non trovato', 'CHILD_NOT_FOUND');

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO custody_weekly_patterns
      (id, family_id, child_id, weekday, custodian_role, overnight, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (family_id, child_id, weekday)
     DO UPDATE SET custodian_role = EXCLUDED.custodian_role,
                   overnight = EXCLUDED.overnight,
                   notes = EXCLUDED.notes,
                   updated_at = NOW()
     RETURNING id, child_id AS "childId", weekday, custodian_role AS "custodianRole",
               overnight, notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, auth.familyId, childId, weekday, body.custodianRole, body.overnight, body.notes ?? null, auth.userId],
  );
  res.json(rows[0]);
}));

router.get('/current', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const date = req.query.date ? dateString.parse(req.query.date) : romeDateKey();

  const { rows } = await pool.query(
    `WITH kids AS (
       SELECT id, display_name FROM children WHERE family_id = $1
     ), approved_exception AS (
       SELECT DISTINCT ON (child_id) child_id, custodian_role, overnight, notes
         FROM custody_exceptions
        WHERE family_id = $1 AND custody_date = $2::date AND status = 'approved'
        ORDER BY child_id, reviewed_at DESC NULLS LAST, created_at DESC
     ), general_turn AS (
       SELECT custodian_role, notes
         FROM custody_turns
        WHERE family_id = $1 AND custody_date = $2::date
        ORDER BY updated_at DESC LIMIT 1
     ), weekly AS (
       SELECT child_id, custodian_role, overnight, notes
         FROM custody_weekly_patterns
        WHERE family_id = $1 AND weekday = EXTRACT(ISODOW FROM $2::date)::int
     )
     SELECT k.id AS "childId", k.display_name AS "childName",
            COALESCE(e.custodian_role, gt.custodian_role, w.custodian_role) AS "custodianRole",
            COALESCE(e.overnight, w.overnight, TRUE) AS overnight,
            COALESCE(e.notes, gt.notes, w.notes) AS notes,
            CASE WHEN e.child_id IS NOT NULL THEN 'exception'
                 WHEN gt.custodian_role IS NOT NULL THEN 'calendar'
                 WHEN w.child_id IS NOT NULL THEN 'weekly_pattern'
                 ELSE 'undefined' END AS source
       FROM kids k
       LEFT JOIN approved_exception e ON e.child_id = k.id
       LEFT JOIN weekly w ON w.child_id = k.id
       LEFT JOIN general_turn gt ON TRUE
      ORDER BY k.display_name`,
    [auth.familyId, date],
  );

  res.json({ date, children: rows });
}));

router.get('/exceptions', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query(
    `SELECT e.id, e.child_id AS "childId", c.display_name AS "childName",
            e.custody_date::text AS "custodyDate", e.custodian_role AS "custodianRole",
            e.overnight, e.notes, e.requested_by AS "requestedBy",
            requester.display_name AS "requestedByName", requester.role AS "requestedByRole",
            e.status, e.reviewed_by AS "reviewedBy", e.reviewed_at AS "reviewedAt",
            e.created_at AS "createdAt", e.updated_at AS "updatedAt"
       FROM custody_exceptions e
       JOIN children c ON c.id = e.child_id
       JOIN users requester ON requester.id = e.requested_by
      WHERE e.family_id = $1
      ORDER BY e.custody_date DESC, e.created_at DESC`,
    [auth.familyId],
  );
  res.json(rows.map((item: any) => ({ ...item, canRespond: item.requestedBy !== auth.userId && item.status === 'pending' })));
}));

router.post('/exceptions', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = exceptionSchema.parse(req.body);
  const child = await pool.query(`SELECT id FROM children WHERE id = $1 AND family_id = $2`, [body.childId, auth.familyId]);
  if (!child.rows[0]) throw new ApiError(404, 'Figlio non trovato', 'CHILD_NOT_FOUND');

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO custody_exceptions
      (id, family_id, child_id, custody_date, custodian_role, overnight, notes, requested_by)
     VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8)
     RETURNING id, child_id AS "childId", custody_date::text AS "custodyDate",
               custodian_role AS "custodianRole", overnight, notes, requested_by AS "requestedBy",
               status, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, auth.familyId, body.childId, body.custodyDate, body.custodianRole, body.overnight, body.notes ?? null, auth.userId],
  );
  await sendPushToOtherParent(auth.familyId, auth.userId, {
    title: 'Richiesta cambio permanenza',
    body: `${parentRoleSubject(auth.role)} ha richiesto una modifica per il ${body.custodyDate}.`,
    data: { type: 'custody_exception', screen: 'calendar', exceptionId: id },
  });
  res.status(201).json({ ...rows[0], canRespond: false });
}));

router.post('/exceptions/:id/respond', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const id = uuid.parse(req.params.id);
  const body = responseSchema.parse(req.body);
  const existing = await pool.query(
    `SELECT id, requested_by AS "requestedBy", status FROM custody_exceptions
      WHERE id = $1 AND family_id = $2 FOR UPDATE`,
    [id, auth.familyId],
  );
  const row = existing.rows[0];
  if (!row) throw new ApiError(404, 'Richiesta non trovata', 'CUSTODY_EXCEPTION_NOT_FOUND');
  if (row.requestedBy === auth.userId) throw new ApiError(403, 'Non puoi approvare la tua richiesta', 'SELF_REVIEW_NOT_ALLOWED');
  if (row.status !== 'pending') throw new ApiError(409, 'Richiesta già gestita', 'REQUEST_ALREADY_REVIEWED');

  const updated = await pool.query(
    `UPDATE custody_exceptions
        SET status = $1, reviewed_by = $2, reviewed_at = clock_timestamp(), updated_at = NOW()
      WHERE id = $3 AND family_id = $4
      RETURNING id, child_id AS "childId", custody_date::text AS "custodyDate",
                custodian_role AS "custodianRole", overnight, notes, requested_by AS "requestedBy",
                status, reviewed_by AS "reviewedBy", reviewed_at AS "reviewedAt",
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    [body.status, auth.userId, id, auth.familyId],
  );
  res.json({ ...updated.rows[0], canRespond: false });
}));

export default router;
