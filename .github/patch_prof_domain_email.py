from pathlib import Path

# --- migration for professional email changes ---
Path('backend/sql/030_professional_email_change.sql').write_text("""-- Professional email-change verification.
ALTER TABLE professional_email_challenges
  DROP CONSTRAINT IF EXISTS professional_email_challenges_purpose_check;
ALTER TABLE professional_email_challenges
  ADD CONSTRAINT professional_email_challenges_purpose_check
  CHECK (purpose IN ('reset','email_change'));
ALTER TABLE professional_email_challenges
  ADD COLUMN IF NOT EXISTS target_email TEXT;
CREATE INDEX IF NOT EXISTS idx_professional_email_challenges_target
  ON professional_email_challenges(LOWER(target_email), created_at DESC)
  WHERE target_email IS NOT NULL;
""", encoding='utf-8')

# --- new authenticated email-change routes ---
Path('backend/src/routes/professionalEmailChange.ts').write_text(r'''import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { getProfessionalAuth, requireProfessionalAuth, signProfessionalAccessToken } from '../professionalAuth.js';
import { isEmailConfigured, sendProfessionalEmailChangeCode, sendProfessionalSecurityNotice } from '../services/emailService.js';
import { rateLimit } from '../services/rateLimit.js';

const router = Router();
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const codeSchema = z.string().regex(/^\d{6}$/);
const hash = (id: string, code: string) => createHmac('sha256', config.OTP_SECRET ?? config.JWT_SECRET).update(`${id}|${code}`).digest('hex');

router.post('/email-change/request', requireProfessionalAuth, rateLimit(10, 60 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  if (!isEmailConfigured()) throw new ApiError(503, 'Invio email non ancora configurato.', 'EMAIL_NOT_CONFIGURED');
  const professional = getProfessionalAuth(req);
  const newEmail = emailSchema.parse(req.body.newEmail);
  if (newEmail === professional.email.toLowerCase()) throw new ApiError(400, 'Il nuovo indirizzo coincide con quello attuale.', 'EMAIL_UNCHANGED');
  const duplicate = await pool.query(`SELECT 1 FROM professional_users WHERE LOWER(email)=$1 AND deleted_at IS NULL AND id<>$2`, [newEmail, professional.professionalId]);
  if (duplicate.rows[0]) throw new ApiError(409, 'Questo indirizzo email è già associato a un altro account professionista.', 'EMAIL_ALREADY_USED');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const recent = await client.query(
      `SELECT 1 FROM professional_email_challenges WHERE professional_id=$1 AND purpose='email_change' AND created_at>NOW()-INTERVAL '1 minute'`,
      [professional.professionalId],
    );
    if (recent.rowCount) throw new ApiError(429, 'Attendi un minuto prima di richiedere un nuovo codice.', 'CODE_RATE_LIMIT');
    await client.query(`UPDATE professional_email_challenges SET consumed_at=NOW() WHERE professional_id=$1 AND purpose='email_change' AND consumed_at IS NULL`, [professional.professionalId]);
    const id = randomUUID();
    const code = String(randomInt(100000, 1000000));
    await client.query(
      `INSERT INTO professional_email_challenges(id,professional_id,purpose,code_hash,target_email,expires_at) VALUES($1,$2,'email_change',$3,$4,NOW()+INTERVAL '10 minutes')`,
      [id, professional.professionalId, hash(id, code), newEmail],
    );
    await sendProfessionalEmailChangeCode({ to: newEmail, displayName: professional.displayName, code });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  await sendProfessionalSecurityNotice({
    to: professional.email,
    displayName: professional.displayName,
    title: 'Richiesta modifica email',
    message: `È stata richiesta la modifica dell'indirizzo email del tuo account professionista verso ${newEmail}. Se non sei stato tu, cambia subito la password e contatta l'assistenza DueCase.`,
  }).catch((error) => console.error('Professional old-email security notice failed', error instanceof Error ? error.message : error));
  res.json({ message: 'Codice inviato al nuovo indirizzo email.', newEmail });
}));

router.post('/email-change/confirm', requireProfessionalAuth, rateLimit(20, 15 * 60 * 1000, ['POST']), asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const code = codeSchema.parse(req.body.code);
  const client = await pool.connect();
  let newEmail = '';
  let nextVersion = professional.tokenVersion;
  try {
    await client.query('BEGIN');
    const challengeResult = await client.query<{ id: string; code_hash: string; attempts: number; target_email: string }>(
      `SELECT id,code_hash,attempts,target_email FROM professional_email_challenges
       WHERE professional_id=$1 AND purpose='email_change' AND consumed_at IS NULL AND expires_at>NOW()
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [professional.professionalId],
    );
    const challenge = challengeResult.rows[0];
    if (!challenge || challenge.attempts >= 5 || !challenge.target_email) throw new ApiError(400, 'Codice scaduto o non valido.', 'INVALID_CODE');
    const supplied = Buffer.from(hash(challenge.id, code), 'hex');
    const stored = Buffer.from(challenge.code_hash, 'hex');
    if (supplied.length !== stored.length || !timingSafeEqual(stored, supplied)) {
      await client.query('UPDATE professional_email_challenges SET attempts=attempts+1 WHERE id=$1', [challenge.id]);
      await client.query('COMMIT');
      throw new ApiError(400, 'Codice non valido.', 'INVALID_CODE');
    }
    newEmail = challenge.target_email.toLowerCase();
    const duplicate = await client.query(`SELECT 1 FROM professional_users WHERE LOWER(email)=$1 AND deleted_at IS NULL AND id<>$2`, [newEmail, professional.professionalId]);
    if (duplicate.rows[0]) throw new ApiError(409, 'Questo indirizzo email è già associato a un altro account professionista.', 'EMAIL_ALREADY_USED');
    nextVersion = professional.tokenVersion + 1;
    await client.query('UPDATE professional_email_challenges SET consumed_at=NOW() WHERE id=$1', [challenge.id]);
    await client.query('UPDATE professional_users SET email=$1,token_version=$2,updated_at=NOW() WHERE id=$3', [newEmail, nextVersion, professional.professionalId]);
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally { client.release(); }

  await Promise.allSettled([
    sendProfessionalSecurityNotice({ to: professional.email, displayName: professional.displayName, title: 'Email account modificata', message: `L'indirizzo email del tuo account professionista DueCase è stato modificato in ${newEmail}.` }),
    sendProfessionalSecurityNotice({ to: newEmail, displayName: professional.displayName, title: 'Nuovo indirizzo email confermato', message: 'Questo indirizzo è ora associato al tuo account professionista DueCase.' }),
  ]);
  res.json({ email: newEmail, token: signProfessionalAccessToken(professional.professionalId, nextVersion) });
}));

export default router;
''', encoding='utf-8')

