import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { messageDataHash, reportDataHash, verificationString } from '../services/integrityService.js';
import { createLegalReportPdf } from '../services/legalPdfService.js';

const router = Router();
router.use(requireAuth);

type ExpenseReportRow = {
  id: string;
  title: string;
  amount: string;
  category: string;
  expenseDate: string;
  paidByName: string | null;
  paidByRole: 'father' | 'mother' | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  approvalOtpVerifiedAt: string | null;
  createdAt: string;
};

type SwapReportRow = {
  id: string;
  requestedByName: string;
  requestedByRole: 'father' | 'mother';
  targetDate: string;
  proposedDate: string;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
};

type CustodyReportRow = {
  custodyDate: string;
  custodianRole: 'father' | 'mother';
  notes: string | null;
  updatedAt: string;
};

type MessageReportRow = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'father' | 'mother';
  text: string;
  createdAt: string;
  readAt: string | null;
  dataHash: string;
};

function roleLabel(role: 'father' | 'mother' | null): string {
  if (role === 'father') return 'Padre';
  if (role === 'mother') return 'Madre';
  return 'Genitore';
}

function statusLabel(status: SwapReportRow['status']): string {
  if (status === 'approved') return 'APPROVATO';
  if (status === 'rejected') return 'RIFIUTATO';
  return 'IN ATTESA';
}

