import nodemailer from 'nodemailer';
import { config } from '../config.js';

type AgentReportEmail = {
  to: string;
  type: 'growth' | 'ceo' | 'ops' | 'monetization' | 'marketing' | 'product';
  title: string;
  report: string;
};

function cleanHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function parseSender(value: string): { name: string; email: string } {
  const match = value.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  const matchedEmail = match?.[2]?.trim();
  if (matchedEmail) {
    return { name: match?.[1]?.trim() || 'DueCase', email: matchedEmail };
  }
  return { name: 'DueCase', email: value.trim() };
}

async function sendViaBrevo(message: { to: string; subject: string; text: string }): Promise<void> {
  if (!config.BREVO_API_KEY) throw new Error('EMAIL_NOT_CONFIGURED');
  const sender = parseSender(config.EMAIL_FROM);
  const response = await fetch(`${config.BREVO_API_URL.replace(/\/$/, '')}/smtp/email`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': config.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      tags: ['duecase-agent-report'],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`BREVO_SEND_FAILED_${response.status}:${details}`);
  }
}

async function sendViaSmtp(message: { to: string; subject: string; text: string }): Promise<void> {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS || !config.EMAIL_FROM) {
    throw new Error('EMAIL_NOT_CONFIGURED');
  }

  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });

  await transporter.sendMail({
    from: config.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

export async function sendAgentReportEmail(input: AgentReportEmail): Promise<void> {
  const subject = cleanHeader(`DueCase · ${input.title}`);
  const text = [
    `DueCase ${input.type.toUpperCase()} report`,
    '',
    input.report,
    '',
    'Messaggio automatico generato dagli agenti DueCase.',
  ].join('\n');

  if (config.BREVO_API_KEY) {
    await sendViaBrevo({ to: input.to, subject, text });
    return;
  }

  await sendViaSmtp({ to: input.to, subject, text });
}
