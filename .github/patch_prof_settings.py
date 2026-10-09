from pathlib import Path

migration = Path('backend/sql/029_professional_settings.sql')
migration.write_text("""-- Professional profile and portal settings.
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS qualification TEXT;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS professional_register TEXT;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS notify_activity BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS notify_documents BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE professional_users ADD COLUMN IF NOT EXISTS notify_access_changes BOOLEAN NOT NULL DEFAULT TRUE;
""", encoding='utf-8')

path = Path('backend/src/routes/professionalAuth.ts')
text = path.read_text(encoding='utf-8')
anchor = "const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) });"
addition = anchor + """
const settingsSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  organization: z.string().trim().max(160).nullable().optional(),
  qualification: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  professionalRegister: z.string().trim().max(160).nullable().optional(),
  registrationNumber: z.string().trim().max(80).nullable().optional(),
  notifyActivity: z.boolean(),
  notifyDocuments: z.boolean(),
  notifyAccessChanges: z.boolean(),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).superRefine((value, ctx) => {
  if (value.newPassword !== value.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Le password non coincidono.' });
});
"""
if anchor not in text:
    raise SystemExit('professionalAuth schema anchor not found')
text = text.replace(anchor, addition, 1)
old_me = """router.get('/me', requireProfessionalAuth, asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  res.json({
    id: professional.professionalId,
    email: professional.email,
    displayName: professional.displayName,
    firstName: professional.firstName,
    lastName: professional.lastName,
    organization: professional.organization,
  });
}));"""
new_me = """router.get('/me', requireProfessionalAuth, asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const { rows } = await pool.query(
    `SELECT id,email,display_name AS \"displayName\",first_name AS \"firstName\",last_name AS \"lastName\",organization,
            qualification,phone,professional_register AS \"professionalRegister\",registration_number AS \"registrationNumber\",
            notify_activity AS \"notifyActivity\",notify_documents AS \"notifyDocuments\",notify_access_changes AS \"notifyAccessChanges\"
       FROM professional_users WHERE id=$1 AND deleted_at IS NULL`,
    [professional.professionalId],
  );
  if (!rows[0]) throw new ApiError(404, 'Account professionista non trovato', 'PROFESSIONAL_NOT_FOUND');
  res.json(rows[0]);
}));

router.patch('/me', requireProfessionalAuth, asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const body = settingsSchema.parse(req.body);
  const displayName = `${body.firstName} ${body.lastName}`.trim();
  const { rows } = await pool.query(
    `UPDATE professional_users
        SET first_name=$1,last_name=$2,display_name=$3,organization=$4,qualification=$5,phone=$6,
            professional_register=$7,registration_number=$8,notify_activity=$9,notify_documents=$10,notify_access_changes=$11,updated_at=NOW()
      WHERE id=$12 AND deleted_at IS NULL
      RETURNING id,email,display_name AS \"displayName\",first_name AS \"firstName\",last_name AS \"lastName\",organization,
                qualification,phone,professional_register AS \"professionalRegister\",registration_number AS \"registrationNumber\",
                notify_activity AS \"notifyActivity\",notify_documents AS \"notifyDocuments\",notify_access_changes AS \"notifyAccessChanges\"`,
    [body.firstName, body.lastName, displayName, body.organization || null, body.qualification || null, body.phone || null,
     body.professionalRegister || null, body.registrationNumber || null, body.notifyActivity, body.notifyDocuments, body.notifyAccessChanges, professional.professionalId],
  );
  if (!rows[0]) throw new ApiError(404, 'Account professionista non trovato', 'PROFESSIONAL_NOT_FOUND');
  res.json(rows[0]);
}));

router.post('/change-password', requireProfessionalAuth, asyncHandler(async (req, res) => {
  const professional = getProfessionalAuth(req);
  const body = changePasswordSchema.parse(req.body);
  const { rows } = await pool.query<{ passwordHash: string; tokenVersion: number }>(
    `SELECT password_hash AS \"passwordHash\",token_version AS \"tokenVersion\" FROM professional_users WHERE id=$1 AND deleted_at IS NULL`,
    [professional.professionalId],
  );
  const account = rows[0];
  if (!account || !(await bcrypt.compare(body.currentPassword, account.passwordHash))) {
    throw new ApiError(401, 'La password attuale non è corretta', 'PROFESSIONAL_PASSWORD_INVALID');
  }
  const passwordHash = await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS);
  const nextVersion = account.tokenVersion + 1;
  await pool.query(
    `UPDATE professional_users SET password_hash=$1,token_version=$2,updated_at=NOW() WHERE id=$3`,
    [passwordHash, nextVersion, professional.professionalId],
  );
  res.json({ token: signProfessionalAccessToken(professional.professionalId, nextVersion) });
}));"""
if old_me not in text:
    raise SystemExit('professionalAuth /me anchor not found')
