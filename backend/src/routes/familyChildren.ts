import { Router } from 'express';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { asyncHandler } from '../http.js';

const router = Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query(
    `SELECT id,
            display_name AS "displayName",
            birth_date::text AS "birthDate"
       FROM children
      WHERE family_id = $1
      ORDER BY birth_date NULLS LAST, display_name ASC`,
    [auth.familyId],
  );
  res.json(rows);
}));

export default router;
