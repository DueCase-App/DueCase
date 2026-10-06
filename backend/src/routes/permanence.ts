import { dateSchema } from '../services/validation.js';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool, transaction } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { parentRoleSubject, sendPushToOtherParent, sendPushToUser } from '../services/notificationService.js';

const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const role = z.enum(['father','mother']);
const dateString = dateSchema;
const patternSchema = z.object({
  custodianRole: role,
  overnight: z.boolean().optional().default(true),
  notes: z.string().trim().max(2000).nullable().optional(),
});
const alternatingWeekendSchema = z.object({
  anchorSaturday: dateString,
  firstWeekendRole: role,
  secondWeekendRole: role,
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
const responseSchema = z.object({ status: z.enum(['approved','rejected']) });

function romeDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function isSaturday(value: string): boolean {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return false;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const jsDay = date.getUTCDay();
  return jsDay === 6;
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
  await pool.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'custody_pattern',$4,'updated',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, childId, JSON.stringify({ weekday, custodianRole: body.custodianRole, overnight: body.overnight })],
  );
  await sendPushToOtherParent(auth.familyId,auth.userId,{title:'Schema permanenze aggiornato',body:`${parentRoleSubject(auth.role)} ha aggiornato lo schema settimanale.`,data:{type:'custody_pattern_updated',screen:'permanence',childId}});
  res.json(rows[0]);
}));

router.get('/alternating-weekends', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query(
    `SELECT p.id, p.child_id AS "childId", c.display_name AS "childName",
            p.anchor_saturday::text AS "anchorSaturday",
            p.first_weekend_role AS "firstWeekendRole",
            p.second_weekend_role AS "secondWeekendRole",
            p.overnight, p.notes,
            p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM custody_alternating_weekends p
       JOIN children c ON c.id = p.child_id AND c.family_id = p.family_id
      WHERE p.family_id = $1
      ORDER BY c.display_name`,
    [auth.familyId],
  );
  res.json(rows);
}));

router.put('/alternating-weekends/:childId', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const childId = uuid.parse(req.params.childId);
  const body = alternatingWeekendSchema.parse(req.body);
  if (!isSaturday(body.anchorSaturday)) {
    throw new ApiError(400, 'La data iniziale dei weekend alternati deve essere un sabato', 'ANCHOR_MUST_BE_SATURDAY');
  }

  const childResult = await pool.query<{ displayName: string }>(
    `SELECT display_name AS "displayName" FROM children WHERE id = $1 AND family_id = $2`,
    [childId, auth.familyId],
  );
  const child = childResult.rows[0];
  if (!child) throw new ApiError(404, 'Figlio non trovato', 'CHILD_NOT_FOUND');

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO custody_alternating_weekends
      (id, family_id, child_id, anchor_saturday, first_weekend_role, second_weekend_role, overnight, notes, created_by)
     VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9)
     ON CONFLICT (family_id, child_id)
     DO UPDATE SET anchor_saturday = EXCLUDED.anchor_saturday,
                   first_weekend_role = EXCLUDED.first_weekend_role,
                   second_weekend_role = EXCLUDED.second_weekend_role,
                   overnight = EXCLUDED.overnight,
                   notes = EXCLUDED.notes,
                   updated_at = NOW()
     RETURNING id, child_id AS "childId", anchor_saturday::text AS "anchorSaturday",
               first_weekend_role AS "firstWeekendRole", second_weekend_role AS "secondWeekendRole",
               overnight, notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, auth.familyId, childId, body.anchorSaturday, body.firstWeekendRole, body.secondWeekendRole, body.overnight, body.notes ?? null, auth.userId],
  );

  await pool.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'alternating_weekend',$4,'updated',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, childId, JSON.stringify({
      childName: child.displayName,
      anchorSaturday: body.anchorSaturday,
      firstWeekendRole: body.firstWeekendRole,
      secondWeekendRole: body.secondWeekendRole,
      overnight: body.overnight,
    })],
  );

  await sendPushToOtherParent(auth.familyId,auth.userId,{title:'Weekend aggiornati',body:`${parentRoleSubject(auth.role)} ha aggiornato i weekend di ${child.displayName}.`,data:{type:'custody_weekend_updated',screen:'permanence',childId}});
  res.json({ ...rows[0], childName: child.displayName });
}));

