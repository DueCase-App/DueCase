import { pool } from '../db.js';
import { sendProfessionalPortalNotice } from './emailService.js';

type ProfessionalScope = 'calendar'|'expenses'|'agreements'|'documents'|'dossier'|'messages';
type Preference = 'notify_activity'|'notify_documents'|'notify_access_changes';

const preferenceColumn: Record<Preference, string> = {
  notify_activity: 'notify_activity',
  notify_documents: 'notify_documents',
  notify_access_changes: 'notify_access_changes',
};

export async function notifyProfessionalsForFamily(input: {
  familyId: string;
  preference: Preference;
  scope?: ProfessionalScope;
  title: string;
  message: string;
}): Promise<void> {
  const column = preferenceColumn[input.preference];
  const values: unknown[] = [input.familyId];
  const scopeFilter = input.scope ? (values.push(input.scope), `AND $${values.length} = ANY(g.scopes)`) : '';
  const { rows } = await pool.query<{ email: string; displayName: string }>(
    `SELECT DISTINCT p.email, p.display_name AS "displayName"
       FROM professional_users p
       JOIN professional_access_grants g ON g.professional_id = p.id
      WHERE g.family_id = $1
        AND g.revoked_at IS NULL
        AND p.deleted_at IS NULL
        AND p.${column} = TRUE
        ${scopeFilter}`,
    values,
  );
  const results = await Promise.allSettled(rows.map((recipient) => sendProfessionalPortalNotice({
    to: recipient.email,
    displayName: recipient.displayName,
    title: input.title,
    message: input.message,
  })));
  results.forEach((result) => {
    if (result.status === 'rejected') console.error('Professional preference email failed', result.reason instanceof Error ? result.reason.message : result.reason);
  });
}

export async function notifyProfessionalAccessChange(input: {
  professionalId: string;
  title: string;
  message: string;
}): Promise<void> {
  const { rows } = await pool.query<{ email: string; displayName: string }>(
    `SELECT email, display_name AS "displayName"
       FROM professional_users
      WHERE id=$1 AND deleted_at IS NULL AND notify_access_changes=TRUE`,
    [input.professionalId],
  );
  const recipient = rows[0];
  if (!recipient) return;
  await sendProfessionalPortalNotice({
    to: recipient.email,
    displayName: recipient.displayName,
    title: input.title,
    message: input.message,
  }).catch((error) => console.error('Professional access email failed', error instanceof Error ? error.message : error));
}
