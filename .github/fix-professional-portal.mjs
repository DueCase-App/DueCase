import fs from 'node:fs';

function replaceRequired(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing expected block: ${label}`);
  return source.replace(before, after);
}

const htmlPath = 'backend/public/professional-portal.html';
let html = fs.readFileSync(htmlPath, 'utf8');
html = replaceRequired(html, '<section id="authView" class="auth-layout">', '<section id="authView" class="auth-layout hidden">', 'initial auth visibility');
fs.writeFileSync(htmlPath, html);

const jsPath = 'backend/public/professional-portal.js';
let js = fs.readFileSync(jsPath, 'utf8');

const scopeBlock = `  const scopeLabels = {
    calendar: 'Calendario',
    expenses: 'Spese',
    agreements: 'Accordi',
    documents: 'Documenti',
    dossier: 'Dossier',
    messages: 'Messaggi',
  };`;

const localizedBlock = `${scopeBlock}
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
    return \`Dossier_DueCase_\${family}_\${day}.\${format}\`;
  }`;
js = replaceRequired(js, scopeBlock, localizedBlock, 'localization helpers');

const replacements = [
  ["`${formatDate(item.startsAt)} · ${item.status}`", "`${formatDate(item.startsAt)} · ${statusLabel(item.status)}`", 'event status'],
  ["`${item.status} · ${role(item.requestedByRole)}`", "`${statusLabel(item.status)} · ${role(item.requestedByRole)}`", 'swap status'],
  ["`${item.status} · ${role(item.custodianRole)}`", "`${statusLabel(item.status)} · ${role(item.custodianRole)}`", 'custody status'],
  ["`${formatDay(item.expenseDate)} · ${euro(item.amount)} · ${item.status}`", "`${formatDay(item.expenseDate)} · ${euro(item.amount)} · ${expenseStatusLabel(item.status)}`", 'expense status'],
  ["const meta = [item.category, item.paidByName ? `Anticipata da ${item.paidByName}` : '',", "const meta = [categoryLabel(item.category), item.paidByName ? `Anticipata da ${item.paidByName}` : '',", 'expense category'],
  ["`${item.status} · ${item.createdByName || role(item.createdByRole)} · ${formatDate(item.createdAt)}`", "`${statusLabel(item.status)} · ${item.createdByName || role(item.createdByRole)} · ${formatDate(item.createdAt)}`", 'agreement status'],
  ["`${item.category} · ${formatDate(item.createdAt)}`", "`${categoryLabel(item.category)} · ${formatDate(item.createdAt)}`", 'document category'],
  ["await downloadAuthenticated(`/professional/clients/${activeGrant.grantId}/dossier?format=${format}`, `DueCase-dossier.${format}`);", "await downloadAuthenticated(`/professional/clients/${activeGrant.grantId}/dossier?format=${format}`, dossierFilename(format));", 'professional dossier filename'],
];
for (const [before, after, label] of replacements) js = replaceRequired(js, before, after, label);

fs.writeFileSync(jsPath, js);
