import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { config } from './config.js';
import { pool } from './db.js';
import { ApiError } from './http.js';

export type ParentRole = 'father' | 'mother';

export type AuthContext = {
  userId: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  taxCode: string | null;
  phone: string | null;
  role: ParentRole;
  familyId: string | null;
  familyName: string | null;
  inviteCode: string | null;
};

type AuthenticatedRequest = Request & { auth?: AuthContext };

type SubscriptionRow = {
  status: 'inactive' | 'active' | 'past_due' | 'canceled';
  currentPeriodEnd: string | null;
};

const expiresIn = config.JWT_EXPIRES_IN as SignOptions['expiresIn'];
const PREMIUM_MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function signAccessToken(userId: string): string {
  return jwt.sign({}, config.JWT_SECRET, {
    subject: userId,
    expiresIn,
    issuer: 'separated-parents-api',
    audience: 'separated-parents-app',
  });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) {
      throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    let payload: JwtPayload;
    try {
      const verified = jwt.verify(token, config.JWT_SECRET, {
        issuer: 'separated-parents-api',
        audience: 'separated-parents-app',
      });
      if (typeof verified === 'string') {
        throw new Error('Unexpected JWT payload');
      }
      payload = verified;
    } catch {
      throw new ApiError(401, 'Invalid or expired token', 'INVALID_TOKEN');
    }

    if (!payload.sub) {
      throw new ApiError(401, 'Invalid token', 'INVALID_TOKEN');
    }

    const { rows } = await pool.query<AuthContext>(
      `SELECT u.id AS "userId",
              u.email,
              u.display_name AS "displayName",
              u.first_name AS "firstName",
              u.last_name AS "lastName",
              u.birth_date::text AS "birthDate",
              u.tax_code AS "taxCode",
              u.phone,
              u.role,
              u.family_id AS "familyId",
              f.name AS "familyName",
              f.invite_code AS "inviteCode"
         FROM users u
         LEFT JOIN families f ON f.id = u.family_id
        WHERE u.id = $1`,
      [payload.sub],
    );

    const auth = rows[0];
    if (!auth) {
      throw new ApiError(401, 'User no longer exists', 'INVALID_TOKEN');
    }

    (req as AuthenticatedRequest).auth = auth;
    next();
  } catch (error) {
    next(error);
  }
}

export function getAuth(req: Request): AuthContext {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }
  return auth;
}

export function requireFamily(req: Request): AuthContext & { familyId: string } {
  const auth = getAuth(req);
  if (!auth.familyId) {
    throw new ApiError(409, 'Complete family setup first', 'FAMILY_REQUIRED');
  }
  return auth as AuthContext & { familyId: string };
}

export async function checkPremiumStatus(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!PREMIUM_MUTATION_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const auth = getAuth(req);
    if (!auth.familyId) {
      throw new ApiError(
        403,
        'Abbonamento Premium richiesto',
        'PREMIUM_REQUIRED',
        { priceCents: 499, currency: 'EUR', billingPeriod: 'month', trial: false },
      );
    }

    const { rows } = await pool.query<SubscriptionRow>(
      `SELECT status,
              CASE WHEN current_period_end IS NULL THEN NULL
                   ELSE to_char(current_period_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
               END AS "currentPeriodEnd"
         FROM family_subscriptions
        WHERE family_id = $1
        LIMIT 1`,
      [auth.familyId],
    );

    const subscription = rows[0];
    const periodEnd = subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
    const entitled = Boolean(
      subscription
      && (subscription.status === 'active' || subscription.status === 'canceled')
      && periodEnd
      && !Number.isNaN(periodEnd.getTime())
      && periodEnd.getTime() > Date.now(),
    );

    if (!entitled) {
      throw new ApiError(
        403,
        'Abbonamento Premium richiesto',
        'PREMIUM_REQUIRED',
        {
          priceCents: 499,
          currency: 'EUR',
          billingPeriod: 'month',
          trial: false,
          status: subscription?.status ?? 'inactive',
          currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
        },
      );
    }

    next();
  } catch (error) {
    next(error);
  }
}
