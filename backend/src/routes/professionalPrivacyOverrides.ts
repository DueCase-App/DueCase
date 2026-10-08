import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db.js';
import { asyncHandler } from '../http.js';
import { getProfessionalAuth, requireProfessionalAuth } from '../professionalAuth.js';
import { appendProfessionalAudit, requireProfessionalGrant, type ProfessionalScope } from '../services/professionalAccessService.js';

const router = Router();
router.use(requireProfessionalAuth);
const uuid = z.string().uuid();
const CHILD_RELEVANT_SCOPES: ProfessionalScope[] = ['calendar', 'expenses', 'documents'];

router.get('/clients/:grantId/overview', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId);

  const counts: Record<string, number> = {};
  const queries: Array<Promise<void>> = [];
  const count = (scope: ProfessionalScope, sql: string) => {
    if (!grant.scopes.includes(scope)) return;
    queries.push(pool.query<{ count: string }>(sql, [grant.familyId]).then((result) => {
      counts[scope] = Number(result.rows[0]?.count ?? 0);
    }));
  };
  count('calendar', 'SELECT COUNT(*)::text AS count FROM family_events WHERE family_id=$1');
  count('expenses', 'SELECT COUNT(*)::text AS count FROM expenses WHERE family_id=$1');
  count('agreements', 'SELECT COUNT(*)::text AS count FROM family_agreements WHERE family_id=$1');
  count('documents', 'SELECT COUNT(*)::text AS count FROM documents WHERE family_id=$1');
  count('messages', 'SELECT COUNT(*)::text AS count FROM messages WHERE family_id=$1');
  await Promise.all(queries);

  const maySeeChildren = grant.scopes.some((scope) => CHILD_RELEVANT_SCOPES.includes(scope));
  const children = maySeeChildren
    ? (await pool.query(
      'SELECT id, display_name AS "displayName", birth_date::text AS "birthDate" FROM children WHERE family_id=$1 ORDER BY display_name',
      [grant.familyId],
    )).rows
    : [];

  await appendProfessionalAudit({
    action: 'professional_view',
    professionalId: professional.professionalId,
    grantId: grant.id,
    familyId: grant.familyId,
    details: { section: 'overview' },
  });

  res.json({
    grantId: grant.id,
    familyId: grant.familyId,
    familyName: grant.familyName,
    grantedByName: grant.grantedByName,
    scopes: grant.scopes,
    children,
    counts,
    readOnly: true,
  });
}));

export default router;
