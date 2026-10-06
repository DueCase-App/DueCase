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
const categorySchema = z.enum(['calendar','vacation','expense','school','sport','medical','organization','other']);
const statusSchema = z.enum(['pending','approved','rejected','changes_requested']);
const createSchema = z.object({
  category: categorySchema,
  title: z.string().trim().min(1).max(180),
  body: z.string().trim().min(1).max(8000),
});
const responseSchema = z.object({
  status: z.enum(['approved','rejected','changes_requested']),
  note: z.string().trim().max(4000).nullable().optional(),
});
const listSchema = z.object({ status: statusSchema.optional() });

const agreementSelect = `
  SELECT a.id,
         a.family_id AS "familyId",
         a.created_by AS "createdBy",
         creator.display_name AS "createdByName",
         creator.role AS "createdByRole",
         a.category,
         a.title,
         a.body,
         a.status,
         a.reviewed_by AS "reviewedBy",
         reviewer.display_name AS "reviewedByName",
         reviewer.role AS "reviewedByRole",
         a.response_note AS "responseNote",
         a.reviewed_at AS "reviewedAt",
         a.created_at AS "createdAt",
         a.updated_at AS "updatedAt"
    FROM family_agreements a
    JOIN users creator ON creator.id = a.created_by
    LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
`;

async function appendHistory(input: {
  agreementId: string;
  familyId: string;
  actorUserId: string;
  action: 'created' | 'approved' | 'rejected' | 'changes_requested' | 'updated';
  snapshot: unknown;
}): Promise<void> {
  await pool.query(
    `INSERT INTO family_agreement_history (id, agreement_id, family_id, actor_user_id, action, snapshot)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [randomUUID(), input.agreementId, input.familyId, input.actorUserId, input.action, JSON.stringify(input.snapshot)],
  );
}

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const query = listSchema.parse(req.query);
  const values: string[] = [auth.familyId];
  const filter = query.status ? (values.push(query.status), ` AND a.status = $${values.length}`) : '';
  const { rows } = await pool.query(
    `${agreementSelect} WHERE a.family_id = $1${filter} ORDER BY a.created_at DESC`,
    values,
  );
  res.json(rows.map((row: any) => ({ ...row, canRespond: row.createdBy !== auth.userId && row.status === 'pending' })));
}));

router.get('/:id/history', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const agreementId = uuid.parse(req.params.id);
  const agreement = await pool.query(`SELECT id FROM family_agreements WHERE id = $1 AND family_id = $2`, [agreementId, auth.familyId]);
  if (!agreement.rows[0]) throw new ApiError(404, 'Accordo non trovato', 'AGREEMENT_NOT_FOUND');
  const { rows } = await pool.query(
    `SELECT h.id, h.action, h.snapshot, h.created_at AS "createdAt",
            u.display_name AS "actorName", u.role AS "actorRole"
       FROM family_agreement_history h
       LEFT JOIN users u ON u.id = h.actor_user_id
      WHERE h.agreement_id = $1 AND h.family_id = $2
      ORDER BY h.created_at ASC`,
    [agreementId, auth.familyId],
  );
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createSchema.parse(req.body);
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO family_agreements (id, family_id, created_by, category, title, body)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, family_id AS "familyId", created_by AS "createdBy", category, title, body,
               status, reviewed_by AS "reviewedBy", response_note AS "responseNote",
               reviewed_at AS "reviewedAt", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, auth.familyId, auth.userId, body.category, body.title, body.body],
  );
  const agreement = rows[0];
  await appendHistory({ agreementId: id, familyId: auth.familyId, actorUserId: auth.userId, action: 'created', snapshot: agreement });
  await pool.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'agreement',$4,'created',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, id, JSON.stringify({ title: body.title, category: body.category })],
  );
  await sendPushToOtherParent(auth.familyId, auth.userId, {
    title: 'Nuovo accordo DueCase',
    body: `${parentRoleSubject(auth.role)} ha proposto un nuovo accordo: ${body.title}`,
    data: { type: 'agreement_created', screen: 'agreements', agreementId: id },
  });
  res.status(201).json({ ...agreement, canRespond: false });
}));

router.post('/:id/respond', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const agreementId = uuid.parse(req.params.id);
  const body = responseSchema.parse(req.body);
  const existingResult = await pool.query(
    `SELECT id, created_by AS "createdBy", status FROM family_agreements WHERE id = $1 AND family_id = $2 FOR UPDATE`,
    [agreementId, auth.familyId],
  );
  const existing = existingResult.rows[0];
  if (!existing) throw new ApiError(404, 'Accordo non trovato', 'AGREEMENT_NOT_FOUND');
  if (existing.createdBy === auth.userId) throw new ApiError(403, 'Non puoi rispondere al tuo stesso accordo', 'SELF_REVIEW_NOT_ALLOWED');
  if (existing.status !== 'pending') throw new ApiError(409, 'Questo accordo ha già ricevuto una risposta', 'AGREEMENT_ALREADY_REVIEWED');

  const { rows } = await pool.query(
    `UPDATE family_agreements
        SET status = $1, reviewed_by = $2, response_note = $3, reviewed_at = clock_timestamp(), updated_at = NOW()
      WHERE id = $4 AND family_id = $5
      RETURNING id, family_id AS "familyId", created_by AS "createdBy", category, title, body,
                status, reviewed_by AS "reviewedBy", response_note AS "responseNote",
                reviewed_at AS "reviewedAt", created_at AS "createdAt", updated_at AS "updatedAt"`,
    [body.status, auth.userId, body.note ?? null, agreementId, auth.familyId],
  );
  const agreement = rows[0];
  await appendHistory({ agreementId, familyId: auth.familyId, actorUserId: auth.userId, action: body.status, snapshot: agreement });
  await pool.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'agreement',$4,$5,$6::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, agreementId, body.status, JSON.stringify({ note: body.note ?? null })],
  );
  res.json({ ...agreement, canRespond: false });
}));

export default router;
