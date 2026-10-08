import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { pool } from '../db.js';
import { ApiError } from '../http.js';

export const PROFESSIONAL_SCOPES = ['calendar','expenses','agreements','documents','dossier','messages'] as const;
export type ProfessionalScope = typeof PROFESSIONAL_SCOPES[number];
export const professionalScopeSchema = z.enum(PROFESSIONAL_SCOPES);
const PROFESSIONAL_DATA_SCOPES: ProfessionalScope[] = ['calendar','expenses','agreements','documents','messages'];
export const professionalScopesSchema = z.array(professionalScopeSchema).min(1).max(PROFESSIONAL_SCOPES.length)
  .transform((scopes) => [...new Set(scopes)])
  .superRefine((scopes, ctx) => {
    if (scopes.includes('dossier') && !scopes.some((scope) => PROFESSIONAL_DATA_SCOPES.includes(scope))) {
      ctx.addIssue({
        code: 'custom',
        message: 'Per autorizzare il Dossier seleziona almeno una sezione dati da includere.',
      });
    }
  });

export function createProfessionalInvitationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashProfessionalInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type ProfessionalGrant = {
  id: string;
  professionalId: string;
  familyId: string;
  familyName: string;
  grantedByUserId: string | null;
  grantedByName: string | null;
  scopes: ProfessionalScope[];
  createdAt: string;
};

export async function requireProfessionalGrant(
  professionalId: string,
  grantId: string,
  scope?: ProfessionalScope,
): Promise<ProfessionalGrant> {
  const { rows } = await pool.query<ProfessionalGrant>(
    `SELECT g.id,
            g.professional_id AS "professionalId",
            g.family_id AS "familyId",
            f.name AS "familyName",
            g.granted_by_user_id AS "grantedByUserId",
            parent.display_name AS "grantedByName",
            g.scopes,
            g.created_at AS "createdAt"
       FROM professional_access_grants g
       JOIN families f ON f.id = g.family_id
       LEFT JOIN users parent ON parent.id = g.granted_by_user_id
      WHERE g.id = $1
        AND g.professional_id = $2
        AND g.revoked_at IS NULL
      LIMIT 1`,
    [grantId, professionalId],
  );
  const grant = rows[0];
  if (!grant) throw new ApiError(404, 'Pratica non disponibile o accesso revocato', 'PROFESSIONAL_GRANT_NOT_FOUND');
  if (scope && !grant.scopes.includes(scope)) {
    throw new ApiError(403, 'Questa sezione non è stata autorizzata dal genitore', 'PROFESSIONAL_SCOPE_REQUIRED', { scope });
  }
  return grant;
}

export async function appendProfessionalAudit(input: {
  action: 'invited'|'invitation_resent'|'invitation_revoked'|'invitation_accepted'|'access_scopes_updated'|'access_revoked'|'professional_view'|'professional_export';
  professionalId?: string | null;
  grantId?: string | null;
  familyId?: string | null;
  actorParentUserId?: string | null;
  details?: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `INSERT INTO professional_access_audit
      (id, professional_id, grant_id, family_id, actor_parent_user_id, action, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      randomUUID(),
      input.professionalId ?? null,
      input.grantId ?? null,
      input.familyId ?? null,
      input.actorParentUserId ?? null,
      input.action,
      JSON.stringify(input.details ?? {}),
    ],
  );
}
