import { buildDossier, dossierQuery } from '../services/dossierService.js';
import { rateLimit } from '../services/rateLimit.js';
import { dateSchema } from '../services/validation.js';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { messageDataHash, reportDataHash, verificationString } from '../services/integrityService.js';
import { createLegalReportPdf } from '../services/legalPdfService.js';

const router = Router();
router.use(requireAuth);

const dateString = dateSchema;
const parentingTimeQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: 'from must be before or equal to to',
  path: ['to'],
});

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
  childName: string;
  custodyDate: string;
  custodianRole: 'father' | 'mother';
  notes: string | null;
  updatedAt: string;
};

type MessageReportRow = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: 'father' | 'mother' | null;
  text: string;
  createdAt: string;
  readAt: string | null;
  dataHash: string;
};

type ParentingTimeRow = {
  custodianRole: 'father' | 'mother';
  seconds: string;
};

type ParentingCoverageRow = {
  firstDate: string | null;
  lastDate: string | null;
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

router.get('/parenting-time', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const query = parentingTimeQuery.parse(req.query);
  const from = query.from ?? new Date().toISOString().slice(0,7)+'-01';
  const to = query.to ?? new Date().toISOString().slice(0,10);
  if ((new Date(to).getTime()-new Date(from).getTime())/86400000 > 366) throw new ApiError(400,'Seleziona al massimo un anno.','RANGE_TOO_LARGE');
  const timeResult = await pool.query<ParentingTimeRow>(`SELECT c."custodianRole", (COUNT(*)*86400)::text AS seconds
    FROM generate_series($2::date,$3::date,interval '1 day') d
    CROSS JOIN LATERAL duecase_custody($1,d::date) c
    WHERE c."custodianRole" IS NOT NULL GROUP BY c."custodianRole"`,[auth.familyId,from,to]);
  const coverageResult = { rows: [{firstDate:from,lastDate:to}] };

  const secondsByRole = { father: 0, mother: 0 };
  for (const row of timeResult.rows) {
    secondsByRole[row.custodianRole] = Number(row.seconds) || 0;
  }

  const totalSeconds = secondsByRole.father + secondsByRole.mother;
  const toPercentage = (seconds: number) => totalSeconds > 0
    ? Number(((seconds / totalSeconds) * 100).toFixed(4))
    : 0;
  const toHours = (seconds: number) => Number((seconds / 3600).toFixed(4));

  const father = {
    role: 'father' as const,
    label: 'Padre',
    seconds: secondsByRole.father,
    hours: toHours(secondsByRole.father),
    percentage: toPercentage(secondsByRole.father),
  };
  const mother = {
    role: 'mother' as const,
    label: 'Madre',
    seconds: secondsByRole.mother,
    hours: toHours(secondsByRole.mother),
    percentage: toPercentage(secondsByRole.mother),
  };

  const coverage = coverageResult.rows[0];
  res.json({
    period: {
      from: from ?? coverage?.firstDate ?? null,
      to: to ?? coverage?.lastDate ?? null,
    },
    totalSeconds,
    totalHours: toHours(totalSeconds),
    father,
    mother,
    chart: [father, mother],
    source: 'planned_child_days_24h_each_not_measured_time',
  });
}));

router.get(['/pdf','/export'], rateLimit(6, 60*1000,['GET']), asyncHandler(async(req,res)=>{
 const auth=requireFamily(req);
 const query=dossierQuery.parse(req.path==='/pdf'?{...req.query,format:'pdf'}:req.query);
 const result=await buildDossier(auth,query);
 res.setHeader('Content-Type',result.mime);
 res.setHeader('Content-Disposition',`attachment; filename="${result.filename}"`);
 res.setHeader('Cache-Control','private, no-store');
 res.send(result.data);
}));
export default router;
