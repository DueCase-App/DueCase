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
const dataScopes = ['messages','agreements','expenses','calendar','documents'] as const;

async function auditView(professionalId: string, grantId: string, familyId: string, section: string) {
  await appendProfessionalAudit({ action: 'professional_view', professionalId, grantId, familyId, details: { section } });
}

router.get('/clients', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const { rows } = await pool.query(
    `SELECT g.id AS "grantId",
            g.family_id AS "familyId",
            f.name AS "familyName",
            g.scopes,
            g.created_at AS "createdAt",
            parent.display_name AS "grantedByName"
       FROM professional_access_grants g
       JOIN families f ON f.id = g.family_id
       LEFT JOIN users parent ON parent.id = g.granted_by_user_id
      WHERE g.professional_id = $1 AND g.revoked_at IS NULL
      ORDER BY f.name, g.created_at DESC`,
    [professional.professionalId],
  );
  res.json(rows);
}));

router.get('/clients/:grantId/overview', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId);
  const counts: Record<string, number> = {};
  const queries: Array<Promise<void>> = [];
  const count = (scope: ProfessionalScope, sql: string) => {
    if (!grant.scopes.includes(scope)) return;
    queries.push(pool.query<{ count: string }>(sql, [grant.familyId]).then((result) => { counts[scope] = Number(result.rows[0]?.count ?? 0); }));
  };
  count('calendar', `SELECT COUNT(*)::text AS count FROM family_events WHERE family_id=$1`);
  count('expenses', `SELECT COUNT(*)::text AS count FROM expenses WHERE family_id=$1`);
  count('agreements', `SELECT COUNT(*)::text AS count FROM family_agreements WHERE family_id=$1`);
  count('documents', `SELECT COUNT(*)::text AS count FROM documents WHERE family_id=$1`);
  count('messages', `SELECT COUNT(*)::text AS count FROM messages WHERE family_id=$1`);
  await Promise.all(queries);
  const children = await pool.query(
    `SELECT id, display_name AS "displayName", birth_date::text AS "birthDate"
       FROM children WHERE family_id=$1 ORDER BY display_name`,
    [grant.familyId],
  );
  await auditView(professional.professionalId, grant.id, grant.familyId, 'overview');
  res.json({
    grantId: grant.id,
    familyId: grant.familyId,
    familyName: grant.familyName,
    grantedByName: grant.grantedByName,
    scopes: grant.scopes,
    children: children.rows,
    counts,
    readOnly: true,
  });
}));

router.get('/clients/:grantId/calendar', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId, 'calendar');
  const [events, swaps, exceptions] = await Promise.all([
    pool.query(
      `SELECT e.id,e.title,e.starts_at AS "startsAt",e.ends_at AS "endsAt",e.location,e.notes,
              e.event_type AS "eventType",e.status,e.requires_approval AS "requiresApproval",
              c.display_name AS "childName",u.display_name AS "createdByName",u.role AS "createdByRole",
              e.response_note AS "responseNote",e.created_at AS "createdAt"
         FROM family_events e
         LEFT JOIN children c ON c.id=e.child_id AND c.family_id=e.family_id
         LEFT JOIN users u ON u.id=e.created_by_user_id
        WHERE e.family_id=$1 ORDER BY e.starts_at DESC LIMIT 1000`,
      [grant.familyId],
    ),
    pool.query(
      `SELECT s.id,s.target_date::text AS "targetDate",s.proposed_date::text AS "proposedDate",s.status,s.notes,
              u.display_name AS "requestedByName",u.role AS "requestedByRole",s.reviewed_at AS "reviewedAt",s.created_at AS "createdAt"
         FROM swap_requests s LEFT JOIN users u ON u.id=s.requested_by
        WHERE s.family_id=$1 ORDER BY s.created_at DESC LIMIT 500`,
      [grant.familyId],
    ),
    pool.query(
      `SELECT ce.id,ce.custody_date::text AS "custodyDate",ce.custodian_role AS "custodianRole",ce.overnight,
              ce.status,ce.notes,c.display_name AS "childName",ce.reviewed_at AS "reviewedAt",ce.created_at AS "createdAt"
         FROM custody_exceptions ce LEFT JOIN children c ON c.id=ce.child_id
        WHERE ce.family_id=$1 ORDER BY ce.custody_date DESC,ce.created_at DESC LIMIT 500`,
      [grant.familyId],
    ),
  ]);
  await auditView(professional.professionalId, grant.id, grant.familyId, 'calendar');
  res.json({ events: events.rows, swapRequests: swaps.rows, custodyExceptions: exceptions.rows, readOnly: true });
}));

