import { parentRoleSubject, sendPushToOtherParent } from '../services/notificationService.js';
import { dateSchema } from '../services/validation.js';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const childSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  birthDate: dateString.nullable().optional(),
  school: z.string().trim().max(180).nullable().optional(),
  className: z.string().trim().max(120).nullable().optional(),
  sports: z.string().trim().max(500).nullable().optional(),
  extracurricular: z.string().trim().max(1000).nullable().optional(),
  usefulInfo: z.string().trim().max(4000).nullable().optional(),
  authorizations: z.string().trim().max(4000).nullable().optional(),
  sharedNotes: z.string().trim().max(4000).nullable().optional(),
});

const childSelect = `
  SELECT id,
         family_id AS "familyId",
         display_name AS "displayName",
         birth_date::text AS "birthDate",
         school,
         class_name AS "className",
         sports,
         extracurricular,
         useful_info AS "usefulInfo",
         authorizations,
         shared_notes AS "sharedNotes",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
    FROM children
`;

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query(
    `${childSelect}
      WHERE family_id = $1
      ORDER BY birth_date NULLS LAST, display_name ASC`,
    [auth.familyId],
  );
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = childSchema.parse(req.body);
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO children (
       id, family_id, display_name, birth_date, school, class_name, sports,
       extracurricular, useful_info, authorizations, shared_notes, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     RETURNING id,
               family_id AS "familyId",
               display_name AS "displayName",
               birth_date::text AS "birthDate",
               school,
               class_name AS "className",
               sports,
               extracurricular,
               useful_info AS "usefulInfo",
               authorizations,
               shared_notes AS "sharedNotes",
               created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [
      id, auth.familyId, body.displayName, body.birthDate ?? null, body.school ?? null,
      body.className ?? null, body.sports ?? null, body.extracurricular ?? null,
      body.usefulInfo ?? null, body.authorizations ?? null, body.sharedNotes ?? null,
    ],
  );
  await pool.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'child',$4,'created',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, id, JSON.stringify({ displayName: body.displayName })],
  );
  await sendPushToOtherParent(auth.familyId,auth.userId,{title:'Nuova scheda figlio',body:`${parentRoleSubject(auth.role)} ha aggiunto una scheda.`,data:{type:'child_created',screen:'children',childId:id}});
  res.status(201).json(rows[0]);
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const childId = uuid.parse(req.params.id);
  const body = childSchema.partial().parse(req.body);

  const existing = await pool.query(`SELECT id FROM children WHERE id = $1 AND family_id = $2`, [childId, auth.familyId]);
  if (!existing.rows[0]) throw new ApiError(404, 'Figlio non trovato', 'CHILD_NOT_FOUND');

  const fields: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };
  if (body.displayName !== undefined) add('display_name', body.displayName);
  if (body.birthDate !== undefined) add('birth_date', body.birthDate);
  if (body.school !== undefined) add('school', body.school);
  if (body.className !== undefined) add('class_name', body.className);
  if (body.sports !== undefined) add('sports', body.sports);
  if (body.extracurricular !== undefined) add('extracurricular', body.extracurricular);
  if (body.usefulInfo !== undefined) add('useful_info', body.usefulInfo);
  if (body.authorizations !== undefined) add('authorizations', body.authorizations);
  if (body.sharedNotes !== undefined) add('shared_notes', body.sharedNotes);

  if (fields.length === 0) throw new ApiError(400, 'Nessuna modifica da salvare', 'NO_CHANGES');
  fields.push('updated_at = NOW()');
  values.push(childId, auth.familyId);

  const { rows } = await pool.query(
    `UPDATE children SET ${fields.join(', ')}
      WHERE id = $${values.length - 1} AND family_id = $${values.length}
      RETURNING id,
                family_id AS "familyId",
                display_name AS "displayName",
                birth_date::text AS "birthDate",
                school,
                class_name AS "className",
                sports,
                extracurricular,
                useful_info AS "usefulInfo",
                authorizations,
                shared_notes AS "sharedNotes",
                created_at AS "createdAt",
                updated_at AS "updatedAt"`,
    values,
  );

  await pool.query(
    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
     VALUES ($1,$2,$3,'child',$4,'updated',$5::jsonb)`,
    [randomUUID(), auth.familyId, auth.userId, childId, JSON.stringify(body)],
  );
  await sendPushToOtherParent(auth.familyId,auth.userId,{title:'Scheda figlio aggiornata',body:`${parentRoleSubject(auth.role)} ha aggiornato una scheda.`,data:{type:'child_updated',screen:'children',childId}});
  res.json(rows[0]);
}));

export default router;
