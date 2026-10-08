import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const LOGO_URL = `${config.SITE_URL.replace(/\/$/, '')}/duecase-logo.svg`;

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

function emailShell(input: { eyebrow?: string; title: string; body: string; note?: string }): string {
  const site = config.SITE_URL.replace(/\/$/, '');
  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:0;background:#F3F7FB;font-family:Arial,Helvetica,sans-serif;color:#16365C">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F3F7FB;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#FFFFFF;border-radius:18px;overflow:hidden;border:1px solid #DCE8F4;box-shadow:0 8px 28px rgba(20,55,95,.08)">
          <tr><td style="padding:24px 28px 16px;text-align:center;background:linear-gradient(135deg,#EAF5FF,#FFF4E9)">
            <img src="${LOGO_URL}" width="58" height="58" alt="DueCase" style="display:block;margin:0 auto 10px;border:0;outline:none;text-decoration:none;border-radius:14px" />
            <div style="font-size:22px;font-weight:700;color:#0B376D">DueCase</div>
            <div style="font-size:12px;color:#5D7CA7;margin-top:4px">Due case. Un'unica squadra.</div>
          </td></tr>
          <tr><td style="padding:30px 30px 18px">
            ${input.eyebrow ? `<div style="font-size:12px;font-weight:700;letter-spacing:.9px;color:#F17922;text-transform:uppercase;margin-bottom:8px">${escapeHtml(input.eyebrow)}</div>` : ''}
            <h1 style="margin:0 0 18px;font-size:26px;line-height:1.2;color:#0B376D">${escapeHtml(input.title)}</h1>
            <div style="font-size:16px;line-height:1.65;color:#294D73">${input.body}</div>
            ${input.note ? `<div style="margin-top:22px;padding:14px 16px;background:#F7FAFD;border-left:4px solid #F17922;border-radius:10px;font-size:13px;line-height:1.5;color:#5D7088">${input.note}</div>` : ''}
          </td></tr>
          <tr><td style="padding:18px 30px 26px;border-top:1px solid #E7EEF6;text-align:center;font-size:12px;line-height:1.6;color:#6C8098">
            <div><a href="${site}" style="color:#1769E0;text-decoration:none">${escapeHtml(config.SITE_URL.replace(/^https?:\/\//,''))}</a></div>
            <div><a href="mailto:${escapeHtml(config.SUPPORT_EMAIL)}" style="color:#1769E0;text-decoration:none">${escapeHtml(config.SUPPORT_EMAIL)}</a> · <a href="${site}/privacy.html" style="color:#1769E0;text-decoration:none">Privacy</a></div>
            <div style="margin-top:8px">Email automatica di servizio. Non rispondere a questo messaggio.</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
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
    'Se non hai richiesto tu questo codice, non utilizzarlo e verifica l’attività nel tuo account DueCase.',
    'La conferma tramite OTP documenta un’operazione eseguita nel servizio ma non costituisce automaticamente firma elettronica qualificata o prova legale con valore predeterminato.','','DueCase',
  ].join('\n');
  const html = emailShell({
    eyebrow: 'Sicurezza spesa',
    title: 'Conferma approvazione spesa',
    body: `
      <p style="margin:0 0 14px">Ciao <strong>${escapeHtml(input.recipientName)}</strong>,</p>
      <p style="margin:0 0 14px">usa questo codice per confermare l’approvazione della spesa straordinaria <strong>“${escapeHtml(safeTitle)}”</strong> (${escapeHtml(input.amount)} €):</p>
      <div style="font-size:36px;font-weight:800;letter-spacing:8px;text-align:center;padding:18px;background:#EAF3FB;border:1px solid #D6E5F3;border-radius:14px;margin:20px 0;color:#0B376D">${input.otp}</div>
      <p style="margin:0">Il codice scade tra <strong>${input.expiresInMinutes} minuti</strong> e può essere usato una sola volta.</p>`,
    note: 'Se non hai richiesto tu questo codice, non utilizzarlo e verifica l’attività nel tuo account. La conferma tramite OTP documenta un’operazione nell’app ma non costituisce automaticamente firma elettronica qualificata o prova legale con valore predeterminato.',
  });
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
  const isVerify = purpose === 'verify';
  const subject = isVerify ? 'DueCase · Verifica email' : 'DueCase · Recupero password';
  const title = isVerify ? 'Verifica il tuo indirizzo email' : 'Recupero password';
  const intro = isVerify
    ? 'Abbiamo ricevuto una richiesta di verifica per il tuo account DueCase.'
    : 'Abbiamo ricevuto una richiesta di recupero password per il tuo account DueCase.';
  const text = `${intro}\n\nIl tuo codice è ${code}.\n\nScade tra 10 minuti ed è utilizzabile una sola volta. Se non hai richiesto tu questa operazione, ignora questa email.`;
  const html = emailShell({
    eyebrow: isVerify ? 'Verifica account' : 'Sicurezza account',
    title,
    body: `
      <p style="margin:0 0 16px">${escapeHtml(intro)}</p>
      <div style="font-size:38px;font-weight:800;letter-spacing:9px;text-align:center;padding:20px 14px;background:#EAF3FB;border:1px solid #D6E5F3;border-radius:14px;margin:22px 0;color:#0B376D">${code}</div>
      <p style="margin:0">Il codice è valido per <strong>10 minuti</strong> e può essere utilizzato <strong>una sola volta</strong>.</p>`,
    note: 'Se non hai richiesto tu questa operazione, puoi ignorare questa email. Non condividere mai il codice con altre persone.',
  });
  await sendEmail({ to, subject, text, html });
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

  const html = emailShell({
    eyebrow: 'Invito famiglia',
    title: 'Sei stato invitato su DueCase',
    body: `
      <p style="margin:0 0 14px"><strong>${escapeHtml(input.inviterName)}</strong> ti ha invitato a entrare nella famiglia <strong>“${escapeHtml(input.familyName)}”</strong> come ${roleLabel}.</p>
      <p style="margin:0 0 22px">Registrati o accedi: il collegamento alla famiglia sarà già predisposto.</p>
      <p style="text-align:center;margin:24px 0"><a href="${escapeHtml(publicInviteLink)}" style="display:inline-block;background:#1769E0;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700">Accetta invito</a></p>`,
    note: `L'invito scade il ${escapeHtml(expiresLabel)}. Se non riconosci questo invito, puoi ignorare questa email.`,
  });

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
    ? `<ul style="padding-left:20px">${scopeLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>`
    : '<p>Nessuna sezione selezionata.</p>';
  const subject = `${input.inviterName} ti ha invitato come professionista su DueCase`;
  const text = [
    'Ciao,','',
    `${input.inviterName} ti ha invitato a consultare la pratica “${input.familyName}” su DueCase come professionista.`,
    `Accesso autorizzato a: ${permissionsText}.`,'',
    'L’accesso è in sola lettura: non potrai modificare contenuti, inviare messaggi o approvare/rifiutare richieste per conto dei genitori.','',
    input.inviteLink,'',
    `L'invito scade il ${expiresLabel}.`,
    'Il genitore che ha concesso l’accesso può revocarlo in qualsiasi momento.',
    'DueCase è uno strumento organizzativo e documentale e non attribuisce automaticamente valore legale ai contenuti consultati o esportati.','','DueCase',
  ].join('\n');

  const html = emailShell({
    eyebrow: 'Accesso professionisti',
    title: 'Invito a consultare una pratica',
    body: `
      <p style="margin:0 0 14px"><strong>${escapeHtml(input.inviterName)}</strong> ti ha invitato a consultare la pratica <strong>“${escapeHtml(input.familyName)}”</strong>.</p>
      <p style="margin:0 0 8px">Potrai consultare esclusivamente le sezioni autorizzate:</p>
      ${permissionsHtml}
      <p><strong>Accesso in sola lettura.</strong> Non potrai modificare contenuti, inviare messaggi o approvare/rifiutare richieste per conto dei genitori.</p>
      <p style="text-align:center;margin:24px 0"><a href="${escapeHtml(input.inviteLink)}" style="display:inline-block;background:#1769E0;color:#fff;text-decoration:none;padding:14px 24px;border-radius:12px;font-weight:700">Accedi come professionista</a></p>`,
    note: `L'invito scade il ${escapeHtml(expiresLabel)}. L’accesso può essere revocato dal genitore che lo ha concesso. DueCase è uno strumento organizzativo e documentale e non attribuisce automaticamente valore legale ai contenuti, alle conferme o alle esportazioni.`,
  });

  await sendEmail({
    to: input.to,
    replyTo: config.LEGAL_EMAIL,
    subject,
    text,
    html,
  });
}
