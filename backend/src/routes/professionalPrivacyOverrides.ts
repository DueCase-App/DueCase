import { Router } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { getProfessionalAuth, requireProfessionalAuth } from '../professionalAuth.js';
import { buildDossier, dossierQuery } from '../services/dossierService.js';
import { appendProfessionalAudit, requireProfessionalGrant, type ProfessionalScope } from '../services/professionalAccessService.js';
import { rateLimit } from '../services/rateLimit.js';

const router = Router();
router.use(requireProfessionalAuth);
const uuid = z.string().uuid();
const CHILD_RELEVANT_SCOPES: ProfessionalScope[] = ['calendar', 'expenses', 'documents'];
const DATA_SCOPES = ['messages','agreements','expenses','calendar','documents'] as const;

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

router.get('/clients/:grantId/dossier', rateLimit(6, 60 * 1000, ['GET']), asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId, 'dossier');
  const query = dossierQuery.parse(req.query);
  const allowedSections = DATA_SCOPES.filter((scope) => grant.scopes.includes(scope));
  const requestedSections = query.sections ? query.sections.split(',').filter(Boolean) : allowedSections;

  if (requestedSections.some((section) => !allowedSections.includes(section as typeof DATA_SCOPES[number]))) {
    throw new ApiError(403, 'Il dossier richiesto include sezioni non autorizzate', 'PROFESSIONAL_DOSSIER_SCOPE_REQUIRED');
  }
  if (requestedSections.length === 0) {
    throw new ApiError(403, 'Nessuna sezione dati è autorizzata per il dossier', 'PROFESSIONAL_DOSSIER_EMPTY');
  }

  const context: AuthContext & { familyId: string } = {
    userId: professional.professionalId,
    sessionId: `professional:${professional.professionalId}`,
    tokenVersion: professional.tokenVersion,
    emailVerifiedAt: null,
    email: professional.email,
    displayName: professional.displayName,
    firstName: professional.firstName,
    lastName: professional.lastName,
    birthDate: null,
    phone: null,
    role: 'father',
    familyId: grant.familyId,
    familyName: grant.familyName,
    inviteCode: null,
  };

  const result = await buildDossier(
    context,
    { ...query, sections: requestedSections.join(',') },
    { includeChildProfiles: false },
  );

  await appendProfessionalAudit({
    action: 'professional_export',
    professionalId: professional.professionalId,
    grantId: grant.id,
    familyId: grant.familyId,
    details: {
      format: query.format,
      sections: requestedSections,
      from: query.from ?? null,
      to: query.to ?? null,
      childId: query.childId ?? null,
      childProfilesIncluded: false,
    },
  });

  res.setHeader('Content-Type', result.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(result.data);
}));

export default router;
