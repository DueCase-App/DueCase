(() => {
  'use strict';

  const API_BASE = location.hostname.endsWith('onrender.com')
    ? `${location.origin}/api`
    : 'https://api.duecaseununicasquadra.com/api';
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

  let professional = null;
  let clients = [];
  let activeGrant = null;
  let activeSection = 'overview';
  let invitation = null;

  function token() { return sessionStorage.getItem(TOKEN_KEY); }
  function setToken(value) { if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY); }
  function clearInviteUrl() {
    if (location.pathname !== '/professionisti' || location.search) {
      history.replaceState({ duecasePortal: true }, '', '/professionisti');
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
      const card = record(item.title, `${formatDate(item.startsAt)} · ${item.status}`, item.notes || '');
      const meta = [item.childName, item.location, item.createdByName ? `Inserito da ${item.createdByName}` : ''].filter(Boolean).join(' · ');
      if (meta) card.appendChild(elem('div', 'meta', meta));
      list.appendChild(card);
    });
    if (!data.events?.length) list.appendChild(empty('Nessun evento.'));
    eventsPanel.appendChild(list);
    contentArea.appendChild(eventsPanel);

    const requests = panel('Richieste di scambio e variazioni');
    const reqList = elem('div', 'record-list');
    (data.swapRequests || []).forEach((item) => reqList.appendChild(record(`Scambio ${formatDay(item.targetDate)} → ${formatDay(item.proposedDate)}`, `${item.status} · ${role(item.requestedByRole)}`, item.notes || '')));
    (data.custodyExceptions || []).forEach((item) => reqList.appendChild(record(`${item.childName || 'Figlio/a'} · ${formatDay(item.custodyDate)}`, `${item.status} · ${role(item.custodianRole)}`, item.notes || '')));
    if (!reqList.children.length) reqList.appendChild(empty('Nessuna richiesta.'));
    requests.appendChild(reqList);
    contentArea.appendChild(requests);
  }

  function renderExpenses(items) {
    clear(contentArea);
    const p = panel('Spese e rimborsi');
    const list = elem('div', 'record-list');
    items.forEach((item) => {
      const card = record(item.title, `${formatDay(item.expenseDate)} · ${euro(item.amount)} · ${item.status}`, item.notes || '');
      const meta = [item.category, item.paidByName ? `Anticipata da ${item.paidByName}` : '', item.children?.length ? `Figli: ${item.children.join(', ')}` : ''].filter(Boolean).join(' · ');
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
      const card = record(item.title, `${item.status} · ${item.createdByName || role(item.createdByRole)} · ${formatDate(item.createdAt)}`, item.body);
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
      const card = record(item.title, `${item.category} · ${formatDate(item.createdAt)}`, item.description || '');
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
          await downloadAuthenticated(`/professional/clients/${activeGrant.grantId}/dossier?format=${format}`, `DueCase-dossier.${format}`);
        } catch (error) { setStatus(error.message, true); }
        finally { button.disabled = false; }
      });
      actions.appendChild(button);
    });
    p.appendChild(actions);
    contentArea.appendChild(p);
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

  logoutBtn.addEventListener('click', () => {
    setToken(null);
    professional = null;
    clients = [];
    activeGrant = null;
    activeSection = 'overview';
    clear(clientList);
    clear(contentArea);
    show(clientWorkspace, false);
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
