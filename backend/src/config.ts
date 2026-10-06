import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must contain at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  OTP_SECRET: z.string().min(32).optional(),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASS: z.string().min(1).optional(),
  EMAIL_FROM: z.string().trim().min(3).optional(),
});

export const config = schema.parse(process.env);
