import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();
router.use(requireAuth);
const uuid = z.string().uuid();

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const values: unknown[] = [auth.userId, auth.familyId];
  const unreadFilter = unreadOnly ? ' AND read_at IS NULL' : '';
  const { rows } = await pool.query(
    `SELECT id, type, title, body, entity_type AS "entityType", entity_id AS "entityId",
            read_at AS "readAt", created_at AS "createdAt"
       FROM in_app_notifications
      WHERE user_id = $1 AND family_id = $2${unreadFilter}
      ORDER BY created_at DESC
      LIMIT 200`,
    values,
  );
  res.json(rows);
}));

router.put('/:id/read', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const id = uuid.parse(req.params.id);
  const result = await pool.query(
    `UPDATE in_app_notifications
        SET read_at = COALESCE(read_at, clock_timestamp())
      WHERE id = $1 AND user_id = $2 AND family_id = $3
      RETURNING id, read_at AS "readAt"`,
    [id, auth.userId, auth.familyId],
  );
  if (!result.rows[0]) throw new ApiError(404, 'Notifica non trovata', 'NOTIFICATION_NOT_FOUND');
  res.json(result.rows[0]);
}));

router.put('/read-all', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const result = await pool.query(
    `UPDATE in_app_notifications
        SET read_at = COALESCE(read_at, clock_timestamp())
      WHERE user_id = $1 AND family_id = $2 AND read_at IS NULL`,
    [auth.userId, auth.familyId],
  );
  res.json({ ok: true, updated: result.rowCount ?? 0 });
}));

export default router;
