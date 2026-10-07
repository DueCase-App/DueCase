import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { config } from './config.js';
import { pool } from './db.js';
import { ApiError } from './http.js';

export type ProfessionalAuthContext = {
  professionalId: string;
  email: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  organization: string | null;
  tokenVersion: number;
};

type ProfessionalAuthenticatedRequest = Request & { professionalAuth?: ProfessionalAuthContext };
const expiresIn = config.JWT_EXPIRES_IN as SignOptions['expiresIn'];

export function signProfessionalAccessToken(professionalId: string, tokenVersion = 0): string {
  return jwt.sign({ kind: 'professional', version: tokenVersion }, config.JWT_SECRET, {
    subject: professionalId,
    jwtid: randomUUID(),
    expiresIn,
    issuer: 'duecase-professional-api',
    audience: 'duecase-professional-portal',
  });
}

export async function requireProfessionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if ((req as ProfessionalAuthenticatedRequest).professionalAuth) { next(); return; }
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      throw new ApiError(401, 'Accesso professionista richiesto', 'PROFESSIONAL_AUTH_REQUIRED');
    }

    const token = authorization.slice('Bearer '.length).trim();
    if (!token) throw new ApiError(401, 'Accesso professionista richiesto', 'PROFESSIONAL_AUTH_REQUIRED');

    let payload: JwtPayload;
    try {
      const verified = jwt.verify(token, config.JWT_SECRET, {
        issuer: 'duecase-professional-api',
        audience: 'duecase-professional-portal',
      });
      if (typeof verified === 'string') throw new Error('Unexpected JWT payload');
      payload = verified;
    } catch {
      throw new ApiError(401, 'Sessione professionista non valida o scaduta', 'PROFESSIONAL_INVALID_TOKEN');
    }

    if (!payload.sub || payload.kind !== 'professional') {
      throw new ApiError(401, 'Sessione professionista non valida', 'PROFESSIONAL_INVALID_TOKEN');
    }

    const { rows } = await pool.query<ProfessionalAuthContext>(
      `SELECT id AS "professionalId",
              email,
              display_name AS "displayName",
              first_name AS "firstName",
              last_name AS "lastName",
              organization,
              token_version AS "tokenVersion"
         FROM professional_users
        WHERE id = $1 AND deleted_at IS NULL`,
      [payload.sub],
    );
    const professional = rows[0];
    if (!professional || professional.tokenVersion !== (payload.version ?? 0)) {
      throw new ApiError(401, 'Account professionista non più disponibile', 'PROFESSIONAL_INVALID_TOKEN');
    }

    (req as ProfessionalAuthenticatedRequest).professionalAuth = professional;
    next();
  } catch (error) {
    next(error);
  }
}

export function getProfessionalAuth(req: Request): ProfessionalAuthContext {
  const auth = (req as ProfessionalAuthenticatedRequest).professionalAuth;
  if (!auth) throw new ApiError(401, 'Accesso professionista richiesto', 'PROFESSIONAL_AUTH_REQUIRED');
  return auth;
}
