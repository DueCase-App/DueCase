from pathlib import Path

# Generic email for professional portal notifications.
email_path = Path('backend/src/services/emailService.ts')
email = email_path.read_text(encoding='utf-8')
if 'sendProfessionalPortalNotice' not in email:
    email += r'''

export async function sendProfessionalPortalNotice(input: { to: string; displayName: string; title: string; message: string }): Promise<void> {
  if (!isEmailConfigured()) throw new Error('SMTP_NOT_CONFIGURED');
  const site = config.SITE_URL.replace(/\/$/, '');
  const subject = `DueCase · ${input.title}`;
  const text = `Ciao ${input.displayName},\n\n${input.message}\n\nAccedi al portale professionisti: ${site}/professionisti/`;
  const html = emailShell({
    eyebrow: 'Portale professionisti',
    title: input.title,
    body: `<p style="margin:0 0 14px">Ciao <strong>${escapeHtml(input.displayName)}</strong>,</p><p style="margin:0 0 20px">${escapeHtml(input.message)}</p><p style="text-align:center;margin:24px 0"><a href="${site}/professionisti/" style="display:inline-block;background:#1769E0;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700">Apri portale professionisti</a></p>`,
  });
  await sendEmail({ to: input.to, subject, text, html });
}
'''
    email_path.write_text(email, encoding='utf-8')

# Centralized preference-aware notification service.
Path('backend/src/services/professionalNotificationService.ts').write_text(r'''import { pool } from '../db.js';
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
''', encoding='utf-8')

# Documents -> notify_documents.
p = Path('backend/src/routes/documents.ts')
t = p.read_text(encoding='utf-8')
if 'professionalNotificationService' not in t:
    t = t.replace("import { parentRoleSubject, sendPushToOtherParent } from '../services/notificationService.js';", "import { parentRoleSubject, sendPushToOtherParent } from '../services/notificationService.js';\nimport { notifyProfessionalsForFamily } from '../services/professionalNotificationService.js';")
    anchor = "  await sendPushToOtherParent(auth.familyId, auth.userId, {\n    title: 'Nuovo documento condiviso',\n    body: `${parentRoleSubject(auth.role)} ha caricato “${body.title}” nella sezione Documenti.`,\n    data: { type: 'document_uploaded', screen: 'documents', documentId: id },\n  });"
    repl = anchor + "\n\n  await notifyProfessionalsForFamily({\n    familyId: auth.familyId, preference: 'notify_documents', scope: 'documents',\n    title: 'Nuovo documento condiviso',\n    message: `${auth.displayName} ha condiviso il documento “${body.title}” nella pratica autorizzata.`,\n  });"
    if anchor not in t: raise SystemExit('documents anchor not found')
    p.write_text(t.replace(anchor, repl, 1), encoding='utf-8')

# Expenses -> notify_activity.
p = Path('backend/src/routes/expenses.ts')
t = p.read_text(encoding='utf-8')
if 'professionalNotificationService' not in t:
    t = t.replace("} from '../services/notificationService.js';", "} from '../services/notificationService.js';\nimport { notifyProfessionalsForFamily } from '../services/professionalNotificationService.js';", 1)
    anchor = "  await sendPushToOtherParent(auth.familyId, auth.userId, {\n    title: body.isExtraordinary ? 'Nuova spesa straordinaria' : 'Nuova spesa da approvare',\n    body: `${parentRoleSubject(auth.role)} ha inserito una spesa di ${formatEuroAmount(body.amount)}. Approvala!`,\n    data: { type: 'expense_created', screen: 'expenses', expenseId: id },\n  });"
    repl = anchor + "\n\n  await notifyProfessionalsForFamily({\n    familyId: auth.familyId, preference: 'notify_activity', scope: 'expenses',\n    title: body.isExtraordinary ? 'Nuova spesa straordinaria' : 'Nuova spesa nella pratica',\n    message: `${auth.displayName} ha inserito la spesa “${body.title}” di ${formatEuroAmount(body.amount)}.`,\n  });"
    if anchor not in t: raise SystemExit('expenses anchor not found')
    p.write_text(t.replace(anchor, repl, 1), encoding='utf-8')