# --- email helpers ---
email_path = Path('backend/src/services/emailService.ts')
email_text = email_path.read_text(encoding='utf-8')
if 'sendProfessionalEmailChangeCode' not in email_text:
    email_text += r'''

export async function sendProfessionalEmailChangeCode(input: { to: string; displayName: string; code: string }): Promise<void> {
  if (!isEmailConfigured()) throw new Error('SMTP_NOT_CONFIGURED');
  const subject = 'DueCase · Conferma nuovo indirizzo email';
  const text = `Ciao ${input.displayName},\n\nil codice per confermare il nuovo indirizzo email del tuo account professionista DueCase è ${input.code}.\n\nScade tra 10 minuti e può essere usato una sola volta. Se non hai richiesto tu questa modifica, non usare il codice e contatta l'assistenza.`;
  const html = emailShell({
    eyebrow: 'Sicurezza account professionista',
    title: 'Conferma il nuovo indirizzo email',
    body: `<p style="margin:0 0 16px">Ciao <strong>${escapeHtml(input.displayName)}</strong>, usa questo codice per confermare il nuovo indirizzo email del tuo account professionista:</p><div style="font-size:38px;font-weight:800;letter-spacing:9px;text-align:center;padding:20px 14px;background:#EAF3FB;border:1px solid #D6E5F3;border-radius:14px;margin:22px 0;color:#0B376D">${input.code}</div><p style="margin:0">Il codice è valido per <strong>10 minuti</strong> e può essere utilizzato una sola volta.</p>`,
    note: 'Se non hai richiesto tu questa modifica, non utilizzare il codice e contatta l’assistenza DueCase.',
  });
  await sendEmail({ to: input.to, subject, text, html });
}

export async function sendProfessionalSecurityNotice(input: { to: string; displayName: string; title: string; message: string }): Promise<void> {
  if (!isEmailConfigured()) throw new Error('SMTP_NOT_CONFIGURED');
  const subject = `DueCase · ${input.title}`;
  const text = `Ciao ${input.displayName},\n\n${input.message}\n\nSe non riconosci questa operazione, contatta immediatamente l'assistenza DueCase.`;
  const html = emailShell({
    eyebrow: 'Sicurezza account professionista',
    title: input.title,
    body: `<p style="margin:0 0 14px">Ciao <strong>${escapeHtml(input.displayName)}</strong>,</p><p style="margin:0">${escapeHtml(input.message)}</p>`,
    note: 'Se non riconosci questa operazione, contatta immediatamente l’assistenza DueCase.',
  });
  await sendEmail({ to: input.to, subject, text, html });
}
'''
    email_path.write_text(email_text, encoding='utf-8')

