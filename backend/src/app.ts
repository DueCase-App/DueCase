import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { checkDatabase } from './db.js';
import { asyncHandler, errorHandler } from './http.js';
import authRouter from './routes/auth.js';
import documentsRouter from './routes/documents.js';
import expensesRouter from './routes/expenses.js';
import familyRouter from './routes/family.js';
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
app.use('/api/family', familyRouter);
app.use('/api/turns', turnsRouter);
app.use('/api/swap-requests', swapRequestsRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/documents', documentsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

app.use(errorHandler);
