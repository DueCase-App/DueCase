import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { asyncHandler } from '../http.js';

const router = Router();
router.use(requireAuth);

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).default(100),
  entityType: z.string().trim().min(1).max(80).optional(),
  before: z.string().datetime().optional(),
});

type ActivityRow = {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: 'father' | 'mother' | null;
};

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const query = querySchema.parse(req.query);
  const values: Array<string | number> = [auth.familyId];
  const filters = ['h.family_id = $1'];

  if (query.entityType) {
    values.push(query.entityType);
    filters.push(`h.entity_type = $${values.length}`);
  }
  if (query.before) {
    values.push(query.before);
    filters.push(`h.created_at < $${values.length}::timestamptz`);
  }
  values.push(query.limit);

  const { rows } = await pool.query<ActivityRow>(
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
      WHERE ${filters.join(' AND ')}
      ORDER BY h.created_at DESC, h.id DESC
      LIMIT $${values.length}`,
    values,
  );

  res.json(rows);
}));

export default router;
