(() => {
  'use strict';

  const API_BASE = 'https://duecase-api.onrender.com/api';
  const TOKEN_KEY = 'duecase.professionalToken';
  const inviteToken = new URLSearchParams(location.search).get('token');
  const scopeLabels = {
    calendar: 'Calendario',
    expenses: 'Spese',
    agreements: 'Accordi',
    documents: 'Documenti',
    dossier: 'Dossier',
    messages: 'Messaggi',
  };
  const statusLabels = {
    pending: 'In attesa',
    pending_approval: 'In attesa di approvazione',
    approved: 'Approvato',
    rejected: 'Rifiutato',
    declined: 'Rifiutato (stato storico)',
    changes_requested: 'Modifiche richieste',
    confirmed: 'Confermato',
    declared: 'Pagamento dichiarato',
    paid: 'Rimborsato',
    partially_paid: 'Rimborsato parzialmente',
    to_pay: 'Da rimborsare',
    closed: 'Chiuso',
    disputed: 'Contestato',
    draft: 'Bozza',
    submitted: 'Inviato',
    created: 'Creato',
    updated: 'Modificato',
    uploaded: 'Caricato',
    cancelled: 'Annullato',
    canceled: 'Annullato',
    revoked: 'Revocato',
    active: 'Attivo',
    inactive: 'Non attivo',
  };
  const expenseStatusLabels = {
    pending: 'In attesa',
    pending_approval: 'Da approvare',
    approved: 'Approvata',
    rejected: 'Rifiutata',
    declined: 'Rifiutata (stato storico)',
    confirmed: 'Confermata',
    declared: 'Pagamento dichiarato',
    paid: 'Rimborsata',
    partially_paid: 'Rimborsata parzialmente',
    to_pay: 'Da rimborsare',
    closed: 'Chiusa',
    disputed: 'Contestata',
  };
  const categoryLabels = {
    school: 'Scuola',
    health: 'Salute',
    sport: 'Sport',
    leisure: 'Svago',
    medical: 'Visite mediche',
    vacation: 'Vacanze',
    organization: 'Organizzazione',
    other: 'Altro',
  };

  function statusLabel(value) {
    if (!value) return '—';
    return statusLabels[value] || String(value).replaceAll('_', ' ');
  }
  function expenseStatusLabel(value) {
    if (!value) return '—';
    return expenseStatusLabels[value] || statusLabel(value);
  }
  function categoryLabel(value) {
    if (!value) return '—';
    return categoryLabels[value] || String(value);
  }
  function safeFilenamePart(value) {
    return String(value || 'Famiglia').trim().replace(/[^a-zA-Z0-9À-ÿ_-]+/g, '_').replace(/^_+|_+$/g, '') || 'Famiglia';
  }
  function dossierFilename(format) {
    const family = safeFilenamePart(activeGrant?.familyName || 'Famiglia');
    const day = new Date().toISOString().slice(0, 10);
    return `Dossier_DueCase_${family}_${day}.${format}`;
  }

  const $ = (id) => document.getElementById(id);
  const authView = $('authView');
  const portalView = $('portalView');
  const loginForm = $('loginForm');
  const registerForm = $('registerForm');
  const inviteSummary = $('inviteSummary');
  const logoutBtn = $('logoutBtn');
  const clientList = $('clientList');
  const scopeTabs = $('scopeTabs');
  const contentArea = $('contentArea');
  const emptyWorkspace = $('emptyWorkspace');
  const clientWorkspace = $('clientWorkspace');
  const statusBox = $('statusBox');
  const settingsBtn = $('settingsBtn');
  const settingsWorkspace = $('settingsWorkspace');

  let professional = null;
  let clients = [];
  let activeGrant = null;
  let activeSection = 'overview';
  let invitation = null;

  function token() { return sessionStorage.getItem(TOKEN_KEY); }
  function setToken(value) { if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); }
  function clearInviteUrl() {
    if (location.pathname !== '/professionisti' || location.search) {
      history.replaceState({ duecasePortal: true }, '', '/professionisti/');
    }
  }
  function show(el, visible = true) { el.classList.toggle('hidden', !visible); }
  function text(el, value) { el.textContent = value == null ? '' : String(value); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function elem(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = String(content);
    return node;
  }
  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
  }
  function formatDay(value) {
    if (!value) return '—';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[3]}/${match[2]}/${match[1]}` : formatDate(value);
  }
  function euro(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' }) : `${value ?? '—'} €`;
  }
  function role(value) { return value === 'father' ? 'Papà' : value === 'mother' ? 'Mamma' : 'Genitore'; }
  function setStatus(message, error = false) {
    text(statusBox, message);
    statusBox.classList.toggle('error', error);
    show(statusBox, Boolean(message));
    if (message) statusBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function busy(form, value) {
    form.querySelectorAll('button,input').forEach((control) => { control.disabled = value; });
  }

  async function api(path, options = {}, auth = false) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    if (auth) {
      const current = token();
      if (!current) throw new Error('Sessione scaduta. Accedi nuovamente.');
      headers.Authorization = `Bearer ${current}`;
    }
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const type = response.headers.get('content-type') || '';
    const payload = type.includes('application/json') ? await response.json().catch(() => null) : await response.text().catch(() => '');
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && payload.error ? payload.error : `Operazione non riuscita (${response.status})`;
      const error = new Error(message);
      error.code = payload && typeof payload === 'object' ? payload.code : undefined;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function downloadAuthenticated(path, filename) {
    const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Download non riuscito (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'DueCase-documento';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function showAuth(mode = 'login') {
    show(authView, true);
    show(portalView, false);
    show(logoutBtn, false);
    show(loginForm, mode === 'login');
    show(registerForm, mode === 'register');
  }

  function showPortal() {
    show(authView, false);
    show(portalView, true);
    show(logoutBtn, true);
    text($('professionalName'), professional?.displayName || 'Professionista');
    text($('professionalEmail'), professional?.email || '');
  }

  async function loadInvitation() {
    if (!inviteToken) return null;
    invitation = await api(`/professional-auth/invitation?token=${encodeURIComponent(inviteToken)}`);
    clear(inviteSummary);
    const title = elem('strong', '', `Invito di ${invitation.inviterName || 'un genitore DueCase'}`);
    const detail = elem('p', 'fineprint', `Pratica: ${invitation.familyName}. Sezioni autorizzate: ${invitation.scopes.map((scope) => scopeLabels[scope] || scope).join(', ')}. Scadenza: ${formatDate(invitation.expiresAt)}.`);
    inviteSummary.append(title, detail);
    show(inviteSummary, true);
    $('loginEmail').value = invitation.email;
    $('loginEmail').readOnly = true;
    showAuth(invitation.existingAccount ? 'login' : 'register');
    return invitation;
  }

  async function acceptPendingInvitation() {
  if (!inviteToken || !token()) return false;
  try {
    await api('/professional-auth/accept-invitation', { method: 'POST', body: JSON.stringify({ token: inviteToken }) }, true);
    clearInviteUrl();
    invitation = null;
    setStatus('Invito accettato. La pratica è stata aggiunta al tuo account.');
    return true;
  } catch (error) {
    if (error?.code === 'PROFESSIONAL_INVITE_INVALID' || error?.status === 410) {
      clearInviteUrl();
      invitation = null;
      setStatus('Questo invito è già stato utilizzato, è scaduto o è stato revocato. Il tuo account professionista resta attivo.');
      return false;
    }
    throw error;
  }
}

async function loadSession() {
  if (!token()) return false;
  try {
    professional = await api('/professional-auth/me', {}, true);
  } catch (error) {
    setToken(null);
    professional = null;
    setStatus(error.message || 'Sessione scaduta. Accedi nuovamente.', true);
    return false;
  }

  if (inviteToken) {
    try {
      await acceptPendingInvitation();
    } catch (error) {
      setStatus(error.message || 'Impossibile accettare questo invito.', true);
      clearInviteUrl();
    }
  }

  try {
    await loadClients();
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      setToken(null);
      professional = null;
      setStatus('Sessione scaduta. Accedi nuovamente.', true);
      return false;
    }
    showPortal();
    setStatus(error.message || 'Impossibile caricare le pratiche autorizzate.', true);
    return true;
  }

  showPortal();
  return true;
}

async function loadClients() {
    clients = await api('/professional/clients', {}, true);
    clear(clientList);
    clients.forEach((client) => {
      const button = elem('button', 'client-button');
      button.type = 'button';
      button.dataset.grantId = client.grantId;
      button.append(elem('strong', '', client.familyName), elem('small', '', client.grantedByName ? `Autorizzato da ${client.grantedByName}` : 'Accesso autorizzato'));
      button.addEventListener('click', () => selectClient(client));
      clientList.appendChild(button);
    });
    if (!clients.length) clientList.appendChild(elem('p', 'fineprint', 'Nessuna pratica attiva.'));
    if (activeGrant) {
      const refreshed = clients.find((client) => client.grantId === activeGrant.grantId);
      if (refreshed) await selectClient(refreshed, activeSection);
    }
  }

  async function selectClient(client, section = 'overview') {
    activeGrant = client;
    activeSection = section;
    [...clientList.querySelectorAll('.client-button')].forEach((button) => button.classList.toggle('active', button.dataset.grantId === client.grantId));
    show(settingsWorkspace, false);
    settingsBtn.classList.remove('active');
    show(emptyWorkspace, false);
    show(clientWorkspace, true);
    text($('familyName'), client.familyName);
    text($('grantMeta'), client.grantedByName ? `Accesso concesso da ${client.grantedByName}` : 'Accesso autorizzato dal genitore');
    renderTabs();
    await loadSection(section);
  }

  function renderTabs() {
    clear(scopeTabs);
    const sections = ['overview', ...activeGrant.scopes];
    sections.forEach((section) => {
      const button = elem('button', `tab${activeSection === section ? ' active' : ''}`, section === 'overview' ? 'Riepilogo' : scopeLabels[section] || section);
      button.type = 'button';
      button.setAttribute('role', 'tab');
      button.addEventListener('click', async () => {
        activeSection = section;
        renderTabs();
        await loadSection(section);
      });
      scopeTabs.appendChild(button);
    });
  }

  function panel(title) {
    const wrapper = elem('section', 'content-panel');
    wrapper.appendChild(elem('h3', '', title));
    return wrapper;
  }
  function record(title, meta, body) {
    const card = elem('article', 'record');
    const head = elem('div', 'record-head');
    head.appendChild(elem('strong', '', title || 'Elemento'));
    if (meta) head.appendChild(elem('span', 'meta', meta));
    card.appendChild(head);
    if (body) card.appendChild(elem('p', '', body));
    return card;
  }
  function empty(message) { return elem('p', 'muted', message); }

  async function loadSection(section) {
    clear(contentArea);
    contentArea.appendChild(elem('div', 'muted', 'Caricamento…'));
    try {
      if (section === 'overview') return renderOverview(await api(`/professional/clients/${activeGrant.grantId}/overview`, {}, true));
      if (section === 'calendar') return renderCalendar(await api(`/professional/clients/${activeGrant.grantId}/calendar`, {}, true));
      if (section === 'expenses') return renderExpenses(await api(`/professional/clients/${activeGrant.grantId}/expenses`, {}, true));
      if (section === 'agreements') return renderAgreements(await api(`/professional/clients/${activeGrant.grantId}/agreements`, {}, true));
      if (section === 'documents') return renderDocuments(await api(`/professional/clients/${activeGrant.grantId}/documents`, {}, true));
      if (section === 'messages') return renderMessages(await api(`/professional/clients/${activeGrant.grantId}/messages?limit=500`, {}, true));
      if (section === 'dossier') return renderDossier();
      clear(contentArea);
      contentArea.appendChild(empty('Sezione non disponibile.'));
    } catch (error) {
      clear(contentArea);
      const box = panel('Sezione non disponibile');
      box.appendChild(empty(error.message || 'Impossibile caricare i dati.'));
      contentArea.appendChild(box);
    }
  }

  function renderOverview(data) {
    clear(contentArea);
    const summary = panel('Permessi e contenuti');
    const chips = elem('div', 'chips');
    data.scopes.forEach((scope) => chips.appendChild(elem('span', 'chip', scopeLabels[scope] || scope)));
    summary.appendChild(chips);
    const counts = elem('div', 'trust-grid');
    Object.entries(data.counts || {}).forEach(([scope, count]) => {
      const box = elem('div');
      box.append(elem('strong', '', String(count)), elem('span', '', scopeLabels[scope] || scope));
      counts.appendChild(box);
    });
    summary.appendChild(counts);
    contentArea.appendChild(summary);

    const childrenPanel = panel('Figli collegati alla pratica');
    const list = elem('div', 'record-list');
    (data.children || []).forEach((child) => list.appendChild(record(child.displayName, child.birthDate ? `Nascita: ${formatDay(child.birthDate)}` : 'Data di nascita non indicata')));
    if (!data.children?.length) list.appendChild(empty('Nessun figlio presente nella pratica.'));
    childrenPanel.appendChild(list);
    contentArea.appendChild(childrenPanel);
  }

  function renderCalendar(data) {
    clear(contentArea);
    const eventsPanel = panel('Eventi calendario');
    const list = elem('div', 'record-list');
    (data.events || []).forEach((item) => {
      const card = record(item.title, `${formatDate(item.startsAt)} · ${statusLabel(item.status)}`, item.notes || '');
      const meta = [item.childName, item.location, item.createdByName ? `Inserito da ${item.createdByName}` : ''].filter(Boolean).join(' · ');
      if (meta) card.appendChild(elem('div', 'meta', meta));
      list.appendChild(card);
    });
    if (!data.events?.length) list.appendChild(empty('Nessun evento.'));
    eventsPanel.appendChild(list);
    contentArea.appendChild(eventsPanel);

    const requests = panel('Richieste di scambio e variazioni');
    const reqList = elem('div', 'record-list');
    (data.swapRequests || []).forEach((item) => reqList.appendChild(record(`Scambio ${formatDay(item.targetDate)} → ${formatDay(item.proposedDate)}`, `${statusLabel(item.status)} · ${role(item.requestedByRole)}`, item.notes || '')));
    (data.custodyExceptions || []).forEach((item) => reqList.appendChild(record(`${item.childName || 'Figlio/a'} · ${formatDay(item.custodyDate)}`, `${statusLabel(item.status)} · ${role(item.custodianRole)}`, item.notes || '')));
    if (!reqList.children.length) reqList.appendChild(empty('Nessuna richiesta.'));
    requests.appendChild(reqList);
    contentArea.appendChild(requests);
  }

  function renderExpenses(items) {
    clear(contentArea);
    const p = panel('Spese e rimborsi');
    const list = elem('div', 'record-list');
    items.forEach((item) => {
      const card = record(item.title, `${formatDay(item.expenseDate)} · ${euro(item.amount)} · ${expenseStatusLabel(item.status)}`, item.notes || '');
      const meta = [categoryLabel(item.category), item.paidByName ? `Anticipata da ${item.paidByName}` : '', item.children?.length ? `Figli: ${item.children.join(', ')}` : ''].filter(Boolean).join(' · ');
      if (meta) card.appendChild(elem('div', 'meta', meta));
      list.appendChild(card);
    });
    if (!items.length) list.appendChild(empty('Nessuna spesa.'));
    p.appendChild(list);
    contentArea.appendChild(p);
  }

  function renderAgreements(items) {
    clear(contentArea);
    const p = panel('Accordi');
    const list = elem('div', 'record-list');
    items.forEach((item) => {
      const card = record(item.title, `${statusLabel(item.status)} · ${item.createdByName || role(item.createdByRole)} · ${formatDate(item.createdAt)}`, item.body);
      if (item.responseNote) card.appendChild(elem('p', 'meta', `Nota di risposta: ${item.responseNote}`));
      list.appendChild(card);
    });
    if (!items.length) list.appendChild(empty('Nessun accordo.'));
    p.appendChild(list);
    contentArea.appendChild(p);
  }

  function renderDocuments(items) {
    clear(contentArea);
    const p = panel('Documenti condivisi');
    const list = elem('div', 'record-list');
    items.forEach((item) => {
      const card = record(item.title, `${categoryLabel(item.category)} · ${formatDate(item.createdAt)}`, item.description || '');
      const meta = [item.filename, item.uploadedByName ? `Caricato da ${item.uploadedByName}` : '', item.children?.length ? `Figli: ${item.children.join(', ')}` : ''].filter(Boolean).join(' · ');
      if (meta) card.appendChild(elem('div', 'meta', meta));
      const actions = elem('div', 'action-row');
      const open = elem('button', 'secondary', 'Apri documento');
      open.type = 'button';
      open.addEventListener('click', () => downloadAuthenticated(`/professional/clients/${activeGrant.grantId}/documents/${item.id}/file`, item.filename || 'documento').catch((error) => setStatus(error.message, true)));
      actions.appendChild(open);
      card.appendChild(actions);
      list.appendChild(card);
    });
    if (!items.length) list.appendChild(empty('Nessun documento.'));
    p.appendChild(list);
    contentArea.appendChild(p);
  }

  function renderMessages(items) {
    clear(contentArea);
    const p = panel('Messaggi condivisi');
    p.appendChild(elem('p', 'muted', 'Questa sezione è visibile perché il genitore ha autorizzato esplicitamente l’accesso ai messaggi.'));
    const list = elem('div', 'record-list');
    items.forEach((item) => {
      const card = record(item.senderName || role(item.senderRole), `${role(item.senderRole)} · ${formatDate(item.createdAt)}`, item.text || '');
      if (item.attachments?.length) {
        const actions = elem('div', 'action-row');
        item.attachments.forEach((attachment) => {
          const open = elem('button', 'secondary', `Allegato: ${attachment.filename}`);
          open.type = 'button';
          open.addEventListener('click', () => downloadAuthenticated(`/professional/clients/${activeGrant.grantId}/messages/${item.id}/attachments/${attachment.id}/file`, attachment.filename).catch((error) => setStatus(error.message, true)));
          actions.appendChild(open);
        });
        card.appendChild(actions);
      }
      list.appendChild(card);
    });
    if (!items.length) list.appendChild(empty('Nessun messaggio.'));
    p.appendChild(list);
    contentArea.appendChild(p);
  }

  function renderDossier() {
    clear(contentArea);
    const p = panel('Dossier della pratica');
    p.appendChild(elem('p', 'muted', 'L’esportazione contiene solo le sezioni che il genitore ti ha autorizzato a consultare. Il download viene registrato nello storico degli accessi professionali. Il dossier è un riepilogo dei dati presenti nel servizio: non è una certificazione e non attribuisce automaticamente valore legale o probatorio predeterminato.')); 
    const actions = elem('div', 'action-row');
    ['pdf', 'zip', 'csv'].forEach((format) => {
      const button = elem('button', format === 'pdf' ? 'primary' : 'secondary', `Scarica ${format.toUpperCase()}`);
      button.type = 'button';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await downloadAuthenticated(`/professional/clients/${activeGrant.grantId}/dossier?format=${format}`, dossierFilename(format));
        } catch (error) { setStatus(error.message, true); }
        finally { button.disabled = false; }
      });
      actions.appendChild(button);
    });
    p.appendChild(actions);
    contentArea.appendChild(p);
  }

  async function renderSettings() {
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
            <label>Email attuale<input id="settingsEmail" type="email" readonly></label>
            <div class="email-change-box">
              <label>Nuova email<input id="settingsNewEmail" type="email" autocomplete="email" placeholder="nuovo@studio.it"></label>
              <button id="requestEmailChangeBtn" class="secondary" type="button">Invia codice di verifica</button>
              <div id="emailChangeConfirmBox" class="hidden">
                <label>Codice ricevuto via email<input id="settingsEmailCode" inputmode="numeric" maxlength="6" placeholder="000000"></label>
                <button id="confirmEmailChangeBtn" class="primary" type="button">Conferma nuova email</button>
              </div>
              <p class="fineprint">Il codice viene inviato al nuovo indirizzo. L’indirizzo attuale riceve anche un avviso di sicurezza.</p>
            </div>
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

    $('requestEmailChangeBtn').addEventListener('click', async () => {
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

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    busy(loginForm, true);
    setStatus('');
    try {
      const result = await api('/professional-auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: $('loginEmail').value.trim(), password: $('loginPassword').value }),
      });
      setToken(result.token);
      professional = result.professional;
      if (inviteToken) {
        try {
          await acceptPendingInvitation();
        } catch (inviteError) {
          setStatus(inviteError.message || 'Impossibile accettare questo invito.', true);
          clearInviteUrl();
        }
      }
      await loadClients();
      showPortal();
    } catch (error) { setStatus(error.message || 'Accesso non riuscito.', true); }
    finally { busy(loginForm, false); }
  });

  registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!inviteToken) return setStatus('Invito mancante.', true);
    const password = $('registerPassword').value;
    const confirmPassword = $('registerConfirmPassword').value;
    if (password !== confirmPassword) return setStatus('Le password non coincidono.', true);
    busy(registerForm, true);
    setStatus('');
    try {
      const result = await api('/professional-auth/register', {
        method: 'POST',
        body: JSON.stringify({
          token: inviteToken,
          firstName: $('registerFirstName').value.trim(),
          lastName: $('registerLastName').value.trim(),
          organization: $('registerOrganization').value.trim() || undefined,
          password,
          confirmPassword,
        }),
      });
      setToken(result.token);
      professional = result.professional;
      clearInviteUrl();
      await loadClients();
      showPortal();
      setStatus('Account professionista creato e invito accettato.');
    } catch (error) { setStatus(error.message || 'Registrazione non riuscita.', true); }
    finally { busy(registerForm, false); }
  });

  settingsBtn.addEventListener('click', () => {
    renderSettings().catch((error) => setStatus(error.message || 'Impossibile aprire le impostazioni.', true));
  });

  logoutBtn.addEventListener('click', () => {
    setToken(null);
    professional = null;
    clients = [];
    activeGrant = null;
    activeSection = 'overview';
    clear(clientList);
    clear(contentArea);
    show(clientWorkspace, false);
    show(settingsWorkspace, false);
    settingsBtn.classList.remove('active');
    show(emptyWorkspace, true);
    showAuth('login');
    setStatus('Sessione chiusa.');
  });

  (async function init() {
    try {
      if (token() && await loadSession()) return;
      if (inviteToken) await loadInvitation();
      else showAuth('login');
    } catch (error) {
      showAuth('login');
      setStatus(error.message || 'Invito non disponibile.', true);
    }
  })();
})();