path.write_text(text.replace(old_me, new_me, 1), encoding='utf-8')

path = Path('backend/public/professional-portal.html')
text = path.read_text(encoding='utf-8')
sidebar_anchor = '        <nav id="clientList" class="client-list" aria-label="Pratiche"></nav>\n      </aside>'
sidebar_repl = '        <nav id="clientList" class="client-list" aria-label="Pratiche"></nav>\n        <button id="settingsBtn" class="settings-nav-button" type="button" aria-label="Apri impostazioni">⚙ Impostazioni</button>\n      </aside>'
if sidebar_anchor not in text:
    raise SystemExit('portal sidebar anchor not found')
text = text.replace(sidebar_anchor, sidebar_repl, 1)
workspace_anchor = '        </div>\n      </section>\n    </section>\n  </main>'
workspace_repl = '        </div>\n        <div id="settingsWorkspace" class="hidden"></div>\n      </section>\n    </section>\n  </main>'
if workspace_anchor not in text:
    raise SystemExit('portal workspace anchor not found')
path.write_text(text.replace(workspace_anchor, workspace_repl, 1), encoding='utf-8')

path = Path('backend/public/professional-portal.js')
text = path.read_text(encoding='utf-8')
refs_anchor = "  const statusBox = $('statusBox');"
refs_repl = refs_anchor + "\n  const settingsBtn = $('settingsBtn');\n  const settingsWorkspace = $('settingsWorkspace');"
if refs_anchor not in text:
    raise SystemExit('portal refs anchor not found')
text = text.replace(refs_anchor, refs_repl, 1)
select_anchor = '    show(emptyWorkspace, false);\n    show(clientWorkspace, true);'
select_repl = "    show(settingsWorkspace, false);\n    settingsBtn.classList.remove('active');\n    show(emptyWorkspace, false);\n    show(clientWorkspace, true);"
if select_anchor not in text:
    raise SystemExit('selectClient anchor not found')
