const fs=require('fs');
const path=require('path');
function patch(file,from,to){const s=fs.readFileSync(file,'utf8');if(!s.includes(from))throw new Error(`Missing pattern in ${file}`);fs.writeFileSync(file,s.replace(from,to));console.log('updated',file);}

// Keep registration acceptance versions aligned with the revised legal documents.
patch('frontend/src/context/AuthContext.tsx',"const LEGAL_DOCUMENT_VERSION = '2026-10-07';","const LEGAL_DOCUMENT_VERSION = '2026-10-08';");
patch('backend/src/routes/legalRegistrationGuard.ts',"export const CURRENT_LEGAL_VERSION = '2026-10-07';","export const CURRENT_LEGAL_VERSION = '2026-10-08';");

// App wording: document actions without implying a qualified signature or automatic legal effect.
patch('frontend/src/screens/ExpensesScreen.tsx',"Inserisci il codice di sicurezza a 6 cifre inviato per firmare l'approvazione di questa spesa straordinaria.","Inserisci il codice di sicurezza a 6 cifre inviato per confermare l'approvazione di questa spesa straordinaria. La verifica registra l'operazione nell'app, ma non costituisce una firma elettronica qualificata e non attribuisce automaticamente valore legale.");
patch('frontend/src/screens/ExpensesScreen.tsx','Conferma e Firma','Conferma approvazione');
patch('frontend/src/screens/DossierScreen.tsx','Questa anteprima mostra le ultime 120 attività. Usa l’esportazione per consultare tutto lo storico disponibile. Il dossier non è un documento certificato.','Questa anteprima mostra le ultime 120 attività. Usa l’esportazione per consultare tutto lo storico disponibile. Il dossier è un riepilogo documentale dei dati presenti in DueCase: non è un documento certificato e non attribuisce automaticamente valore legale o probatorio predeterminato. L’eventuale utilizzo esterno dipende dalla normativa applicabile e dalla valutazione dell’autorità o del professionista competente.');
patch('frontend/src/screens/AgreementsScreen.tsx','Proposte, risposte e storico tra Mamma e Papà.','Proposte, risposte e storico tra Mamma e Papà. Le accettazioni registrano azioni nell’app e non sostituiscono provvedimenti giudiziari o accordi formalizzati nelle forme richieste dalla legge.');

// Put the same qualification inside exported dossiers, not only in the UI.
patch('backend/src/services/legalPdfService.ts','Documento riepilogativo dei dati disponibili nell’app. Non è una certificazione, una firma digitale o una marca temporale qualificata. I controlli SHA-256 permettono il confronto tecnico dei file esportati; non dimostrano la veridicità dei fatti dichiarati.','Documento riepilogativo dei dati disponibili nell’app. Non è una certificazione, una firma digitale o una marca temporale qualificata e non attribuisce automaticamente valore legale o probatorio predeterminato. I controlli SHA-256 permettono il confronto tecnico dei file esportati; non dimostrano identità, data certa o veridicità dei fatti dichiarati. L’eventuale efficacia giuridica o probatoria dipende dalla normativa applicabile e dalla valutazione dell’autorità competente.');
patch('backend/src/services/dossierService.ts',"const limits='Le date e ore sono in Europe/Rome. Le permanenze sono pianificate, non presenze accertate. I pagamenti dichiarati non sono ricevute di incasso. Il documento non certifica identità, veridicità o data certa. Gli hash sono controlli tecnici, non firme digitali o marche temporali qualificate.';","const limits='Le date e ore sono in Europe/Rome. Le permanenze sono pianificate, non presenze accertate. I pagamenti dichiarati non sono ricevute di incasso. Il dossier è un riepilogo dei dati presenti nel servizio: non certifica identità, veridicità o data certa e non attribuisce automaticamente valore legale o probatorio predeterminato. Gli hash sono controlli tecnici, non firme digitali o marche temporali qualificate. L’eventuale efficacia giuridica o probatoria dipende dalla normativa applicabile e dalla valutazione dell’autorità competente.';");

// New legal document version defaults for newly created accounts.
const migration='backend/sql/025_legal_document_version_2026_10_08.sql';
if(!fs.existsSync(migration))fs.writeFileSync(migration,"ALTER TABLE users\n  ALTER COLUMN privacy_policy_version SET DEFAULT '2026-10-08',\n  ALTER COLUMN terms_version SET DEFAULT '2026-10-08';\n");

// Remove the old personal repository path from every public HTML page.
for(const name of fs.readdirSync('website')){
  if(!name.endsWith('.html'))continue;
  const file=path.join('website',name);
  const before=fs.readFileSync(file,'utf8');
  const after=before.replaceAll('https://raw.githubusercontent.com/tecnico-elios/DueCase/main/','https://raw.githubusercontent.com/DueCase-App/DueCase/main/');
  if(after!==before){fs.writeFileSync(file,after);console.log('updated branding',file);}
}

// Make the public home page explicit too.
patch('website/index.html','Documenti, accordi, spese e storico possono essere raccolti nel Dossier. Il genitore può inoltre invitare il proprio avvocato o professionista scegliendo esattamente cosa rendere visibile.','Documenti, accordi, spese e storico possono essere raccolti nel Dossier. Il genitore può inoltre invitare il proprio avvocato o professionista scegliendo esattamente cosa rendere visibile. Il Dossier organizza i dati presenti nel servizio ma non è una certificazione e non attribuisce automaticamente valore legale o probatorio predeterminato.');
patch('website/index.html',"No. DueCase è uno strumento organizzativo e documentale. Non sostituisce provvedimenti, accordi, consulenza legale o decisioni dell'autorità giudiziaria.","No. DueCase è uno strumento organizzativo e documentale. Non sostituisce provvedimenti, accordi formalizzati nelle forme richieste dalla legge, consulenza legale o decisioni dell'autorità giudiziaria. OTP, approvazioni, cronologie, dossier ed esportazioni non acquistano automaticamente valore legale o probatorio predeterminato.");

console.log('legal consistency patch complete');