# --- mount email-change route ---
app_path = Path('backend/src/app.ts')
app_text = app_path.read_text(encoding='utf-8')
if "professionalEmailChangeRouter" not in app_text:
    app_text = app_text.replace("import professionalAuthRouter from './routes/professionalAuth.js';", "import professionalAuthRouter from './routes/professionalAuth.js';\nimport professionalEmailChangeRouter from './routes/professionalEmailChange.js';")
    app_text = app_text.replace("app.use('/api/professional-auth', professionalAuthRouter);", "app.use('/api/professional-auth', professionalAuthRouter);\napp.use('/api/professional-auth', professionalEmailChangeRouter);")
    app_path.write_text(app_text, encoding='utf-8')

# --- password-change security email ---
auth_path = Path('backend/src/routes/professionalAuth.ts')
auth_text = auth_path.read_text(encoding='utf-8')
if "sendProfessionalSecurityNotice" not in auth_text:
    auth_text = auth_text.replace("import { passwordSchema } from '../services/validation.js';", "import { passwordSchema } from '../services/validation.js';\nimport { sendProfessionalSecurityNotice } from '../services/emailService.js';")
    auth_text = auth_text.replace(
        "  res.json({ token: signProfessionalAccessToken(professional.professionalId, nextVersion) });\n}));",
        "  await sendProfessionalSecurityNotice({ to: professional.email, displayName: professional.displayName, title: 'Password modificata', message: 'La password del tuo account professionista DueCase è stata modificata. Le altre sessioni già aperte sono state disconnesse.' }).catch((error) => console.error('Professional password security email failed', error instanceof Error ? error.message : error));\n  res.json({ token: signProfessionalAccessToken(professional.professionalId, nextVersion) });\n}));",
        1,
    )
    auth_path.write_text(auth_text, encoding='utf-8')

# --- password-reset security email ---
reset_path = Path('backend/src/routes/professionalPasswordReset.ts')
reset_text = reset_path.read_text(encoding='utf-8')
if 'sendProfessionalSecurityNotice' not in reset_text:
    reset_text = reset_text.replace("import { isEmailConfigured, sendAccountCode } from '../services/emailService.js';", "import { isEmailConfigured, sendAccountCode, sendProfessionalSecurityNotice } from '../services/emailService.js';")
    reset_text = reset_text.replace("  const professional = rows[0];", "  const professional = rows[0];", 1)
    reset_text = reset_text.replace(
        "    await client.query('COMMIT');\n    res.json({ reset: true });",
        "    await client.query('COMMIT');\n    await sendProfessionalSecurityNotice({ to: input.email, displayName: 'Professionista', title: 'Password reimpostata', message: 'La password del tuo account professionista DueCase è stata reimpostata tramite codice email. Tutte le sessioni precedenti sono state invalidate.' }).catch((error) => console.error('Professional reset security email failed', error instanceof Error ? error.message : error));\n    res.json({ reset: true });",
        1,
    )
    reset_path.write_text(reset_text, encoding='utf-8')

# --- professional invitation always points to public custom domain ---
prof_path = Path('backend/src/routes/professionals.ts')
prof_text = prof_path.read_text(encoding='utf-8')
prof_text = prof_text.replace("const portalBase = (config.PROFESSIONAL_PORTAL_URL ?? `${config.SITE_URL.replace(/\\/$/, '')}/professionisti`).replace(/\\/$/, '');\n  return `${portalBase}/accetta?token=${encodeURIComponent(rawToken)}`;", "const portalBase = `${config.SITE_URL.replace(/\\/$/, '')}/professionisti`;\n  return `${portalBase}/?token=${encodeURIComponent(rawToken)}`;")
prof_path.write_text(prof_text, encoding='utf-8')

# --- publish portal frontend under website/custom domain ---
portal_dir = Path('website/professionisti')
portal_dir.mkdir(parents=True, exist_ok=True)
html = Path('backend/public/professional-portal.html').read_text(encoding='utf-8')
html = html.replace('href="/professional-portal.css"', 'href="/professionisti/portal.css"')
html = html.replace('href="/professional-password-reset.html"', 'href="/professionisti/password-reset.html"')
html = html.replace('src="/professional-portal.js"', 'src="/professionisti/portal.js"')
html = html.replace('href="/professionisti"', 'href="/professionisti/"')
portal_dir.joinpath('index.html').write_text(html, encoding='utf-8')

css = Path('backend/public/professional-portal.css').read_text(encoding='utf-8')
portal_dir.joinpath('portal.css').write_text(css, encoding='utf-8')