text = text.replace(select_anchor, select_repl, 1)
listener_anchor = "  loginForm.addEventListener('submit', async (event) => {"
settings_code = r'''  async function renderSettings() {
    show(emptyWorkspace, false);
    show(clientWorkspace, false);
    show(settingsWorkspace, true);
    [...clientList.querySelectorAll('.client-button')].forEach((button) => button.classList.remove('active'));
    settingsBtn.classList.add('active');
    settingsWorkspace.innerHTML = `
      <header class="workspace-header settings-header">
        <div><p class="eyebrow">ACCOUNT PROFESSIONISTA</p><h1>Impostazioni</h1><p class="muted">Gestisci il tuo profilo professionale, la sicurezza e le preferenze del portale.</p></div>
      </header>
      <div class="settings-grid">
        <section class="content-panel settings-card">
          <h3>Profilo professionale</h3>
          <form id="professionalSettingsForm" class="settings-form">
            <div class="settings-two-col">
              <label>Nome<input id="settingsFirstName" required minlength="2"></label>
              <label>Cognome<input id="settingsLastName" required minlength="2"></label>
            </div>
            <label>Email<input id="settingsEmail" type="email" readonly></label>
            <p class="fineprint">Per sicurezza la modifica dell’email richiede una procedura di verifica dedicata. L’indirizzo attuale resta quello usato per accesso e recupero password.</p>
            <label>Qualifica / ruolo<input id="settingsQualification" placeholder="Es. Avvocato, mediatore, consulente"></label>
            <label>Studio / organizzazione<input id="settingsOrganization"></label>
            <div class="settings-two-col">
              <label>Telefono<input id="settingsPhone" type="tel"></label>
              <label>Foro / Ordine<input id="settingsRegister"></label>
            </div>
            <label>Numero di iscrizione<input id="settingsRegistrationNumber"></label>
            <h4>Preferenze email</h4>
            <label class="switch-row"><span><strong>Attività della pratica</strong><small>Aggiornamenti rilevanti sulle pratiche autorizzate.</small></span><input id="notifyActivity" type="checkbox"></label>
            <label class="switch-row"><span><strong>Nuovi documenti</strong><small>Avvisi quando vengono condivisi nuovi documenti.</small></span><input id="notifyDocuments" type="checkbox"></label>
            <label class="switch-row"><span><strong>Modifiche agli accessi</strong><small>Revoche e variazioni dei permessi concessi.</small></span><input id="notifyAccessChanges" type="checkbox"></label>
            <p class="fineprint">Le comunicazioni indispensabili per sicurezza, recupero account e gestione degli inviti non possono essere disattivate.</p>
            <button class="primary" type="submit">Salva impostazioni</button>
          </form>
        </section>
        <section class="content-panel settings-card">
          <h3>Sicurezza</h3>
          <form id="professionalPasswordForm" class="settings-form">
            <label>Password attuale<input id="settingsCurrentPassword" type="password" autocomplete="current-password" required></label>
            <label>Nuova password<input id="settingsNewPassword" type="password" autocomplete="new-password" required minlength="8"></label>
            <label>Ripeti nuova password<input id="settingsConfirmPassword" type="password" autocomplete="new-password" required minlength="8"></label>
            <button class="secondary" type="submit">Cambia password</button>
            <p class="fineprint">Il cambio password invalida le altre sessioni professionista già aperte.</p>
          </form>
        </section>
        <section class="content-panel settings-card settings-access-card">
          <h3>Pratiche e accessi</h3>
          <p class="muted">Puoi consultare esclusivamente le sezioni autorizzate dai genitori. Da qui puoi verificare rapidamente i permessi attivi.</p>
          <div id="settingsAccessList" class="record-list"></div>
        </section>
        <section class="content-panel settings-card">
          <h3>Privacy e documenti legali</h3>
          <div class="settings-links">
            <a href="https://duecaseununicasquadra.com/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
            <a href="https://duecaseununicasquadra.com/termini.html" target="_blank" rel="noopener noreferrer">Termini e condizioni</a>
            <a href="https://duecaseununicasquadra.com/cookie.html" target="_blank" rel="noopener noreferrer">Cookie Policy</a>
          </div>
          <p class="fineprint">La cancellazione dell’account professionista non modifica o cancella i dati delle famiglie, che restano nella disponibilità dei rispettivi titolari.</p>
        </section>
        <section class="content-panel settings-card">
          <h3>Assistenza</h3>
          <p class="muted">Per problemi di accesso, cambio email o richiesta di cancellazione dell’account professionista usa il centro assistenza DueCase.</p>
          <a class="secondary settings-link-button" href="https://duecaseununicasquadra.com/assistenza.html" target="_blank" rel="noopener noreferrer">Apri assistenza</a>
          <p class="fineprint">Portale professionisti · DueCase</p>
        </section>
      </div>`;

    professional = await api('/professional-auth/me', {}, true);
    text($('professionalName'), professional.displayName || 'Professionista');
    text($('professionalEmail'), professional.email || '');
    $('settingsFirstName').value = professional.firstName || '';
    $('settingsLastName').value = professional.lastName || '';
    $('settingsEmail').value = professional.email || '';
    $('settingsQualification').value = professional.qualification || '';
    $('settingsOrganization').value = professional.organization || '';
    $('settingsPhone').value = professional.phone || '';
    $('settingsRegister').value = professional.professionalRegister || '';
    $('settingsRegistrationNumber').value = professional.registrationNumber || '';
    $('notifyActivity').checked = professional.notifyActivity !== false;
    $('notifyDocuments').checked = professional.notifyDocuments !== false;
    $('notifyAccessChanges').checked = professional.notifyAccessChanges !== false;

    const accessList = $('settingsAccessList');
    clear(accessList);
    clients.forEach((client) => {
      const card = record(client.familyName, client.grantedByName ? `Autorizzato da ${client.grantedByName}` : 'Accesso autorizzato');
      const chips = elem('div', 'chips');
      (client.scopes || []).forEach((scope) => chips.appendChild(elem('span', 'chip', scopeLabels[scope] || scope)));
      card.appendChild(chips);
      const actions = elem('div', 'action-row');
      const open = elem('button', 'secondary', 'Apri pratica');
      open.type = 'button';
      open.addEventListener('click', () => selectClient(client));
      actions.appendChild(open);
      card.appendChild(actions);
      accessList.appendChild(card);
    });
    if (!clients.length) accessList.appendChild(empty('Nessuna pratica attiva.'));

    $('professionalSettingsForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      busy(form, true);
      setStatus('');
      try {
        professional = await api('/professional-auth/me', {
          method: 'PATCH',
          body: JSON.stringify({
            firstName: $('settingsFirstName').value.trim(),
            lastName: $('settingsLastName').value.trim(),
            organization: $('settingsOrganization').value.trim() || null,
            qualification: $('settingsQualification').value.trim() || null,
            phone: $('settingsPhone').value.trim() || null,
            professionalRegister: $('settingsRegister').value.trim() || null,
            registrationNumber: $('settingsRegistrationNumber').value.trim() || null,
            notifyActivity: $('notifyActivity').checked,
            notifyDocuments: $('notifyDocuments').checked,
            notifyAccessChanges: $('notifyAccessChanges').checked,
          }),
        }, true);
        text($('professionalName'), professional.displayName || 'Professionista');
        text($('professionalEmail'), professional.email || '');
        setStatus('Impostazioni professionista salvate.');
      } catch (error) { setStatus(error.message || 'Impossibile salvare le impostazioni.', true); }
      finally { busy(form, false); }
    });

    $('professionalPasswordForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const next = $('settingsNewPassword').value;
      const confirm = $('settingsConfirmPassword').value;
      if (next !== confirm) return setStatus('Le nuove password non coincidono.', true);
      busy(form, true);
      setStatus('');
      try {
        const result = await api('/professional-auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword: $('settingsCurrentPassword').value, newPassword: next, confirmPassword: confirm }),
        }, true);
        setToken(result.token);
        form.reset();
        setStatus('Password aggiornata. Le altre sessioni sono state disconnesse.');
      } catch (error) { setStatus(error.message || 'Cambio password non riuscito.', true); }
      finally { busy(form, false); }
    });
  }

'''
if listener_anchor not in text:
    raise SystemExit('login listener anchor not found')
