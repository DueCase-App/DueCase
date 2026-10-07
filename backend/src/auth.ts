import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { config } from './config.js';
import { pool } from './db.js';
import { ApiError } from './http.js';

export type ParentRole = 'father' | 'mother';

export type AuthContext = {
  userId: string;
  tokenVersion: number;
  emailVerifiedAt: string | null;
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

export function signAccessToken(userId: string, tokenVersion = 0): string {
  return jwt.sign({version: tokenVersion}, config.JWT_SECRET, {
    subject: userId,
    expiresIn,
    issuer: 'separated-parents-api',
    audience: 'separated-parents-app',
  });
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if ((req as AuthenticatedRequest).auth) { next(); return; }
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
              u.email, u.token_version AS "tokenVersion", u.email_verified_at AS "emailVerifiedAt",
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
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [payload.sub],
    );

    const auth = rows[0];
    if (!auth || auth.tokenVersion !== (payload.version ?? 0)) {
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
  if (config.EMAIL_VERIFICATION_REQUIRED && !auth.emailVerifiedAt) throw new ApiError(403, 'Verifica prima il tuo indirizzo email.', 'EMAIL_VERIFICATION_REQUIRED');
  if (!auth.familyId) {
    throw new ApiError(409, 'Complete family setup first', 'FAMILY_REQUIRED');
  }
  return auth as AuthContext & { familyId: string };
}

export async function checkPremiumStatus(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!PREMIUM_MUTATION_METHODS.has(req.method.toUpperCase()) || !config.PREMIUM_ENFORCEMENT_ENABLED) {
      next();
      return;
    }

    const auth = getAuth(req);
    if (config.EMAIL_VERIFICATION_REQUIRED && !auth.emailVerifiedAt) throw new ApiError(403, 'Verifica prima il tuo indirizzo email.', 'EMAIL_VERIFICATION_REQUIRED');
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
