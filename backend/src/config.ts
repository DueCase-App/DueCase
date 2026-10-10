import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  DB_SCHEMA: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/).default('public'),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  OTP_SECRET: z.string().min(32).optional(),
  EMAIL_VERIFICATION_REQUIRED: z.enum(['true','false']).default('false').transform(v => v === 'true'),
  BREVO_API_KEY: z.string().trim().min(1).optional(),
  BREVO_API_URL: z.string().url().default('https://api.brevo.com/v3'),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  SMTP_SECURE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  EMAIL_FROM: z.string().trim().min(3).default('DueCase <noreply@duecaseununicasquadra.com>'),
  SUPPORT_EMAIL: z.string().email().default('assistenza@duecaseununicasquadra.com'),
  INFO_EMAIL: z.string().email().default('info@duecaseununicasquadra.com'),
  PRIVACY_EMAIL: z.string().email().default('privacy@duecaseununicasquadra.com'),
  LEGAL_EMAIL: z.string().email().default('legal@duecaseununicasquadra.com'),
  AGENT_REPORT_EMAIL: z.string().email().optional(),
  SITE_URL: z.string().url().default('https://www.duecaseununicasquadra.com'),
  PROFESSIONAL_PORTAL_URL: z.string().url().optional(),
  PRIVACY_POLICY_URL: z.string().url().optional(),
  TERMS_URL: z.string().url().optional(),
  PREMIUM_ENFORCEMENT_ENABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),

  // Server-to-server secrets. Keep these only in the deployment secret store.
  GROWTH_AGENT_KEY: z.string().min(32).optional(),
  REVENUECAT_WEBHOOK_AUTH: z.string().min(16).optional(),
  REVENUECAT_PREMIUM_ENTITLEMENT: z.string().trim().min(1).default('premium_family'),
  REVENUECAT_PREMIUM_PRODUCT_ID: z.string().trim().min(1).default('duecase_premium_monthly'),
});

export const config = schema.parse(process.env);
