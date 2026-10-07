import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  if (!config.SMTP_HOST || !config.EMAIL_FROM) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    auth: config.SMTP_USER && config.SMTP_PASS
      ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
      : undefined,
  });

  return transporter;
}

export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export async function sendExpenseOtpEmail(input: {
  to: string;
  recipientName: string;
  otp: string;
  expenseTitle: string;
  amount: string;
  expiresInMinutes: number;
}): Promise<void> {
  const smtp = getTransporter();
  if (!smtp || !config.EMAIL_FROM) {
    throw new Error('SMTP_NOT_CONFIGURED');
  }

  const safeTitle = input.expenseTitle.replace(/[<>]/g, '');
  const subject = 'DueCase · Codice di sicurezza per approvazione spesa';
  const text = [
    `Ciao ${input.recipientName},`,
    '',
    `il codice di sicurezza per firmare l’approvazione della spesa straordinaria “${safeTitle}” (${input.amount} €) è:`,
    '',
    input.otp,
    '',
    `Il codice scade tra ${input.expiresInMinutes} minuti e può essere usato una sola volta.`,
    'Se non hai richiesto tu questo codice, non utilizzarlo e verifica l’attività nel tuo account DueCase.',
    '',
    'DueCase',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0A3267">
      <h2 style="margin-bottom:8px">DueCase</h2>
      <p>Ciao ${escapeHtml(input.recipientName)},</p>
      <p>il codice di sicurezza per firmare l’approvazione della spesa straordinaria <strong>“${escapeHtml(safeTitle)}”</strong> (${input.amount} €) è:</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;padding:18px;background:#E9F0F8;border-radius:12px;margin:18px 0">${input.otp}</div>
      <p>Il codice scade tra <strong>${input.expiresInMinutes} minuti</strong> e può essere usato una sola volta.</p>
      <p style="font-size:13px;color:#5D7CA7">Se non hai richiesto tu questo codice, non utilizzarlo e verifica l’attività nel tuo account DueCase.</p>
    </div>`;

  await smtp.sendMail({
    from: config.EMAIL_FROM,
    to: input.to,
    subject,
    text,
    html,
  });
}

export function isEmailConfigured(): boolean { return Boolean(config.SMTP_HOST && config.EMAIL_FROM); }
export async function sendAccountCode(to: string, code: string, purpose: 'verify' | 'reset'): Promise<void> {
  const smtp = getTransporter();
  if (!smtp) throw new Error('SMTP_NOT_CONFIGURED');
  await smtp.sendMail({ from: config.EMAIL_FROM, to,
    subject: purpose === 'verify' ? 'DueCase · Verifica email' : 'DueCase · Recupero password',
    text: `Il tuo codice DueCase è ${code}. Scade tra 10 minuti ed è utilizzabile una sola volta. Se non lo hai richiesto, ignora questa email.` });
}
