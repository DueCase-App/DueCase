import { timingSafeEqual } from 'node:crypto';
import { Router, type Request } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { ApiError, asyncHandler } from '../http.js';
import { sendAgentReportEmail } from '../services/agentReportEmailService.js';

const router = Router();

const reportSchema = z.object({
  type: z.enum(['growth', 'ceo', 'ops', 'monetization', 'marketing', 'product']),
  title: z.string().trim().min(3).max(160),
  report: z.string().trim().min(1).max(20000),
});

function requireAgentKey(req: Request): void {
  const expected = config.GROWTH_AGENT_KEY;
  if (!expected) {
    throw new ApiError(503, 'Agent bridge is not configured', 'AGENT_BRIDGE_NOT_CONFIGURED');
  }

  const provided = req.header('x-growth-agent-key') ?? '';
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (
    expectedBuffer.length !== providedBuffer.length
    || !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new ApiError(401, 'Invalid agent key', 'INVALID_AGENT_KEY');
  }
}

router.post('/email', asyncHandler(async (req, res) => {
  requireAgentKey(req);
  const input = reportSchema.parse(req.body);

  if (!config.AGENT_REPORT_EMAIL) {
    throw new ApiError(503, 'Agent report email is not configured', 'AGENT_REPORT_EMAIL_NOT_CONFIGURED');
  }

  await sendAgentReportEmail({
    to: config.AGENT_REPORT_EMAIL,
    type: input.type,
    title: input.title,
    report: input.report,
  });

  res.status(202).json({ ok: true });
}));

export default router;