router.get('/pdf', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const reportId = randomUUID();
  const generatedAt = new Date().toISOString();

  const [familyResult, expenseResult, swapResult, custodyResult, messageResult] = await Promise.all([
    pool.query<{ name: string }>(
      `SELECT name FROM families WHERE id = $1`,
      [auth.familyId],
    ),
    pool.query<ExpenseReportRow>(
      `SELECT e.id,
              e.title,
              e.amount::numeric(12,2)::text AS amount,
              e.category,
              e.expense_date::text AS "expenseDate",
              payer.display_name AS "paidByName",
              payer.role AS "paidByRole",
              reviewer.display_name AS "reviewedByName",
              CASE WHEN e.reviewed_at IS NULL THEN NULL ELSE to_char(e.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS "reviewedAt",
              CASE WHEN e.approval_otp_verified_at IS NULL THEN NULL ELSE to_char(e.approval_otp_verified_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS "approvalOtpVerifiedAt",
              to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
         FROM expenses e
         LEFT JOIN users payer ON payer.id = e.paid_by_user_id
         LEFT JOIN users reviewer ON reviewer.id = e.reviewed_by_user_id
        WHERE e.family_id = $1
          AND e.status = 'approved'
        ORDER BY e.expense_date ASC, e.created_at ASC, e.id ASC`,
      [auth.familyId],
    ),
    pool.query<SwapReportRow>(
      `SELECT sr.id,
              requester.display_name AS "requestedByName",
              requester.role AS "requestedByRole",
              sr.target_date::text AS "targetDate",
              sr.proposed_date::text AS "proposedDate",
              sr.status,
              sr.notes,
              reviewer.display_name AS "reviewedByName",
              CASE WHEN sr.reviewed_at IS NULL THEN NULL ELSE to_char(sr.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS "reviewedAt",
              to_char(sr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
         FROM swap_requests sr
         JOIN users requester ON requester.id = sr.requested_by
         LEFT JOIN users reviewer ON reviewer.id = sr.reviewed_by
        WHERE sr.family_id = $1
        ORDER BY sr.created_at ASC, sr.id ASC`,
      [auth.familyId],
    ),
    pool.query<CustodyReportRow>(
      `SELECT custody_date::text AS "custodyDate",
              custodian_role AS "custodianRole",
              notes,
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt"
         FROM custody_turns
        WHERE family_id = $1
          AND custody_date IS NOT NULL
          AND custodian_role IS NOT NULL
        ORDER BY custody_date ASC`,
      [auth.familyId],
    ),
    pool.query<MessageReportRow>(
      `SELECT m.id,
              m.sender_id AS "senderId",
              u.display_name AS "senderName",
              u.role AS "senderRole",
              m.text,
              to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
              CASE WHEN m.read_at IS NULL THEN NULL ELSE to_char(m.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END AS "readAt",
              m.data_hash AS "dataHash"
         FROM messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.family_id = $1
        ORDER BY m.created_at ASC, m.id ASC`,
      [auth.familyId],
    ),
  ]);

  const familyName = familyResult.rows[0]?.name ?? auth.familyName ?? 'Famiglia DueCase';
  const messages = messageResult.rows.map((message) => {
    const expectedHash = messageDataHash(message.text, message.senderId, message.createdAt);
    if (expectedHash !== message.dataHash) {
      throw new ApiError(
        409,
        `Integrità non verificata per il messaggio ${message.id}. Report non generato.`,
        'MESSAGE_INTEGRITY_ERROR',
      );
    }
    return { ...message, integrityVerified: true as const };
  });

  const dataset = {
    schemaVersion: 'DUECASE-LEGAL-REPORT-V1',
    reportId,
    generatedAt,
    family: { id: auth.familyId, name: familyName },
    generatedBy: { id: auth.userId, displayName: auth.displayName, role: auth.role },
    approvedExpenses: expenseResult.rows,
    calendar: {
      swapRequests: swapResult.rows,
      currentCustodySnapshot: custodyResult.rows,
    },
    messages,
  };

  const reportHash = reportDataHash(dataset);
  const verification = verificationString(reportId, generatedAt, reportHash);

  const expenseLines = expenseResult.rows.map((expense, index) => {
    const otp = expense.approvalOtpVerifiedAt ? ` Firma OTP verificata: ${expense.approvalOtpVerifiedAt}.` : '';
    return `${index + 1}. ${expense.expenseDate} - ${expense.title} - EUR ${expense.amount} - ${expense.category} - pagata da ${expense.paidByName ?? roleLabel(expense.paidByRole)}; approvata da ${expense.reviewedByName ?? 'altro genitore'}${expense.reviewedAt ? ` il ${expense.reviewedAt}` : ''}.${otp}`;
  });

  const swapLines = swapResult.rows.map((swap, index) =>
    `${index + 1}. ${swap.createdAt} - ${swap.requestedByName} (${roleLabel(swap.requestedByRole)}) ha richiesto lo scambio ${swap.targetDate} <-> ${swap.proposedDate}; esito: ${statusLabel(swap.status)}${swap.reviewedByName ? ` da ${swap.reviewedByName}` : ''}${swap.reviewedAt ? ` il ${swap.reviewedAt}` : ''}${swap.notes ? `; nota: ${swap.notes}` : ''}.`,
  );

  const custodyLines = custodyResult.rows.map((turn, index) =>
    `${index + 1}. ${turn.custodyDate} - custodia assegnata a ${roleLabel(turn.custodianRole)}; ultimo aggiornamento ${turn.updatedAt}${turn.notes ? `; note: ${turn.notes}` : ''}.`,
  );

  const messageLines = messages.map((message, index) =>
    `${index + 1}. ${message.createdAt} - ${message.senderName} (${roleLabel(message.senderRole)}): ${message.text} | lettura: ${message.readAt ?? 'non registrata'} | SHA-256: ${message.dataHash}`,
  );

  const pdf = createLegalReportPdf({
    reportId,
    generatedAt,
    familyName,
    generatedBy: `${auth.displayName} (${roleLabel(auth.role)})`,
    verification,
    reportHash,
    sections: [
      { title: `Spese approvate (${expenseLines.length})`, lines: expenseLines },
      { title: `Richieste e modifiche calendario (${swapLines.length})`, lines: swapLines },
      { title: `Stato calendario corrente (${custodyLines.length})`, lines: custodyLines },
      { title: `Messaggi storici immutabili (${messageLines.length})`, lines: messageLines },
    ],
  });

  await pool.query(
    `INSERT INTO report_exports (id, family_id, generated_by, generated_at, report_hash, verification_string)
     VALUES ($1, $2, $3, $4::timestamptz, $5, $6)`,
    [reportId, auth.familyId, auth.userId, generatedAt, reportHash, verification],
  );

  const safeDate = generatedAt.slice(0, 10);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="DueCase-report-${safeDate}-${reportId.slice(0, 8)}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-DueCase-Report-ID', reportId);
  res.setHeader('X-DueCase-Integrity-SHA256', reportHash);
  res.setHeader('X-DueCase-Generated-At', generatedAt);
  res.send(pdf);
}));

export default router;
