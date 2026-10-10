import { timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth } from '../auth.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();

const eventSchema = z.object({
  eventName: z.enum([
    'onboarding_started',
    'onboarding_completed',
    'family_invite_prompt_viewed',
    'paywall_viewed',
    'premium_cta_clicked',
    'purchase_started',
    'restore_started',
    'restore_completed',
  ]),
  eventKey: z.string().trim().min(3).max(180).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  campaign: z.string().trim().min(1).max(120).optional(),
  platform: z.enum(['ios', 'android', 'web', 'unknown']).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).superRefine((value, ctx) => {
  if (JSON.stringify(value.metadata).length > 4096) {
    ctx.addIssue({ code: 'custom', path: ['metadata'], message: 'metadata is too large' });
  }
});

const summaryQuery = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function requireGrowthAgentKey(req: Request): void {
  const expected = config.GROWTH_AGENT_KEY;
  if (!expected) {
    throw new ApiError(503, 'Growth agent is not configured', 'GROWTH_AGENT_NOT_CONFIGURED');
  }
  const provided = req.header('x-growth-agent-key') ?? '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (
    expectedBuffer.length !== providedBuffer.length
    || !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new ApiError(401, 'Invalid growth agent key', 'INVALID_GROWTH_AGENT_KEY');
  }
}

router.post('/event', requireAuth, asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  const input = eventSchema.parse(req.body);

  await pool.query(
    `INSERT INTO growth_events(event_key,event_name,user_id,family_id,source,campaign,platform,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
     ON CONFLICT(event_key) DO NOTHING`,
    [
      input.eventKey ?? null,
      input.eventName,
      auth.userId,
      auth.familyId,
      input.source ?? null,
      input.campaign ?? null,
      input.platform ?? null,
      JSON.stringify(input.metadata),
    ],
  );

  res.status(202).json({ ok: true });
}));

router.get('/summary', asyncHandler(async (req, res) => {
  requireGrowthAgentKey(req);
  const query = summaryQuery.parse(req.query);
  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 29 * 86400000);
  const from = query.from ?? defaultFrom.toISOString().slice(0, 10);
  const to = query.to ?? today.toISOString().slice(0, 10);
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toExclusive = new Date(`${to}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toExclusive.getTime()) || fromDate >= toExclusive) {
    throw new ApiError(400, 'Invalid growth summary date range', 'INVALID_DATE_RANGE');
  }
  if ((toExclusive.getTime() - fromDate.getTime()) / 86400000 > 367) {
    throw new ApiError(400, 'Select at most 366 days', 'RANGE_TOO_LARGE');
  }

  const [registrationResult, familyResult, eventResult, premiumResult, cohortPremiumResult] = await Promise.all([
    pool.query<{
      registrations: string;
      verified: string;
    }>(
      `SELECT COUNT(*)::text AS registrations,
              COUNT(*) FILTER (WHERE email_verified_at IS NOT NULL)::text AS verified
         FROM users
        WHERE created_at >= $1 AND created_at < $2 AND deleted_at IS NULL`,
      [fromDate.toISOString(), toExclusive.toISOString()],
    ),
    pool.query<{
      familiesCreated: string;
      completeFamilies: string;
    }>(
      `SELECT COUNT(*)::text AS "familiesCreated",
              COUNT(*) FILTER (WHERE parent_count >= 2)::text AS "completeFamilies"
         FROM (
           SELECT f.id, COUNT(u.id) FILTER (WHERE u.deleted_at IS NULL) AS parent_count
             FROM families f
             LEFT JOIN users u ON u.family_id = f.id
            WHERE f.created_at >= $1 AND f.created_at < $2
            GROUP BY f.id
         ) families_in_period`,
      [fromDate.toISOString(), toExclusive.toISOString()],
    ),
    pool.query<{
      eventName: string;
      events: string;
      families: string;
    }>(
      `SELECT event_name AS "eventName",
              COUNT(*)::text AS events,
              COUNT(DISTINCT family_id) FILTER (WHERE family_id IS NOT NULL)::text AS families
         FROM growth_events
        WHERE created_at >= $1 AND created_at < $2
        GROUP BY event_name`,
      [fromDate.toISOString(), toExclusive.toISOString()],
    ),
    pool.query<{
      activeFamilies: string;
      canceledButEntitledFamilies: string;
      pastDueButEntitledFamilies: string;
    }>(
      `SELECT
         COUNT(*) FILTER (WHERE status='active' AND current_period_end > NOW())::text AS "activeFamilies",
         COUNT(*) FILTER (WHERE status='canceled' AND current_period_end > NOW())::text AS "canceledButEntitledFamilies",
         COUNT(*) FILTER (WHERE status='past_due' AND current_period_end > NOW())::text AS "pastDueButEntitledFamilies"
       FROM family_subscriptions`,
    ),
    pool.query<{ premiumFamilies: string }>(
      `SELECT COUNT(*)::text AS "premiumFamilies"
         FROM family_subscriptions s
         JOIN families f ON f.id=s.family_id
        WHERE f.created_at >= $1 AND f.created_at < $2
          AND s.status IN ('active','canceled','past_due')
          AND s.current_period_end > NOW()`,
      [fromDate.toISOString(), toExclusive.toISOString()],
    ),
  ]);

  const registrations = Number(registrationResult.rows[0]?.registrations ?? 0);
  const verified = Number(registrationResult.rows[0]?.verified ?? 0);
  const familiesCreated = Number(familyResult.rows[0]?.familiesCreated ?? 0);
  const completeFamilies = Number(familyResult.rows[0]?.completeFamilies ?? 0);
  const cohortPremiumFamilies = Number(cohortPremiumResult.rows[0]?.premiumFamilies ?? 0);
  const activeFamilies = Number(premiumResult.rows[0]?.activeFamilies ?? 0);
  const canceledButEntitledFamilies = Number(premiumResult.rows[0]?.canceledButEntitledFamilies ?? 0);
  const pastDueButEntitledFamilies = Number(premiumResult.rows[0]?.pastDueButEntitledFamilies ?? 0);
  const entitledFamilies = activeFamilies + canceledButEntitledFamilies + pastDueButEntitledFamilies;

  const events = Object.fromEntries(eventResult.rows.map((row) => [
    row.eventName,
    { events: Number(row.events), families: Number(row.families) },
  ]));

  const pct = (numerator: number, denominator: number) => denominator > 0
    ? Number(((numerator / denominator) * 100).toFixed(2))
    : 0;

  res.json({
    period: { from, to },
    funnel: {
      registrations,
      verifiedRegistrations: verified,
      familiesCreated,
      completeFamilies,
      premiumFamiliesFromPeriodCohort: cohortPremiumFamilies,
      verificationRatePct: pct(verified, registrations),
      familyCompletionRatePct: pct(completeFamilies, familiesCreated),
      familyToPremiumRatePct: pct(cohortPremiumFamilies, familiesCreated),
    },
    premium: {
      activeFamilies,
      canceledButEntitledFamilies,
      pastDueButEntitledFamilies,
      entitledFamilies,
      listPriceCents: 499,
      estimatedGrossMrrCents: entitledFamilies * 499,
      currency: 'EUR',
    },
    events,
    privacy: {
      containsMessageContent: false,
      containsDocuments: false,
      containsChildProfileData: false,
    },
  });
}));

export default router;
