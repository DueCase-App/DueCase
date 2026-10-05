import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily, type ParentRole } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();
router.use(requireAuth);

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
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

  const values: string[] = [auth.familyId];
  const filters = ['family_id = $1', 'custody_date IS NOT NULL', 'custodian_role IS NOT NULL'];

  if (query.from) {
    values.push(query.from);
    filters.push(`custody_date >= $${values.length}`);
  }
  if (query.to) {
    values.push(query.to);
    filters.push(`custody_date <= $${values.length}`);
  }

  const { rows } = await pool.query<DailyTurnRow>(
    `SELECT id,
            family_id AS "familyId",
            custody_date::text AS "custodyDate",
            custodian_role AS "custodianRole",
            parent_id AS "parentId",
            notes,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM custody_turns
      WHERE ${filters.join(' AND ')}
      ORDER BY custody_date ASC`,
    values,
  );

  res.json(rows);
}));

router.put('/:date', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const custodyDate = dateString.parse(req.params.date);
  const body = upsertDaySchema.parse(req.body);

  const parentResult = await pool.query<{ id: string }>(
    `SELECT id
       FROM parents
      WHERE family_id = $1 AND role = $2
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
