const fs=require('fs');
function read(file){return fs.readFileSync(file,'utf8');}
function write(file,value){fs.writeFileSync(file,value);console.log('updated',file);}
function patch(file,from,to){const s=read(file);if(!s.includes(from))throw new Error(`Missing pattern in ${file}: ${String(from).slice(0,100)}`);write(file,s.replace(from,to));}
function patchAll(file,from,to){const s=read(file);if(!s.includes(from))throw new Error(`Missing pattern in ${file}: ${String(from).slice(0,100)}`);write(file,s.replaceAll(from,to));}

// Remove the tax-code field completely from the current app contract and registration payload.
patch('frontend/src/screens/SignUpScreen.tsx',"      taxCode: undefined as unknown as string,\n",'');
patch('frontend/src/types/models.ts',"export type RegisterInput = { displayName: string; firstName: string; lastName: string; birthDate: string; /** @deprecated tax code is no longer collected */ taxCode?: string; email: string; phone?: string; password: string; confirmPassword: string; role: ParentRole; familyName?: string; children: RegistrationChildInput[]; inviteOtherParent: boolean; };","export type RegisterInput = { displayName: string; firstName: string; lastName: string; birthDate: string; email: string; phone?: string; password: string; confirmPassword: string; role: ParentRole; familyName?: string; children: RegistrationChildInput[]; inviteOtherParent: boolean; };");

patch('backend/src/auth.ts',"  taxCode: string | null;\n",'');
patch('backend/src/auth.ts',"              u.tax_code AS \"taxCode\",\n",'');

patch('backend/src/routes/auth.ts',"const taxCodeSchema = z.string().trim().transform((value) => value.replace(/\\s+/g, '').toUpperCase()).refine(\n  (value) => /^[A-Z0-9]{16}$/.test(value),\n  'Invalid Italian tax code',\n);\n\n",'');
patch('backend/src/routes/auth.ts',"  taxCode: taxCodeSchema.optional(),\n",'');
patch('backend/src/routes/auth.ts',"  taxCode: string | null;\n",'');
patch('backend/src/routes/auth.ts',"    taxCode: row.taxCode,\n",'');
patch('backend/src/routes/auth.ts',"    taxCode: raw.taxCode ?? raw.tax_code,\n",'');
patch('backend/src/routes/auth.ts',"         birth_date,\n         tax_code,\n         phone,","         birth_date,\n         phone,");
patch('backend/src/routes/auth.ts',"       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)","       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)");
patch('backend/src/routes/auth.ts',"                 birth_date::text AS \"birthDate\",\n                 tax_code AS \"taxCode\",\n                 phone,","                 birth_date::text AS \"birthDate\",\n                 phone,");
patch('backend/src/routes/auth.ts',"                 $13::text AS \"familyName\",\n                 $14::text AS \"inviteCode\"","                 $12::text AS \"familyName\",\n                 $13::text AS \"inviteCode\"");
patch('backend/src/routes/auth.ts',"        body.birthDate ?? null,\n        body.taxCode ?? null,\n        body.phone ?? null,","        body.birthDate ?? null,\n        body.phone ?? null,");
patch('backend/src/routes/auth.ts',"      if (constraint.includes('tax_code')) {\n        throw new ApiError(409, 'Questo codice fiscale è già associato a un account', 'TAX_CODE_ALREADY_EXISTS', safeDetails);\n      }\n",'');
patchAll('backend/src/routes/auth.ts',"            u.tax_code AS \"taxCode\",\n",'');
patch('backend/src/routes/auth.ts',"    taxCode: auth.taxCode,\n",'');

patch('backend/src/routes/account.ts',"birthDate:a.birthDate,taxCode:a.taxCode,phone:a.phone","birthDate:a.birthDate,phone:a.phone");
patch('backend/src/routes/account.ts',"    first_name=NULL,last_name=NULL,birth_date=NULL,tax_code=NULL,phone=NULL,","    first_name=NULL,last_name=NULL,birth_date=NULL,phone=NULL,");
patch('backend/src/routes/professionalPortal.ts',"    taxCode: null,\n",'');
patch('backend/tests/account-deletion-security.test.mjs',"SELECT first_name,last_name,birth_date,tax_code,phone,family_id,deleted_at,display_name","SELECT first_name,last_name,birth_date,phone,family_id,deleted_at,display_name");

// Legacy clients may send unknown fields, but the current registration contract no longer names or handles tax codes.
patch('backend/src/routes/legalRegistrationGuard.ts',"\n  // Data minimisation: DueCase no longer collects the Italian tax code.\n  // Ignore legacy clients that still send either naming variant so the value\n  // cannot reach the registration service or be persisted.\n  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {\n    delete req.body.taxCode;\n    delete req.body.tax_code;\n  }\n",'');

// Final database minimisation: the legacy column is no longer needed by current code.
const migration='backend/sql/026_drop_tax_code_column.sql';
if(!fs.existsSync(migration))write(migration,"-- Final data-minimisation cleanup: DueCase no longer collects or exposes the Italian tax code.\nDROP INDEX IF EXISTS idx_users_tax_code_upper;\nALTER TABLE users DROP COLUMN IF EXISTS tax_code;\n");