router.get('/clients/:grantId/expenses', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId, 'expenses');
  const { rows } = await pool.query(
    `SELECT e.id,e.title,e.amount::numeric(12,2)::text AS amount,e.category,e.status,e.expense_date::text AS "expenseDate",
            e.notes,e.is_extraordinary AS "isExtraordinary",e.father_percentage::text AS "fatherPercentage",
            e.mother_percentage::text AS "motherPercentage",u.display_name AS "paidByName",u.role AS "paidByRole",
            e.reviewed_at AS "reviewedAt",e.approval_otp_verified_at AS "approvalOtpVerifiedAt",e.created_at AS "createdAt",
            COALESCE((SELECT json_agg(c.display_name ORDER BY c.display_name) FROM expense_children ec JOIN children c ON c.id=ec.child_id WHERE ec.expense_id=e.id AND ec.family_id=e.family_id),'[]'::json) AS children
       FROM expenses e LEFT JOIN users u ON u.id=e.paid_by_user_id
      WHERE e.family_id=$1 ORDER BY e.expense_date DESC,e.created_at DESC LIMIT 1000`,
    [grant.familyId],
  );
  await auditView(professional.professionalId, grant.id, grant.familyId, 'expenses');
  res.json(rows);
}));

router.get('/clients/:grantId/agreements', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId, 'agreements');
  const { rows } = await pool.query(
    `SELECT a.id,a.title,a.body,a.category,a.status,a.response_note AS "responseNote",a.reviewed_at AS "reviewedAt",
            creator.display_name AS "createdByName",COALESCE(creator.role,a.created_by_role) AS "createdByRole",
            reviewer.display_name AS "reviewedByName",COALESCE(reviewer.role,a.reviewed_by_role) AS "reviewedByRole",
            a.created_at AS "createdAt",a.updated_at AS "updatedAt"
       FROM family_agreements a
       LEFT JOIN users creator ON creator.id=a.created_by
       LEFT JOIN users reviewer ON reviewer.id=a.reviewed_by
      WHERE a.family_id=$1 ORDER BY a.created_at DESC LIMIT 1000`,
    [grant.familyId],
  );
  await auditView(professional.professionalId, grant.id, grant.familyId, 'agreements');
  res.json(rows);
}));

router.get('/clients/:grantId/documents', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId, 'documents');
  const { rows } = await pool.query(
    `SELECT d.id,d.title,d.description,d.category,d.filename,d.mime_type AS "mimeType",d.file_size_bytes AS "fileSizeBytes",
            u.display_name AS "uploadedByName",u.role AS "uploadedByRole",d.created_at AS "createdAt",
            COALESCE((SELECT json_agg(c.display_name ORDER BY c.display_name) FROM duecase_document_children dc JOIN children c ON c.id=dc.child_id WHERE dc.document_id=d.id AND dc.family_id=d.family_id),'[]'::json) AS children
       FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by_user_id
      WHERE d.family_id=$1 ORDER BY d.created_at DESC LIMIT 1000`,
    [grant.familyId],
  );
  await auditView(professional.professionalId, grant.id, grant.familyId, 'documents');
  res.json(rows);
}));

router.get('/clients/:grantId/documents/:documentId/file', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const documentId = uuid.parse(req.params.documentId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId, 'documents');
  const { rows } = await pool.query<{ fileData: Buffer | null; mimeType: string | null; filename: string | null }>(
    `SELECT file_data AS "fileData",mime_type AS "mimeType",filename FROM documents WHERE id=$1 AND family_id=$2`,
    [documentId, grant.familyId],
  );
  const document = rows[0];
  if (!document) throw new ApiError(404, 'Documento non trovato', 'DOCUMENT_NOT_FOUND');
  if (!document.fileData) throw new ApiError(409, 'Documento non disponibile in archivio protetto', 'DOCUMENT_REUPLOAD_REQUIRED');
  await auditView(professional.professionalId, grant.id, grant.familyId, 'document_file');
  const safeFilename = (document.filename ?? 'documento').replace(/["\\\r\n]/g, '_');
  res.setHeader('Content-Type', document.mimeType ?? 'application/octet-stream');
  res.setHeader('Content-Length', String(document.fileData.length));
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
  res.send(document.fileData);
}));

