import { timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { getAuth, requireAuth } from '../auth.js';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();

const revenueCatWebhookSchema = z.object({
  event: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    app_user_id: z.string().min(1),
    product_id: z.string().nullish(),
    entitlement_ids: z.array(z.string()).nullish(),
    purchased_at_ms: z.number().nullish(),
    expiration_at_ms: z.number().nullish(),
    event_timestamp_ms: z.number().nullish(),
    original_transaction_id: z.string().nullish(),
    environment: z.string().nullish(),
    cancel_reason: z.string().nullish(),
    expiration_reason: z.string().nullish(),
  }).passthrough(),
}).passthrough();

type SubscriptionStatus = 'inactive' | 'active' | 'past_due' | 'canceled';

type SubscriptionRow = {
  status: SubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  provider: string | null;
};

function requireRevenueCatAuthorization(req: Request): void {
  const expected = config.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    throw new ApiError(503, 'RevenueCat webhook is not configured', 'REVENUECAT_NOT_CONFIGURED');
  }
  const provided = req.header('authorization') ?? '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (
    expectedBuffer.length !== providedBuffer.length
    || !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new ApiError(401, 'Invalid RevenueCat authorization', 'INVALID_REVENUECAT_AUTH');
  }
}

function familyIdFromAppUserId(appUserId: string): string | null {
  const prefixed = /^family:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(appUserId);
  if (prefixed) return prefixed[1] ?? null;
  const direct = /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(appUserId);
  return direct?.[1] ?? null;
}

function isoFromMs(value: number | null | undefined): string | null {
  if (!value || !Number.isFinite(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusForEvent(type: string): { status: SubscriptionStatus | null; cancelAtPeriodEnd: boolean | null } {
  if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT', 'REFUND_REVERSED'].includes(type)) {
    return { status: 'active', cancelAtPeriodEnd: false };
  }
  if (type === 'CANCELLATION' || type === 'SUBSCRIPTION_PAUSED') {
    return { status: 'canceled', cancelAtPeriodEnd: true };
  }
  if (type === 'BILLING_ISSUE') {
    return { status: 'past_due', cancelAtPeriodEnd: false };
  }
  if (type === 'EXPIRATION') {
    return { status: 'inactive', cancelAtPeriodEnd: false };
  }
  return { status: null, cancelAtPeriodEnd: null };
}

router.get('/status', requireAuth, asyncHandler(async (req, res) => {
  const auth = getAuth(req);
  if (!auth.familyId) {
    res.json({
      planCode: 'premium_monthly',
      priceCents: 499,
      currency: 'EUR',
      billingPeriod: 'month',
      trial: false,
      status: 'inactive',
      entitled: false,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      provider: null,
      revenueCatAppUserId: null,
      familyRequired: true,
    });
    return;
  }

  const { rows } = await pool.query<SubscriptionRow>(
    `SELECT status,
            CASE WHEN current_period_start IS NULL THEN NULL
                 ELSE to_char(current_period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             END AS "currentPeriodStart",
            CASE WHEN current_period_end IS NULL THEN NULL
                 ELSE to_char(current_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
             END AS "currentPeriodEnd",
            cancel_at_period_end AS "cancelAtPeriodEnd",
            provider
       FROM family_subscriptions
      WHERE family_id=$1
      LIMIT 1`,
    [auth.familyId],
  );

  const subscription = rows[0];
  const periodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
  const entitled = Boolean(
    subscription
    && ['active', 'canceled', 'past_due'].includes(subscription.status)
    && periodEnd
    && !Number.isNaN(periodEnd.getTime())
    && periodEnd.getTime() > Date.now(),
  );

  res.json({
    planCode: 'premium_monthly',
    priceCents: 499,
    currency: 'EUR',
    billingPeriod: 'month',
    trial: false,
    status: subscription?.status ?? 'inactive',
    entitled,
    currentPeriodStart: subscription?.currentPeriodStart ?? null,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    provider: subscription?.provider ?? null,
    revenueCatAppUserId: `family:${auth.familyId}`,
    familyRequired: false,
  });
}));

router.post('/revenuecat/webhook', asyncHandler(async (req, res) => {
  requireRevenueCatAuthorization(req);
  const payload = revenueCatWebhookSchema.parse(req.body);
  const event = payload.event;

  if (event.type === 'TEST') {
    res.json({ ok: true, test: true });
    return;
  }

  const familyId = familyIdFromAppUserId(event.app_user_id);
  if (!familyId) {
    res.status(202).json({ ok: true, ignored: 'unknown_app_user_id' });
    return;
  }

  const entitlementIds = event.entitlement_ids ?? [];
  const isPremiumEvent = entitlementIds.includes(config.REVENUECAT_PREMIUM_ENTITLEMENT)
    || event.product_id === config.REVENUECAT_PREMIUM_PRODUCT_ID;
  if (!isPremiumEvent) {
    res.json({ ok: true, ignored: 'unrelated_product' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO growth_events(event_key,event_name,family_id,source,platform,metadata,created_at)
       VALUES($1,$2,$3,'revenuecat',$4,$5::jsonb,COALESCE($6::timestamptz,NOW()))
       ON CONFLICT(event_key) DO NOTHING
       RETURNING id`,
      [
        `revenuecat:${event.id}`,
        `revenuecat_${event.type.toLowerCase()}`,
        familyId,
        event.environment?.toLowerCase() ?? null,
        JSON.stringify({
          productId: event.product_id ?? null,
          entitlementIds,
          cancelReason: event.cancel_reason ?? null,
          expirationReason: event.expiration_reason ?? null,
        }),
        isoFromMs(event.event_timestamp_ms),
      ],
    );

    if (!inserted.rowCount) {
      await client.query('COMMIT');
      res.json({ ok: true, duplicate: true });
      return;
    }

    const next = statusForEvent(event.type);
    if (next.status) {
      const updated = await client.query(
        `UPDATE family_subscriptions
            SET status=$2,
                current_period_start=COALESCE($3::timestamptz,current_period_start),
                current_period_end=COALESCE($4::timestamptz,current_period_end),
                cancel_at_period_end=COALESCE($5,cancel_at_period_end),
                provider='revenuecat',
                provider_customer_id=$6,
                provider_subscription_id=COALESCE($7,provider_subscription_id),
                updated_at=NOW()
          WHERE family_id=$1`,
        [
          familyId,
          next.status,
          isoFromMs(event.purchased_at_ms),
          isoFromMs(event.expiration_at_ms),
          next.cancelAtPeriodEnd,
          event.app_user_id,
          event.original_transaction_id ?? null,
        ],
      );

      if (!updated.rowCount) {
        await client.query('ROLLBACK');
        res.status(202).json({ ok: true, ignored: 'unknown_family' });
        return;
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

export default router;
