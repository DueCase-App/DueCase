import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';

const router = Router();
const url = (value: string | undefined) => {
  const result = z.string().url().safeParse(value);
  return result.success && result.data.startsWith('https://') ? result.data : null;
};

router.get('/service-info', (_req, res) => res.json({
  siteUrl: config.SITE_URL,
  privacyUrl: url(config.PRIVACY_POLICY_URL),
  termsUrl: url(config.TERMS_URL),
  supportEmail: config.SUPPORT_EMAIL,
  infoEmail: config.INFO_EMAIL,
  privacyEmail: config.PRIVACY_EMAIL,
  legalEmail: config.LEGAL_EMAIL,
  moderationActive: process.env.MODERATION_ACTIVE === 'true',
  deletionUrl: `${config.SITE_URL.replace(/\/$/, '')}/cancellazione-account.html`,
}));

export default router;