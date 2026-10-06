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
const eventType = z.enum(['custody','overnight','holiday','vacation','school','sport','medical','birthday','appointment','personal','other']);
const createEventSchema = z.object({
  title: z.string().trim().min(1).max(180),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().trim().max(240).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  childId: uuid.nullable().optional(),
  eventType: eventType.optional().default('other'),
  requiresApproval: z.boolean().optional().default(false),
}).superRefine((value, ctx) => {
  if (value.endsAt && new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'La fine deve essere successiva all’inizio.' });
  }
});
const listSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  status: z.enum(['pending','confirmed','rejected']).optional(),
});
const respondSchema = z.object({
  status: z.enum(['confirmed','rejected']),
  note: z.string().trim().max(2000).nullable().optional(),
});

const eventSelect = `
  SELECT e.id,
         e.family_id AS "familyId",
         e.title,
         e.starts_at AS "startsAt",
         e.ends_at AS "endsAt",
         e.location,
         e.notes,
         e.child_id AS "childId",
         c.display_name AS "childName",
         e.event_type AS "eventType",
         e.status,
         e.requires_approval AS "requiresApproval",
         e.created_by_user_id AS "createdByUserId",
         creator.display_name AS "createdByName",
         creator.role AS "createdByRole",
         e.reviewed_by AS "reviewedBy",
         e.reviewed_at AS "reviewedAt",
         e.response_note AS "responseNote",
         e.created_at AS "createdAt",
         e.updated_at AS "updatedAt"
    FROM family_events e
    LEFT JOIN children c ON c.id = e.child_id AND c.family_id = e.family_id
    LEFT JOIN users creator ON creator.id = e.created_by_user_id
`;

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const query = listSchema.parse(req.query);
  const values: unknown[] = [auth.familyId];
  const filters = ['e.family_id = $1'];
  if (query.from) { values.push(query.from); filters.push(`e.starts_at >= $${values.length}::timestamptz`); }
  if (query.to) { values.push(query.to); filters.push(`e.starts_at <= $${values.length}::timestamptz`); }
  if (query.status) { values.push(query.status); filters.push(`e.status = $${values.length}`); }
  const { rows } = await pool.query(`${eventSelect} WHERE ${filters.join(' AND ')} ORDER BY e.starts_at ASC`, values);
  res.json(rows.map((row: any) => ({ ...row, canRespond: row.requiresApproval && row.status === 'pending' && row.createdByUserId !== auth.userId })));
}));

router.get('/upcoming', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 20);
  const { rows } = await pool.query(
    `${eventSelect}
      WHERE e.family_id = $1
        AND e.starts_at >= NOW()
        AND e.status <> 'rejected'
      ORDER BY e.starts_at ASC
      LIMIT $2`,
    [auth.familyId, limit],
  );
  res.json(rows.map((row: any) => ({ ...row, canRespond: row.requiresApproval && row.status === 'pending' && row.createdByUserId !== auth.userId })));
}));

router.post('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createEventSchema.parse(req.body);
  if (body.childId) {
    const child = await pool.query(`SELECT id FROM children WHERE id = $1 AND family_id = $2`, [body.childId, auth.familyId]);
    if (!child.rows[0]) throw new ApiError(404, 'Figlio non trovato', 'CHILD_NOT_FOUND');
  }

  const id = randomUUID();
  const status = body.requiresApproval ? 'pending' : 'confirmed';
  await pool.query(
    `INSERT INTO family_events
      (id, family_id, title, starts_at, ends_at, location, notes, child_id, event_type, status, requires_approval, created_by_user_id)
     VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8,$9,$10,$11,$12)`,
    [id, auth.familyId, body.title, body.startsAt, body.endsAt ?? null, body.location ?? null, body.notes ?? null, body.childId ?? null, body.eventType, status, body.requiresApproval, auth.userId],
  );
  const { rows } = await pool.query(`${eventSelect} WHERE e.id = $1 AND e.family_id = $2`, [id, auth.familyId]);

  {
    await sendPushToOtherParent(auth.familyId, auth.userId, {
      title: body.requiresApproval ? 'Nuova richiesta calendario' : 'Nuovo evento',
      body: `${parentRoleSubject(auth.role)} ha inserito “${body.title}”. ${body.requiresApproval ? 'Apri DueCase per rispondere.' : 'Apri il calendario per i dettagli.'}`,
      data: { type: 'event_approval', screen: 'calendar', eventId: id },
    });
  }
  await pool.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'event',$4,'created',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, id, JSON.stringify({ title: body.title, status, eventType: body.eventType })],
  );
  res.status(201).json({ ...rows[0], canRespond: false });
}));

router.post('/:id/respond', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const id = uuid.parse(req.params.id);
  const body = respondSchema.parse(req.body);
  const { rows, existing } = await transaction(async(client) => {
  const existingResult = await client.query<{
    id: string;
    createdByUserId: string;
    status: string;
    requiresApproval: boolean;
    title: string;
  }>(
    `SELECT id,
            created_by_user_id AS "createdByUserId",
            status,
            requires_approval AS "requiresApproval",
            title
       FROM family_events
      WHERE id = $1 AND family_id = $2
      FOR UPDATE`,
    [id, auth.familyId],
  );
  const existing = existingResult.rows[0];
  if (!existing) throw new ApiError(404, 'Evento non trovato', 'EVENT_NOT_FOUND');
  if (!existing.requiresApproval) throw new ApiError(409, 'Questo evento non richiede approvazione', 'APPROVAL_NOT_REQUIRED');
  if (existing.createdByUserId === auth.userId) throw new ApiError(403, 'Non puoi approvare la tua richiesta', 'SELF_REVIEW_NOT_ALLOWED');
  if (existing.status !== 'pending') throw new ApiError(409, 'La richiesta è già stata gestita', 'EVENT_ALREADY_REVIEWED');

  const updated = await client.query(
    `UPDATE family_events
        SET status = $1, reviewed_by = $2, reviewed_at = clock_timestamp(), response_note = $3, updated_at = NOW()
      WHERE id = $4 AND family_id = $5 AND status = 'pending'`,
    [body.status, auth.userId, body.note ?? null, id, auth.familyId],
  );
  if (!updated.rowCount) throw new ApiError(409, 'Evento già gestito', 'EVENT_ALREADY_REVIEWED');
  const { rows } = await client.query(`${eventSelect} WHERE e.id = $1 AND e.family_id = $2`, [id, auth.familyId]);
  await client.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'event',$4,$5,$6::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, id, body.status, JSON.stringify({ note: body.note ?? null })],
  );

    return { rows, existing };
  });
  await pool.query(`UPDATE in_app_notifications SET read_at=clock_timestamp() WHERE user_id=$1 AND family_id=$2 AND entity_type='event' AND entity_id=$3 AND read_at IS NULL`,[auth.userId,auth.familyId,id]);
  await sendPushToUser(existing.createdByUserId, {
    title: body.status === 'confirmed' ? 'Evento approvato' : 'Evento rifiutato',
    body: `${parentRoleSubject(auth.role)} ha ${body.status === 'confirmed' ? 'approvato' : 'rifiutato'} “${existing.title}”.`,
    data: {
      type: body.status === 'confirmed' ? 'event_approved' : 'event_rejected',
      screen: 'calendar',
      eventId: id,
    },
  });

  res.json({ ...rows[0], canRespond: false });
}));

export default router;
