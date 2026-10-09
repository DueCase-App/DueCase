import { rateLimit } from './services/rateLimit.js';
import cors from 'cors';
import express from 'express';
import { fileURLToPath } from 'node:url';
import publicInfoRouter from './routes/publicInfo.js';
import helmet from 'helmet';
import { checkPremiumStatus, requireAuth } from './auth.js';
import { config } from './config.js';
import { checkDatabase } from './db.js';
import { asyncHandler, errorHandler } from './http.js';
import emailAuthRouter from './routes/emailAuth.js';
import syncRouter from './routes/sync.js';
import emailChangeRouter from './routes/emailChange.js';
import accountRouter from './routes/account.js';
import agreementsRouter from './routes/agreements.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import eventsRouter from './routes/events.js';
import expensePaymentsRouter from './routes/expensePayments.js';
import expenseReviewsRouter from './routes/expenseReviews.js';
import expensesRouter from './routes/expenses.js';
import familyRouter from './routes/family.js';
import familyChildrenRouter from './routes/familyChildren.js';
import historyRouter from './routes/history.js';
import legalRegistrationGuard from './routes/legalRegistrationGuard.js';
import messagesRouter from './routes/messages.js';
import notificationsRouter from './routes/notifications.js';
import permanenceRouter from './routes/permanence.js';
import professionalAuthRouter from './routes/professionalAuth.js';
import professionalEmailChangeRouter from './routes/professionalEmailChange.js';
import professionalPasswordResetRouter from './routes/professionalPasswordReset.js';
import professionalPrivacyOverridesRouter from './routes/professionalPrivacyOverrides.js';
import professionalPortalRouter from './routes/professionalPortal.js';
import professionalsRouter from './routes/professionals.js';
import safetyRouter from './routes/safety.js';
import reportsRouter from './routes/reports.js';
import turnsRouter from './routes/turns.js';
import swapRequestsRouter from './routes/swapRequests.js';

export const app = express();
const publicFile=(name:string)=>fileURLToPath(new URL(`../public/${name}`,import.meta.url));

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());

const productionDefaultOrigins = [
  config.SITE_URL,
  'https://duecaseununicasquadra.com',
  'https://www.duecaseununicasquadra.com',
  'https://duecase-web.onrender.com',
  'https://duecase-api.onrender.com',
];
const corsOrigin = config.CORS_ORIGIN === '*'
  ? (config.NODE_ENV === 'production' ? [...new Set(productionDefaultOrigins)] : true)
  : config.CORS_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', asyncHandler(async (_req, res) => {
  await checkDatabase();
  res.json({ ok: true, service: 'duecase-api' });
}));

app.use('/api', publicInfoRouter);
app.use(express.static(fileURLToPath(new URL('../public',import.meta.url)),{index:false}));
app.get('/account-deletion',(_req,res)=>res.sendFile(publicFile('account-deletion.html')));
app.get(['/professionisti','/professionisti/','/professionisti/accetta'],(_req,res)=>res.sendFile(publicFile('professional-portal.html')));

app.use('/api/auth', rateLimit(60, 15*60*1000));
app.use('/api/auth', legalRegistrationGuard);
app.use('/api/auth', emailAuthRouter);
app.use('/api/auth', authRouter);
app.use('/api/auth', accountRouter);
app.use('/api/auth', emailChangeRouter);

// Accesso professionisti completamente separato dagli account Padre/Madre.
app.use('/api/professional-auth', professionalPasswordResetRouter);
app.use('/api/professional-auth', professionalAuthRouter);
app.use('/api/professional-auth', professionalEmailChangeRouter);
app.use('/api/professional', professionalPrivacyOverridesRouter);
app.use('/api/professional', professionalPortalRouter);

// Famiglia, notifiche e storico sono consultabili anche senza Premium.
app.use('/api/sync', syncRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/history', historyRouter);
app.use('/api/family/children', requireAuth, checkPremiumStatus, familyChildrenRouter);
app.use('/api/family', familyRouter);
app.use('/api/professionals', professionalsRouter);

// Consultazione GET disponibile; mutazioni operative protette dal Premium famiglia.
app.use('/api/events', requireAuth, checkPremiumStatus, eventsRouter);
app.use('/api/turns', requireAuth, checkPremiumStatus, turnsRouter);
app.use('/api/permanence', requireAuth, checkPremiumStatus, permanenceRouter);
app.use('/api/swap-requests', requireAuth, checkPremiumStatus, swapRequestsRouter);
app.use('/api/expenses', requireAuth, checkPremiumStatus, expenseReviewsRouter);
app.use('/api/expenses', requireAuth, checkPremiumStatus, expensePaymentsRouter);
app.use('/api/expenses', requireAuth, checkPremiumStatus, expensesRouter);
app.use('/api/agreements', requireAuth, checkPremiumStatus, agreementsRouter);
app.use('/api/documents', requireAuth, checkPremiumStatus, documentsRouter);
app.use('/api/messages', requireAuth, checkPremiumStatus, messagesRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/safety', safetyRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

app.use(errorHandler);