text = text.replace(listener_anchor, settings_code + listener_anchor, 1)
logout_anchor = "  logoutBtn.addEventListener('click', () => {"
settings_listener = "  settingsBtn.addEventListener('click', () => {\n    renderSettings().catch((error) => setStatus(error.message || 'Impossibile aprire le impostazioni.', true));\n  });\n\n"
if logout_anchor not in text:
    raise SystemExit('logout listener anchor not found')
text = text.replace(logout_anchor, settings_listener + logout_anchor, 1)
logout_show = '    show(clientWorkspace, false);\n    show(emptyWorkspace, true);'
logout_repl = "    show(clientWorkspace, false);\n    show(settingsWorkspace, false);\n    settingsBtn.classList.remove('active');\n    show(emptyWorkspace, true);"
if logout_show not in text:
    raise SystemExit('logout show anchor not found')
path.write_text(text.replace(logout_show, logout_repl, 1), encoding='utf-8')

path = Path('backend/public/professional-portal.css')
css = path.read_text(encoding='utf-8')
marker = '/* professional-settings */'
if marker not in css:
    css += r'''

/* professional-settings */
.settings-nav-button{width:100%;margin-top:14px;border:1px solid var(--border,#dbe5f3);background:#fff;color:#173b70;border-radius:14px;padding:12px 14px;font:inherit;font-weight:800;text-align:left;cursor:pointer}
.settings-nav-button:hover,.settings-nav-button.active{background:#edf5ff;border-color:#9fc4f7;color:#1769e0}
.settings-header{margin-bottom:16px}
.settings-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:18px;align-items:start}
.settings-card{margin:0}
.settings-access-card{grid-column:1/-1}
.settings-form{display:grid;gap:13px;margin-top:12px}
.settings-form label{display:grid;gap:6px;font-weight:800;color:#173b70}
.settings-form input{width:100%;box-sizing:border-box;border:1px solid #cfdced;background:#f8fbff;border-radius:12px;padding:12px 13px;font:inherit;color:#15335f}
.settings-form input[readonly]{background:#f1f4f8;color:#687a94}
.settings-two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.settings-form h4{margin:8px 0 0;color:#173b70}
.switch-row{display:flex!important;align-items:center;justify-content:space-between;gap:16px;border:1px solid #dbe5f3;border-radius:13px;padding:12px 13px;background:#fff}
.switch-row span{display:grid;gap:2px}.switch-row small{font-weight:500;color:#70839f}.switch-row input{width:20px;height:20px;flex:0 0 auto}
.settings-links{display:grid;gap:10px;margin-top:10px}.settings-links a{font-weight:800;color:#1769e0}
.settings-link-button{display:inline-flex;text-decoration:none;margin-top:10px}
@media(max-width:850px){.settings-grid{grid-template-columns:1fr}.settings-access-card{grid-column:auto}.settings-two-col{grid-template-columns:1fr}}
'''
    path.write_text(css, encoding='utf-8')
