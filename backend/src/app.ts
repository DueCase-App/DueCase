import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { checkPremiumStatus, requireAuth } from './auth.js';
import { config } from './config.js';
import { checkDatabase } from './db.js';
import { asyncHandler, errorHandler } from './http.js';
import accountRouter from './routes/account.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import expensesRouter from './routes/expenses.js';
import familyRouter from './routes/family.js';
import messagesRouter from './routes/messages.js';
import reportsRouter from './routes/reports.js';
import turnsRouter from './routes/turns.js';
import swapRequestsRouter from './routes/swapRequests.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((value) => value.trim()),
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', asyncHandler(async (_req, res) => {
  await checkDatabase();
  res.json({ ok: true, service: 'duecase-api' });
}));

app.use('/api/auth', authRouter);
app.use('/api/auth', accountRouter);
app.use('/api/family', familyRouter);

// Consultazione sempre disponibile agli utenti autenticati; tutte le mutazioni
// dei moduli operativi richiedono Premium famiglia attivo.
app.use('/api/turns', requireAuth, checkPremiumStatus, turnsRouter);
app.use('/api/swap-requests', requireAuth, checkPremiumStatus, swapRequestsRouter);
app.use('/api/expenses', requireAuth, checkPremiumStatus, expensesRouter);
app.use('/api/documents', requireAuth, checkPremiumStatus, documentsRouter);
app.use('/api/messages', requireAuth, checkPremiumStatus, messagesRouter);

app.use('/api/reports', reportsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

app.use(errorHandler);
