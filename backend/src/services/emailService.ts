import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS || !config.EMAIL_FROM) {
    transporter = null;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
  return transporter;
}

function parseSender(value: string): { name: string; email: string } {
  const match = value.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/);
  const matchedEmail = match?.[2]?.trim();
  if (matchedEmail) {
    return { name: match?.[1]?.trim() || 'DueCase', email: matchedEmail };
  }
  return { name: 'DueCase', email: value.trim() };
}

async function sendViaBrevo(message: OutboundEmail): Promise<void> {
  if (!config.BREVO_API_KEY) throw new Error('SMTP_NOT_CONFIGURED');
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
      ...(message.html ? { htmlContent: message.html } : {}),
      ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
      tags: ['duecase-transactional'],
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`BREVO_SEND_FAILED_${response.status}:${details}`);
  }
}

async function sendEmail(message: OutboundEmail): Promise<void> {
  if (config.BREVO_API_KEY) {
    await sendViaBrevo(message);
    return;
  }
  const smtp = getTransporter();
  if (!smtp) throw new Error('SMTP_NOT_CONFIGURED');
  await smtp.sendMail({
    from: config.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
  });
}

function officialParentInvitationLink(input: { to: string; invitedRole: 'father'|'mother'; inviteLink: string }): string {
  try {
    const code = new URL(input.inviteLink).searchParams.get('code')?.trim().toUpperCase();
    if (!code) return input.inviteLink;
    const fragment = new URLSearchParams({ inviteCode: code, email: input.to.trim().toLowerCase(), role: input.invitedRole });
    return `${config.SITE_URL.replace(/\/$/, '')}/invito.html#${fragment.toString()}`;
  } catch {
    return input.inviteLink;
  }
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
  if (!isEmailConfigured()) throw new Error('SMTP_NOT_CONFIGURED');
  const safeTitle = input.expenseTitle.replace(/[<>]/g, '');
  const subject = 'DueCase · Codice di sicurezza per approvazione spesa';
  const text = [
    `Ciao ${input.recipientName},`,'',
    `il codice di sicurezza per confermare l’approvazione della spesa straordinaria “${safeTitle}” (${input.amount} €) è:`,
    '',input.otp,'',
    `Il codice scade tra ${input.expiresInMinutes} minuti e può essere usato una sola volta.`,
    'Se non hai richiesto tu questo codice, non utilizzarlo e verifica l’attività nel tuo account DueCase.','','DueCase',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#0A3267">
      <h2 style="margin-bottom:8px">DueCase</h2>
      <p>Ciao ${escapeHtml(input.recipientName)},</p>
      <p>il codice di sicurezza per confermare l’approvazione della spesa straordinaria <strong>“${escapeHtml(safeTitle)}”</strong> (${input.amount} €) è:</p>
      <div style="font-size:34px;font-weight:700;letter-spacing:8px;text-align:center;padding:18px;background:#E9F0F8;border-radius:12px;margin:18px 0">${input.otp}</div>
      <p>Il codice scade tra <strong>${input.expiresInMinutes} minuti</strong> e può essere usato una sola volta.</p>
      <p style="font-size:13px;color:#5D7CA7">Se non hai richiesto tu questo codice, non utilizzarlo e verifica l’attività nel tuo account DueCase.</p>
    </div>`;
  await sendEmail({ to: input.to, subject, text, html });
}

export function isEmailConfigured(): boolean {
  return Boolean(
    config.BREVO_API_KEY ||
    (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS && config.EMAIL_FROM)
  );
}

export async function verifyEmailTransport(): Promise<boolean> {
  if (config.BREVO_API_KEY) {
    const response = await fetch(`${config.BREVO_API_URL.replace(/\/$/, '')}/account`, {
      headers: { accept: 'application/json', 'api-key': config.BREVO_API_KEY },
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  }
  const smtp = getTransporter();
  if (!smtp) return false;
  await smtp.verify();
  return true;
}

export async function sendAccountCode(to: string, code: string, purpose: 'verify' | 'reset'): Promise<void> {
  if (!isEmailConfigured()) throw new Error('SMTP_NOT_CONFIGURED');
  await sendEmail({
    to,
    subject: purpose === 'verify' ? 'DueCase · Verifica email' : 'DueCase · Recupero password',
    text: `Il tuo codice DueCase è ${code}. Scade tra 10 minuti ed è utilizzabile una sola volta. Se non lo hai richiesto, ignora questa email.`,
  });
}

export async function sendParentInvitationEmail(input: {
  to: string;
  inviterName: string;
  familyName: string;
  invitedRole: 'father' | 'mother';
  inviteLink: string;
  expiresAt: Date;
}): Promise<void> {
  if (!isEmailConfigured()) throw new Error('SMTP_NOT_CONFIGURED');

  const roleLabel = input.invitedRole === 'mother' ? 'Mamma' : 'Papà';
  const expiresLabel = input.expiresAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  const publicInviteLink = officialParentInvitationLink(input);
  const subject = `${input.inviterName} ti ha invitato su DueCase`;
  const text = [
    'Ciao,','',
    `${input.inviterName} ti ha invitato a entrare nella famiglia “${input.familyName}” su DueCase come ${roleLabel}.`,
    'Apri il link qui sotto per registrarti o accedere e collegarti automaticamente alla stessa famiglia:','',
    publicInviteLink,'',
    `L'invito scade il ${expiresLabel}.`,
    'Se non riconosci questo invito, puoi ignorare questa email.','','DueCase',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:580px;margin:0 auto;color:#0A3267;line-height:1.5">
      <h2 style="margin-bottom:8px">DueCase</h2>
      <p><strong>${escapeHtml(input.inviterName)}</strong> ti ha invitato a entrare nella famiglia <strong>“${escapeHtml(input.familyName)}”</strong> come ${roleLabel}.</p>
      <p>Registrati o accedi: il collegamento alla famiglia sarà già predisposto.</p>
      <p style="margin:26px 0"><a href="${escapeHtml(publicInviteLink)}" style="display:inline-block;background:#1769E0;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700">Accetta invito</a></p>
      <p style="font-size:13px;color:#5D7CA7">L'invito scade il ${escapeHtml(expiresLabel)}. Se non riconosci questo invito, puoi ignorare questa email.</p>
    </div>`;

  await sendEmail({ to: input.to, subject, text, html });
}

const professionalScopeLabels: Record<string, string> = {
  calendar: 'Calendario e permanenze',
  expenses: 'Spese e rimborsi',
  agreements: 'Accordi',
  documents: 'Documenti',
  dossier: 'Dossier ed esportazioni',
  messages: 'Messaggi',
};

export async function sendProfessionalInvitationEmail(input: {
  to: string;
  inviterName: string;
  familyName: string;
  inviteLink: string;
  scopes: string[];
  expiresAt: Date;
}): Promise<void> {
  if (!isEmailConfigured()) throw new Error('SMTP_NOT_CONFIGURED');

  const expiresLabel = input.expiresAt.toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
  const scopeLabels = input.scopes.map((scope) => professionalScopeLabels[scope] ?? scope);
  const permissionsText = scopeLabels.length ? scopeLabels.join(', ') : 'Nessuna sezione';
  const permissionsHtml = scopeLabels.length
    ? `<ul>${scopeLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>`
    : '<p>Nessuna sezione selezionata.</p>';
  const subject = `${input.inviterName} ti ha invitato come professionista su DueCase`;
  const text = [
    'Ciao,','',
    `${input.inviterName} ti ha invitato a consultare la pratica “${input.familyName}” su DueCase come professionista.`,
    `Accesso autorizzato a: ${permissionsText}.`,'',
    'L’accesso è in sola lettura: non potrai modificare contenuti, inviare messaggi o approvare/rifiutare richieste per conto dei genitori.','',
    input.inviteLink,'',
    `L'invito scade il ${expiresLabel}.`,
    'Il genitore che ha concesso l’accesso può revocarlo in qualsiasi momento.','','DueCase',
  ].join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0A3267;line-height:1.5">
      <h2 style="margin-bottom:8px">DueCase · Accesso professionisti</h2>
      <p><strong>${escapeHtml(input.inviterName)}</strong> ti ha invitato a consultare la pratica <strong>“${escapeHtml(input.familyName)}”</strong>.</p>
      <p>Potrai consultare esclusivamente le sezioni autorizzate:</p>
      ${permissionsHtml}
      <p><strong>Accesso in sola lettura.</strong> Non potrai modificare contenuti, inviare messaggi o approvare/rifiutare richieste per conto dei genitori.</p>
      <p style="margin:26px 0"><a href="${escapeHtml(input.inviteLink)}" style="display:inline-block;background:#1769E0;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700">Accedi come professionista</a></p>
      <p style="font-size:13px;color:#5D7CA7">L'invito scade il ${escapeHtml(expiresLabel)}. L’accesso può essere revocato dal genitore che lo ha concesso.</p>
    </div>`;

  await sendEmail({
    to: input.to,
    replyTo: config.LEGAL_EMAIL,
    subject,
    text,
    html,
  });
}
