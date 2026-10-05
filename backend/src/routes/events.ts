import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { asyncHandler } from '../http.js';

const router = Router();
router.use(requireAuth);

const createEventSchema = z.object({
  title: z.string().trim().min(1).max(180),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  location: z.string().trim().max(240).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.endsAt && new Date(value.endsAt).getTime() <= new Date(value.startsAt).getTime()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endsAt'], message: 'La fine deve essere successiva all’inizio.' });
  }
});

const eventSelect = `
  SELECT id,
         family_id AS "familyId",
         title,
         starts_at AS "startsAt",
         ends_at AS "endsAt",
         location,
         notes,
         created_by_user_id AS "createdByUserId",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
    FROM family_events
`;

router.get('/upcoming', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 3, 1), 20);
  const { rows } = await pool.query(
    `${eventSelect}
      WHERE family_id = $1
        AND starts_at >= NOW()
      ORDER BY starts_at ASC
      LIMIT $2`,
    [auth.familyId, limit],
  );
  res.json(rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createEventSchema.parse(req.body);
  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO family_events
      (id, family_id, title, starts_at, ends_at, location, notes, created_by_user_id)
     VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8)
     RETURNING id,
               family_id AS "familyId",
               title,
               starts_at AS "startsAt",
               ends_at AS "endsAt",
               location,
               notes,
               created_by_user_id AS "createdByUserId",
               created_at AS "createdAt",
               updated_at AS "updatedAt"`,
    [id, auth.familyId, body.title, body.startsAt, body.endsAt ?? null, body.location ?? null, body.notes ?? null, auth.userId],
  );
  res.status(201).json(rows[0]);
}));

export default router;