// Neutralise old migration comments that could suggest guaranteed evidentiary status.
patch('backend/sql/005_legal_messaging_reports.sql','-- DueCase: messaggistica immutabile e registro esportazioni probatorie.','-- DueCase: messaggistica immutabile e registro tecnico delle esportazioni.');
patch('backend/sql/008_premium_legal_controls.sql','-- 3) Le esportazioni probatorie restano append-only ma non devono impedire','-- 3) Le registrazioni tecniche delle esportazioni restano append-only ma non devono impedire');

// Public account deletion and cookie pages must match the current data model and document date.
patch('website/cancellazione-account.html','<strong>Ultimo aggiornamento:</strong> 7 ottobre 2026','<strong>Ultimo aggiornamento:</strong> 8 ottobre 2026');
patch('website/cancellazione-account.html','email operativa, password, nome e cognome, data di nascita, codice fiscale, telefono, token push','email operativa, password, nome e cognome, data di nascita, telefono, token push');
patch('website/cookie.html','<strong>Ultimo aggiornamento:</strong> 7 ottobre 2026','<strong>Ultimo aggiornamento:</strong> 8 ottobre 2026');

// Privacy: do not mention a field that is no longer collected, and distinguish GDPR arts. 9 and 10 correctly.
patch('website/privacy.html',' DueCase non richiede il codice fiscale come dato di registrazione.','');
patch('website/privacy.html',"<h2>5. Dati particolari e contenuti delicati</h2><p>DueCase non richiede come funzione ordinaria categorie particolari di dati ai sensi dell’art. 9 GDPR. Tuttavia documenti, messaggi o note caricati liberamente dagli utenti potrebbero contenere informazioni sanitarie, giudiziarie o comunque molto delicate. Gli utenti devono inserire solo ciò che è realmente necessario e pertinente alla gestione familiare e devono evitare di caricare dati eccedenti o relativi a terzi non coinvolti.</p>","<h2>5. Dati particolari e contenuti delicati</h2><p>DueCase non è progettata per richiedere come dati strutturati categorie particolari di dati personali. Tuttavia documenti, messaggi o note caricati volontariamente dagli utenti possono contenere dati relativi alla salute o altre categorie particolari ai sensi dell’art. 9 GDPR; eventuali contenuti relativi a condanne penali, reati o connesse misure di sicurezza richiedono inoltre la verifica delle condizioni previste dall’art. 10 GDPR e dal diritto applicabile. Gli utenti devono inserire solo informazioni realmente necessarie e pertinenti. Prima del lancio pubblico, i casi d’uso che possono comportare tali dati, le relative condizioni di liceità, i limiti di accesso e i tempi di conservazione devono essere validati nella documentazione definitiva.</p>");

// Professional portal: DueCase branding only and the same legal qualification shown to professionals.
patch('backend/public/professional-portal.html','https://raw.githubusercontent.com/tecnico-elios/DueCase/main/frontend/assets/duecase-logo-hd.png','https://raw.githubusercontent.com/DueCase-App/DueCase/main/frontend/assets/duecase-logo-hd.png');
patch('backend/public/professional-portal.html',"        <p>Accesso separato da Padre e Madre, esclusivamente in sola lettura. Ogni genitore decide quali sezioni condividere e può revocare l’accesso in qualsiasi momento.</p>","        <p>Accesso separato da Padre e Madre, esclusivamente in sola lettura. Ogni genitore decide quali sezioni condividere e può revocare l’accesso in qualsiasi momento.</p>\n        <p class=\"fineprint\">DueCase organizza e rende consultabili i dati registrati nel servizio: non certifica i fatti e non attribuisce automaticamente valore legale o probatorio a contenuti, conferme, dossier o esportazioni.</p>");
patch('backend/public/professional-portal.js',"    p.appendChild(elem('p', 'muted', 'L’esportazione contiene solo le sezioni che il genitore ti ha autorizzato a consultare. Il download viene registrato nello storico degli accessi professionali.'));","    p.appendChild(elem('p', 'muted', 'L’esportazione contiene solo le sezioni che il genitore ti ha autorizzato a consultare. Il download viene registrato nello storico degli accessi professionali. Il dossier è un riepilogo dei dati presenti nel servizio: non è una certificazione e non attribuisce automaticamente valore legale o probatorio predeterminato.')); ");

// Internal legal/store drafts must describe what the current build actually collects.
patch('docs/DATA_RETENTION_POLICY_DRAFT.md','Dati: nome, cognome, email, telefono facoltativo, data di nascita, codice fiscale, ruolo, credenziali, preferenze, sessioni.','Dati: nome, cognome, email, telefono facoltativo, data di nascita, ruolo, credenziali, preferenze, sessioni.');
patch('docs/STORE_PRIVACY_DECLARATIONS.md','Stato: bozza operativa aggiornata al 7 ottobre 2026.','Stato: bozza operativa aggiornata all’8 ottobre 2026.');
patch('docs/STORE_PRIVACY_DECLARATIONS.md','- Codice fiscale\n','');
patch('docs/STORE_PRIVACY_DECLARATIONS.md','- Sensitive Info: valutare per codice fiscale, dati familiari e possibili documenti/annotazioni sanitarie','- Sensitive Info: valutare in base ai contenuti familiari e agli eventuali documenti/annotazioni con dati relativi alla salute o altre categorie sensibili effettivamente consentite dal build finale');

console.log('full privacy and tax-code cleanup complete');