router.get('/clients/:grantId/messages', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId, 'messages');
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
  const { rows } = await pool.query(
    `SELECT m.id,COALESCE(u.display_name,'Account eliminato') AS "senderName",COALESCE(u.role,m.sender_role) AS "senderRole",
            m.text,m.created_at AS "createdAt",m.data_hash AS "dataHash",
            COALESCE((SELECT MIN(r.read_at) FROM message_read_receipts r WHERE r.message_id=m.id AND r.family_id=m.family_id),m.read_at) AS "readAt",
            COALESCE((SELECT json_agg(json_build_object('id',ma.id,'filename',ma.filename,'mimeType',ma.mime_type,'fileSizeBytes',ma.file_size_bytes) ORDER BY ma.created_at) FROM duecase_message_attachments ma WHERE ma.message_id=m.id AND ma.family_id=m.family_id),'[]'::json) AS attachments
       FROM messages m LEFT JOIN users u ON u.id=m.sender_id
      WHERE m.family_id=$1 ORDER BY m.created_at DESC,m.id DESC LIMIT $2`,
    [grant.familyId, limit],
  );
  await auditView(professional.professionalId, grant.id, grant.familyId, 'messages');
  res.json(rows.reverse());
}));

router.get('/clients/:grantId/messages/:messageId/attachments/:attachmentId/file', asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const messageId = uuid.parse(req.params.messageId);
  const attachmentId = uuid.parse(req.params.attachmentId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId, 'messages');
  const { rows } = await pool.query<{ fileData: Buffer; mimeType: string; filename: string }>(
    `SELECT ma.file_data AS "fileData",ma.mime_type AS "mimeType",ma.filename
       FROM duecase_message_attachments ma
      WHERE ma.id=$1 AND ma.message_id=$2 AND ma.family_id=$3`,
    [attachmentId, messageId, grant.familyId],
  );
  const attachment = rows[0];
  if (!attachment) throw new ApiError(404, 'Allegato non trovato', 'MESSAGE_ATTACHMENT_NOT_FOUND');
  await auditView(professional.professionalId, grant.id, grant.familyId, 'message_attachment');
  const safeFilename = attachment.filename.replace(/["\\\r\n]/g, '_');
  res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
  res.setHeader('Content-Length', String(attachment.fileData.length));
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
  res.send(attachment.fileData);
}));

router.get('/clients/:grantId/dossier', rateLimit(6, 60 * 1000, ['GET']), asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const grantId = uuid.parse(req.params.grantId);
  const grant = await requireProfessionalGrant(professional.professionalId, grantId, 'dossier');
  const query = dossierQuery.parse(req.query);
  const allowedSections = dataScopes.filter((scope) => grant.scopes.includes(scope));
  const requestedSections = query.sections ? query.sections.split(',').filter(Boolean) : allowedSections;
  if (requestedSections.some((section) => !allowedSections.includes(section as typeof dataScopes[number]))) {
    throw new ApiError(403, 'Il dossier richiesto include sezioni non autorizzate', 'PROFESSIONAL_DOSSIER_SCOPE_REQUIRED');
  }
  if (requestedSections.length === 0) {
    throw new ApiError(403, 'Nessuna sezione dati è autorizzata per il dossier', 'PROFESSIONAL_DOSSIER_EMPTY');
  }

  const syntheticParentContext: AuthContext & { familyId: string } = {
    userId: professional.professionalId,
    sessionId: `professional:${professional.professionalId}`,
    tokenVersion: professional.tokenVersion,
    emailVerifiedAt: null,
    email: professional.email,
    displayName: professional.displayName,
    firstName: professional.firstName,
    lastName: professional.lastName,
    birthDate: null,
    taxCode: null,
    phone: null,
    role: 'father',
    familyId: grant.familyId,
    familyName: grant.familyName,
    inviteCode: null,
  };
  const result = await buildDossier(syntheticParentContext, { ...query, sections: requestedSections.join(',') });
  await appendProfessionalAudit({
    action: 'professional_export', professionalId: professional.professionalId, grantId: grant.id, familyId: grant.familyId,
    details: { format: query.format, sections: requestedSections, from: query.from ?? null, to: query.to ?? null, childId: query.childId ?? null },
  });
  res.setHeader('Content-Type', result.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(result.data);
}));

export default router;
