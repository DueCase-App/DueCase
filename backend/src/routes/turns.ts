import { dateSchema } from '../services/validation.js';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily, type ParentRole } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();
router.use(requireAuth);

const dateString = dateSchema;
const parentRole = z.enum(['father', 'mother']);

const listSchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'from must be before or equal to to',
  path: ['to'],
});

const upsertDaySchema = z.object({
  custodianRole: parentRole,
  notes: z.string().trim().max(2000).nullish(),
});

type DailyTurnRow = {
  id: string;
  familyId: string;
  custodyDate: string;
  custodianRole: ParentRole;
  parentId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const query = listSchema.parse(req.query);

  const from = query.from ?? new Date().toISOString().slice(0,7)+'-01';
  const to = query.to ?? new Date(new Date(from).getTime()+31*86400000).toISOString().slice(0,10);
  if ((new Date(to).getTime()-new Date(from).getTime())/86400000 > 366) throw new ApiError(400,'Seleziona al massimo un anno.','RANGE_TOO_LARGE');
  const {rows}=await pool.query(`SELECT c.*, d::date::text AS "custodyDate",
    c."childId"::text || ':' || d::date::text AS id, $1::uuid AS "familyId"
    FROM generate_series($2::date,$3::date,interval '1 day') d
    CROSS JOIN LATERAL duecase_custody($1,d::date) c WHERE c."custodianRole" IS NOT NULL
    ORDER BY d,c."childName"`,[auth.familyId,from,to]);

  res.json(rows);
}));

router.put('/:date', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const custodyDate = dateString.parse(req.params.date);
  const body = upsertDaySchema.parse(req.body);

  const parentResult = await pool.query<{ id: string }>(
    `SELECT p.id
       FROM parents p JOIN users u ON u.id=p.id
      WHERE p.family_id = $1 AND p.role = $2 AND u.deleted_at IS NULL
      LIMIT 1`,
    [auth.familyId, body.custodianRole],
  );

  const parentId = parentResult.rows[0]?.id;
  if (!parentId) {
    throw new ApiError(409, 'The selected parent has not joined this family yet', 'PARENT_NOT_AVAILABLE');
  }

  const id = randomUUID();
  const { rows } = await pool.query<DailyTurnRow>(
    `INSERT INTO custody_turns (
       id, family_id, parent_id, child_id, starts_at, ends_at, title, notes,
       custody_date, custodian_role, updated_at
     )
     VALUES (
       $1, $2, $3, NULL,
       ($4::date)::timestamp AT TIME ZONE 'UTC',
       (($4::date + 1)::timestamp AT TIME ZONE 'UTC'),
       $5, $6, $4::date, $7, NOW()
     )
     ON CONFLICT (family_id, custody_date) WHERE custody_date IS NOT NULL
     DO UPDATE SET
       parent_id = EXCLUDED.parent_id,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       title = EXCLUDED.title,
       notes = EXCLUDED.notes,
       custodian_role = EXCLUDED.custodian_role,
       updated_at = NOW()
     RETURNING id,
               family_id AS "familyId",
               custody_date::text AS "custodyDate",
               custodian_role AS "custodianRole",
               parent_id AS "parentId",
               notes,
               created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [
      id,
      auth.familyId,
      parentId,
      custodyDate,
      body.custodianRole === 'father' ? 'Custodia padre' : 'Custodia madre',
      body.notes ?? null,
      body.custodianRole,
    ],
  );

  res.json(rows[0]);
}));

export default router;