router.get('/current', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const date = req.query.date ? dateString.parse(req.query.date) : romeDateKey();

  const { rows } = await pool.query(
    `SELECT * FROM duecase_custody($1,$2::date)`,
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
            COALESCE(requester.display_name, 'Account eliminato') AS "requestedByName",
            COALESCE(requester.role, e.requested_by_role) AS "requestedByRole",
            e.status, e.reviewed_by AS "reviewedBy",
            COALESCE(reviewer.role, e.reviewed_by_role) AS "reviewedByRole",
            e.reviewed_at AS "reviewedAt", e.created_at AS "createdAt", e.updated_at AS "updatedAt"
       FROM custody_exceptions e
       JOIN children c ON c.id = e.child_id AND c.family_id = e.family_id
       LEFT JOIN users requester ON requester.id = e.requested_by
       LEFT JOIN users reviewer ON reviewer.id = e.reviewed_by
      WHERE e.family_id = $1
      ORDER BY e.custody_date DESC, e.created_at DESC`,
    [auth.familyId],
  );
  res.json(rows.map((item: any) => ({ ...item, canRespond: item.requestedBy !== auth.userId && item.status === 'pending' })));
}));

router.post('/exceptions', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = exceptionSchema.parse(req.body);
  const childResult = await pool.query<{ displayName: string }>(
    `SELECT display_name AS "displayName" FROM children WHERE id = $1 AND family_id = $2`,
    [body.childId, auth.familyId],
  );
  const child = childResult.rows[0];
  if (!child) throw new ApiError(404, 'Figlio non trovato', 'CHILD_NOT_FOUND');

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO custody_exceptions
      (id, family_id, child_id, custody_date, custodian_role, overnight, notes, requested_by, requested_by_role)
     VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9)
     RETURNING id, child_id AS "childId", custody_date::text AS "custodyDate",
               custodian_role AS "custodianRole", overnight, notes, requested_by AS "requestedBy",
               requested_by_role AS "requestedByRole", status, created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, auth.familyId, body.childId, body.custodyDate, body.custodianRole, body.overnight, body.notes ?? null, auth.userId, auth.role],
  );
  await pool.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'custody_exception',$4,'created',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, id, JSON.stringify({ childId: body.childId, custodyDate: body.custodyDate, custodianRole: body.custodianRole })],
  );
  await sendPushToOtherParent(auth.familyId, auth.userId, {
    title: 'Richiesta cambio permanenza',
    body: `${parentRoleSubject(auth.role)} ha richiesto una modifica per ${child.displayName} il ${body.custodyDate}.`,
    data: { type: 'custody_exception', screen: 'permanence', exceptionId: id },
  });
  res.status(201).json({ ...rows[0], childName: child.displayName, requestedByName: auth.displayName, canRespond: false });
}));

router.post('/exceptions/:id/respond', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const id = uuid.parse(req.params.id);
  const body = responseSchema.parse(req.body);
  const {row,updated}=await transaction(async client=>{
  const existing = await client.query<{ requestedBy: string; status: string }>(
    `SELECT requested_by AS "requestedBy", status FROM custody_exceptions
      WHERE id = $1 AND family_id = $2 FOR UPDATE`,
    [id, auth.familyId],
  );
  const row = existing.rows[0];
  if (!row) throw new ApiError(404, 'Richiesta non trovata', 'CUSTODY_EXCEPTION_NOT_FOUND');
  if (row.requestedBy === auth.userId) throw new ApiError(403, 'Non puoi approvare la tua richiesta', 'SELF_REVIEW_NOT_ALLOWED');
  if (row.status !== 'pending') throw new ApiError(409, 'Richiesta già gestita', 'REQUEST_ALREADY_REVIEWED');

  const updated = await client.query(
    `UPDATE custody_exceptions
        SET status = $1, reviewed_by = $2, reviewed_by_role = $3, reviewed_at = clock_timestamp(), updated_at = NOW()
      WHERE id = $4 AND family_id = $5 AND status = 'pending'
      RETURNING id, child_id AS "childId", custody_date::text AS "custodyDate",
                custodian_role AS "custodianRole", overnight, notes, requested_by AS "requestedBy",
                requested_by_role AS "requestedByRole", status, reviewed_by AS "reviewedBy",
                reviewed_by_role AS "reviewedByRole", reviewed_at AS "reviewedAt",
                created_at AS "createdAt", updated_at AS "updatedAt"`,
    [body.status, auth.userId, auth.role, id, auth.familyId],
  );
  if (!updated.rowCount) throw new ApiError(409, 'Richiesta già gestita', 'REQUEST_ALREADY_REVIEWED');
  await client.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'custody_exception',$4,$5,$6::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, id, body.status, JSON.stringify({ role: auth.role })],
  );
    return {row,updated};
  });
  await pool.query(`UPDATE in_app_notifications SET read_at=clock_timestamp() WHERE user_id=$1 AND family_id=$2 AND entity_type='custody_exception' AND entity_id=$3 AND read_at IS NULL`,[auth.userId,auth.familyId,id]);
  await sendPushToUser(row.requestedBy, {
    title: body.status === 'approved' ? 'Cambio permanenza accettato' : 'Cambio permanenza rifiutato',
    body: `${parentRoleSubject(auth.role)} ha ${body.status === 'approved' ? 'accettato' : 'rifiutato'} la richiesta di cambio permanenza.`,
    data: { type: `custody_exception_${body.status}`, screen: 'permanence', exceptionId: id },
  });
  res.json({ ...updated.rows[0], canRespond: false });
}));

export default router;