# Calendar -> notify_activity.
p = Path('backend/src/routes/events.ts')
t = p.read_text(encoding='utf-8')
if 'professionalNotificationService' not in t:
    t = t.replace("import { parentRoleSubject, sendPushToOtherParent, sendPushToUser } from '../services/notificationService.js';", "import { parentRoleSubject, sendPushToOtherParent, sendPushToUser } from '../services/notificationService.js';\nimport { notifyProfessionalsForFamily } from '../services/professionalNotificationService.js';")
    anchor = "  await pool.query(\n    `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)\n     VALUES ($1,$2,$3,'event',$4,'created',$5::jsonb)`,\n    [randomUUID(), auth.familyId, auth.userId, id, JSON.stringify({ title: body.title, status, eventType: body.eventType })],\n  );"
    repl = anchor + "\n  await notifyProfessionalsForFamily({\n    familyId: auth.familyId, preference: 'notify_activity', scope: 'calendar',\n    title: body.requiresApproval ? 'Nuova richiesta calendario' : 'Nuovo evento calendario',\n    message: `${auth.displayName} ha inserito “${body.title}” nel calendario della pratica.`,\n  });"
    if anchor not in t: raise SystemExit('events anchor not found')
    p.write_text(t.replace(anchor, repl, 1), encoding='utf-8')

# Agreements -> notify_activity.
p = Path('backend/src/routes/agreements.ts')
t = p.read_text(encoding='utf-8')
if 'professionalNotificationService' not in t:
    t = t.replace("import { parentRoleSubject, sendPushToOtherParent, sendPushToUser } from '../services/notificationService.js';", "import { parentRoleSubject, sendPushToOtherParent, sendPushToUser } from '../services/notificationService.js';\nimport { notifyProfessionalsForFamily } from '../services/professionalNotificationService.js';")
    anchor = "  await sendPushToOtherParent(auth.familyId, auth.userId, {\n    title: 'Nuovo accordo DueCase',\n    body: `${parentRoleSubject(auth.role)} ha proposto un nuovo accordo: ${body.title}`,\n    data: { type: 'agreement_created', screen: 'agreements', agreementId: id },\n  });"
    repl = anchor + "\n  await notifyProfessionalsForFamily({\n    familyId: auth.familyId, preference: 'notify_activity', scope: 'agreements',\n    title: 'Nuovo accordo nella pratica',\n    message: `${auth.displayName} ha proposto l’accordo “${body.title}”.`,\n  });"
    if anchor not in t: raise SystemExit('agreements anchor not found')
    p.write_text(t.replace(anchor, repl, 1), encoding='utf-8')

# Parent changes/revokes professional access -> notify_access_changes.
p = Path('backend/src/routes/professionals.ts')
t = p.read_text(encoding='utf-8')
if 'professionalNotificationService' not in t:
    t = t.replace("import { rateLimit } from '../services/rateLimit.js';", "import { rateLimit } from '../services/rateLimit.js';\nimport { notifyProfessionalAccessChange } from '../services/professionalNotificationService.js';")
    t = t.replace('RETURNING id, scopes, updated_at AS "updatedAt"`', 'RETURNING id, professional_id AS "professionalId", scopes, updated_at AS "updatedAt"`', 1)
    anchor = "  await appendProfessionalAudit({ action: 'access_scopes_updated', grantId, familyId: auth.familyId, actorParentUserId: auth.userId, details: { scopes: body.scopes } });\n  res.json(grant);"
    repl = "  await appendProfessionalAudit({ action: 'access_scopes_updated', grantId, familyId: auth.familyId, actorParentUserId: auth.userId, details: { scopes: body.scopes } });\n  await notifyProfessionalAccessChange({ professionalId: grant.professionalId, title: 'Permessi della pratica aggiornati', message: `${auth.displayName} ha modificato le sezioni che puoi consultare per la pratica ${auth.familyName ?? 'DueCase'}.` });\n  res.json(grant);"
    if anchor not in t: raise SystemExit('professional scope anchor not found')
    t = t.replace(anchor, repl, 1)
    anchor2 = "  await appendProfessionalAudit({ action: 'access_revoked', professionalId: grant.professionalId, grantId, familyId: auth.familyId, actorParentUserId: auth.userId });\n  res.status(204).send();"
    repl2 = "  await appendProfessionalAudit({ action: 'access_revoked', professionalId: grant.professionalId, grantId, familyId: auth.familyId, actorParentUserId: auth.userId });\n  await notifyProfessionalAccessChange({ professionalId: grant.professionalId, title: 'Accesso alla pratica revocato', message: `${auth.displayName} ha revocato il tuo accesso alla pratica ${auth.familyName ?? 'DueCase'}.` });\n  res.status(204).send();"
    if anchor2 not in t: raise SystemExit('professional revoke anchor not found')
    p.write_text(t.replace(anchor2, repl2, 1), encoding='utf-8')