js = Path('backend/public/professional-portal.js').read_text(encoding='utf-8')
old_api = "  const API_BASE = location.hostname.endsWith('onrender.com')\n    ? `${location.origin}/api`\n    : 'https://api.duecaseununicasquadra.com/api';"
js = js.replace(old_api, "  const API_BASE = 'https://duecase-api.onrender.com/api';")
js = js.replace("history.replaceState({ duecasePortal: true }, '', '/professionisti');", "history.replaceState({ duecasePortal: true }, '', '/professionisti/');")
# replace read-only email area with verified email-change controls
js = js.replace(
    '''            <label>Email<input id="settingsEmail" type="email" readonly></label>\n            <p class="fineprint">Per sicurezza la modifica dell’email richiede una procedura di verifica dedicata. L’indirizzo attuale resta quello usato per accesso e recupero password.</p>''',
    '''            <label>Email attuale<input id="settingsEmail" type="email" readonly></label>\n            <div class="email-change-box">\n              <label>Nuova email<input id="settingsNewEmail" type="email" autocomplete="email" placeholder="nuovo@studio.it"></label>\n              <button id="requestEmailChangeBtn" class="secondary" type="button">Invia codice di verifica</button>\n              <div id="emailChangeConfirmBox" class="hidden">\n                <label>Codice ricevuto via email<input id="settingsEmailCode" inputmode="numeric" maxlength="6" placeholder="000000"></label>\n                <button id="confirmEmailChangeBtn" class="primary" type="button">Conferma nuova email</button>\n              </div>\n              <p class="fineprint">Il codice viene inviato al nuovo indirizzo. L’indirizzo attuale riceve anche un avviso di sicurezza.</p>\n            </div>''')
insert_anchor = "    $('professionalSettingsForm').addEventListener('submit', async (event) => {"
email_logic = r'''    $('requestEmailChangeBtn').addEventListener('click', async () => {
      const newEmail = $('settingsNewEmail').value.trim();
      if (!newEmail) return setStatus('Inserisci il nuovo indirizzo email.', true);
      const button = $('requestEmailChangeBtn');
      button.disabled = true;
      try {
        await api('/professional-auth/email-change/request', { method: 'POST', body: JSON.stringify({ newEmail }) }, true);
        show($('emailChangeConfirmBox'), true);
        setStatus('Codice inviato al nuovo indirizzo email.');
      } catch (error) { setStatus(error.message || 'Impossibile inviare il codice.', true); }
      finally { button.disabled = false; }
    });

    $('confirmEmailChangeBtn').addEventListener('click', async () => {
      const code = $('settingsEmailCode').value.trim();
      if (!/^\d{6}$/.test(code)) return setStatus('Inserisci il codice di 6 cifre ricevuto via email.', true);
      const button = $('confirmEmailChangeBtn');
      button.disabled = true;
      try {
        const result = await api('/professional-auth/email-change/confirm', { method: 'POST', body: JSON.stringify({ code }) }, true);
        setToken(result.token);
        professional = await api('/professional-auth/me', {}, true);
        $('settingsEmail').value = professional.email || result.email;
        $('settingsNewEmail').value = '';
        $('settingsEmailCode').value = '';
        show($('emailChangeConfirmBox'), false);
        text($('professionalEmail'), professional.email || '');
        setStatus('Indirizzo email modificato e verificato.');
      } catch (error) { setStatus(error.message || 'Codice non valido.', true); }
      finally { button.disabled = false; }
    });

'''
if insert_anchor in js and 'requestEmailChangeBtn' not in js.split(insert_anchor,1)[0][-5000:]:
    js = js.replace(insert_anchor, email_logic + insert_anchor, 1)
portal_dir.joinpath('portal.js').write_text(js, encoding='utf-8')

# password reset page under same public domain
reset_html = Path('backend/public/professional-password-reset.html').read_text(encoding='utf-8')
reset_html = reset_html.replace('/professional-portal.css', '/professionisti/portal.css')
reset_html = reset_html.replace('/professional-password-reset.js', '/professionisti/password-reset.js')
reset_html = reset_html.replace('/professionisti', '/professionisti/')
portal_dir.joinpath('password-reset.html').write_text(reset_html, encoding='utf-8')
reset_js = Path('backend/public/professional-password-reset.js').read_text(encoding='utf-8')
reset_js = reset_js.replace("const API_BASE = location.hostname.endsWith('onrender.com') ? `${location.origin}/api` : 'https://api.duecaseununicasquadra.com/api';", "const API_BASE = 'https://duecase-api.onrender.com/api';")
portal_dir.joinpath('password-reset.js').write_text(reset_js, encoding='utf-8')

# public website CTAs never expose onrender
landing_path = Path('website/professionisti.html')
landing = landing_path.read_text(encoding='utf-8').replace('https://duecase-api.onrender.com/professionisti', '/professionisti/')
landing_path.write_text(landing, encoding='utf-8')

# scan HTML for any user-visible onrender portal links and replace them
for page in Path('website').glob('*.html'):
    t = page.read_text(encoding='utf-8')
    t2 = t.replace('https://duecase-api.onrender.com/professionisti', '/professionisti/')
    if t2 != t: page.write_text(t2, encoding='utf-8')
