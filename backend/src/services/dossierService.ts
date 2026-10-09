import { createHash, randomUUID } from 'node:crypto';
import { zipSync } from 'fflate';
import { z } from 'zod';
import { pool } from '../db.js';
import { ApiError } from '../http.js';
import { dateSchema } from './validation.js';
import { createLegalReportPdf } from './legalPdfService.js';
import { messageDataHash, reportDataHash, verificationString } from './integrityService.js';
import type { AuthContext } from '../auth.js';

const topics=['messages','agreements','expenses','calendar','documents','history'] as const;
export const dossierQuery=z.object({from:dateSchema.optional(),to:dateSchema.optional(),childId:z.string().uuid().optional(),sections:z.string().optional(),format:z.enum(['pdf','zip','csv']).default('pdf')}).superRefine((v,c)=>{
 if(v.from&&v.to&&v.from>v.to)c.addIssue({code:'custom',message:'La data iniziale deve precedere quella finale.'});
 if(v.sections&&v.sections.split(',').some(s=>!topics.includes(s as typeof topics[number])))c.addIssue({code:'custom',message:'Sezione non valida.'});
});
type Row=Record<string,any>;
type DossierBuildOptions={includeChildProfiles?:boolean};
const labels:Record<string,string>={
 messages:'Messaggi',agreements:'Accordi',expenses:'Spese',calendar:'Calendario',documents:'Documenti',history:'Storico attività',
 father:'Papà',mother:'Mamma',other:'Altro',school:'Scuola',health:'Salute',sport:'Sport',leisure:'Svago',medical:'Visite mediche',vacation:'Vacanze',organization:'Organizzazione',expense:'Spesa',event:'Evento',agreement:'Accordo',document:'Documento',message:'Messaggio',payment:'Rimborso',child:'Scheda figlio',permanence:'Permanenza',custody_exception:'Cambio permanenza',
 pending:'In attesa',pending_approval:'In attesa di approvazione',approved:'Approvato',rejected:'Rifiutato',declined:'Rifiutato',changes_requested:'Modifiche richieste',confirmed:'Confermato',declared:'Dichiarato, ricezione non confermata',paid:'Rimborsato',partially_paid:'Rimborsato parzialmente',to_pay:'Da rimborsare',closed:'Chiuso',disputed:'Rimborso contestato',draft:'Bozza',submitted:'Inviato',created:'Creato',updated:'Modificato',uploaded:'Caricato',otp_verified:'Conferma tramite codice email',payment_declared:'Rimborso dichiarato',payment_confirmed:'Ricezione rimborso confermata',
 id:'Identificativo',title:'Titolo',body:'Proposta',text:'Testo',notes:'Note',status:'Stato',category:'Categoria',amount:'Importo',expense_date:'Data spesa',father_percentage:'Quota Papà (%)',mother_percentage:'Quota Mamma (%)',created_at:'Registrato il',updated_at:'Aggiornato il',reviewed_at:'Risposta il',reviewed_by:'Risposta di',reviewed_by_user_id:'Risposta di',response_note:'Nota di risposta',created_by:'Autore',created_by_user_id:'Autore',paid_by_user_id:'Anticipato da',requested_by:'Richiedente',actor_user_id:'Autore',sender_id:'Mittente',sender_role:'Ruolo mittente',data_hash:'Impronta SHA-256',read_at:'Lettura registrata il',starts_at:'Inizio',ends_at:'Fine',event_type:'Tipo evento',location:'Luogo',requires_approval:'Richiede approvazione',description:'Descrizione',filename:'Nome originale',mime_type:'Tipo file',file_size_bytes:'Dimensione (byte)',uploaded_by_user_id:'Caricato da',paid_at:'Data pagamento dichiarata',confirmed_at:'Ricezione confermata il',confirmed_by_user_id:'Ricezione confermata da',expense_id:'Spesa collegata',message_id:'Messaggio collegato',agreement_id:'Accordo collegato',child_id:'Figlio',childIds:'Figli',display_name:'Nome',birth_date:'Data di nascita',school_name:'Scuola',class_name:'Classe',sports:'Sport',extracurricular:'Attività extrascolastiche',useful_info:'Informazioni utili',authorizations:'Autorizzazioni',shared_notes:'Note condivise',entity_type:'Tipo attività',entity_id:'Elemento collegato',action:'Azione',details:'Dettagli',snapshot:'Versione registrata',custody_date:'Giorno pianificato',custodian_role:'Genitore pianificato',overnight:'Pernottamento pianificato',target_date:'Giorno originale',proposed_date:'Giorno proposto',approval_otp_verified_at:'Codice email verificato il',is_extraordinary:'Spesa straordinaria',weekday:'Giorno della settimana',anchor_saturday:'Sabato di riferimento',first_weekend_role:'Primo weekend',second_weekend_role:'Weekend successivo',source:'Origine',
};
export function itDate(v:unknown):string {
 if(!v)return 'Non registrata';const str=v instanceof Date?v.toISOString():String(v);
 if(/^\d{4}-\d{2}-\d{2}$/.test(str))return str.split('-').reverse().join('/');
 const d=new Date(str);return Number.isNaN(d.getTime())?'Data non disponibile':d.toLocaleString('it-IT',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
export function csvCell(v:unknown):string {let s=String(v??'');if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
Object.assign(labels,{familyId:'Identificativo famiglia',createdAt:'Registrato il',updatedAt:'Aggiornato il',reviewedAt:'Risposta il',createdBy:'Autore',reviewedBy:'Risposta di',responseNote:'Nota di risposta',createdByRole:'Ruolo autore',reviewedByRole:'Ruolo rispondente',role:'Ruolo',hasAttachment:'Con allegato',note:'Nota',isExtraordinary:'Spesa straordinaria',fatherPercentage:'Quota Papà (%)',motherPercentage:'Quota Mamma (%)',paidAt:'Data pagamento dichiarata',payment_by_user_id:'Rimborso effettuato da',expenseId:'Spesa collegata',expenseStatus:'Stato spesa',expense_payment:'Rimborso',sent:'Inviato',custodianRole:'Genitore pianificato',custodyDate:'Giorno pianificato',childId:'Figlio',anchorSaturday:'Sabato di riferimento',firstWeekendRole:'Primo weekend',secondWeekendRole:'Weekend successivo',alternating_weekends_updated:'Weekend alternati modificati',weekly_pattern_updated:'Schema settimanale modificato',pattern_updated:'Schema settimanale modificato',requested:'Richiesto',deleted:'Eliminato',filename:'Nome originale',name:'Nome',birthDate:'Data di nascita',school:'Scuola',className:'Classe',usefulInfo:'Informazioni utili',sharedNotes:'Note condivise',dataHash:'Impronta SHA-256',fileSizeBytes:'Dimensione (byte)',senderId:'Mittente',senderRole:'Ruolo mittente',fileUrl:'Riferimento allegato',receiptUrl:'Riferimento ricevuta',readAt:'Lettura registrata il',startsAt:'Inizio',endsAt:'Fine',targetDate:'Giorno originale',proposedDate:'Giorno proposto'});
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
export async function buildDossier(auth:AuthContext & {familyId:string},input:z.infer<typeof dossierQuery>,options:DossierBuildOptions={}){
 const id=randomUUID(),generatedAt=new Date().toISOString();
 const selected=new Set(input.sections?.split(',')??topics);
 const includeChildProfiles=options.includeChildProfiles??true;
 const c=await pool.connect();
 const sections:Array<{title:string;rows:Row[]}>=[];
 const archive:Record<string,Uint8Array>={};
 const attachments:Row[]=[];
 const names=new Map<string,string>();
 const warnings:string[]=[];
 const values=[auth.familyId,input.from??null,input.to??null,input.childId??null];
 // Local civil dates define the inclusive interval, including daylight-saving transitions.
 const period=(field:string)=>`($2::date IS NULL OR ${field} >= ($2::date::timestamp AT TIME ZONE 'Europe/Rome')) AND ($3::date IS NULL OR ${field} < (($3::date+1)::timestamp AT TIME ZONE 'Europe/Rome'))`;
 const dayPeriod=(field:string)=>`($2::date IS NULL OR ${field} >= $2::date) AND ($3::date IS NULL OR ${field} <= $3::date)`;
 const sharedChild=`($4::uuid IS NULL OR TRUE)`;
 async function rows(sql:string,params:any[]=values):Promise<Row[]>{const result=await c.query(sql,params);if(result.rows.length>5000)throw new ApiError(413,'Troppi dati: restringi il periodo o le sezioni. Nessun dato è stato omesso.','EXPORT_TOO_LARGE');return result.rows;}
 async function group(title:string,sql:string,params:any[]=values){const data=await rows(sql,params);sections.push({title,rows:data});return data;}
 let expenses:Row[]=[],messages:Row[]=[],documents:Row[]=[],payments:Row[]=[];
 try{
  await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await c.query("SET LOCAL statement_timeout = '30s'");
  for(const r of await rows('SELECT id,display_name FROM parents WHERE family_id=$1',[auth.familyId]))names.set(r.id,r.display_name);
  const children=await rows('SELECT id,display_name,birth_date::text,school AS school_name,class_name,sports,extracurricular,useful_info,authorizations,shared_notes FROM children WHERE family_id=$1 ORDER BY display_name,id',[auth.familyId]);
  for(const r of children)names.set(r.id,r.display_name);
  if(input.childId&&!children.some(r=>r.id===input.childId))throw new ApiError(404,'Figlio non trovato nella famiglia.','CHILD_NOT_FOUND');
  if(includeChildProfiles)sections.push({title:'Schede dei figli (dati attuali)',rows:children.filter(r=>!input.childId||r.id===input.childId)});
  if(selected.has('expenses')){
   expenses=await group('Spese: tutti gli stati',`SELECT e.id,e.title,e.amount::text,e.category,e.expense_date::text,e.status,e.notes,e.paid_by_user_id,e.father_percentage::text,e.mother_percentage::text,e.reviewed_by_user_id,e.reviewed_at,e.approval_otp_verified_at,e.created_at,e.updated_at FROM expenses e WHERE e.family_id=$1 AND ${dayPeriod('e.expense_date')} AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM expense_children ec WHERE ec.family_id=$1 AND ec.expense_id=e.id AND ec.child_id=$4) OR NOT EXISTS(SELECT 1 FROM expense_children ec WHERE ec.family_id=$1 AND ec.expense_id=e.id)) ORDER BY e.expense_date,e.created_at,e.id LIMIT 5001`);
   payments=await group('Rimborsi delle spese selezionate: dichiarazioni ed esiti',`SELECT id,expense_id,paid_by_user_id AS payment_by_user_id,amount::text,status,paid_at,confirmed_at,confirmed_by_user_id,notes,created_at FROM expense_payments WHERE family_id=$1 AND expense_id=ANY($2::uuid[]) ORDER BY created_at,id LIMIT 5001`,[auth.familyId,expenses.map(r=>r.id)]);
  }
  if(selected.has('messages')){
   messages=await group('Conversazioni condivise',`SELECT m.id,m.sender_id,m.sender_role,m.text,m.created_at,m.data_hash,COALESCE((SELECT MIN(read_at) FROM message_read_receipts WHERE family_id=$1 AND message_id=m.id),m.read_at) AS read_at FROM messages m WHERE m.family_id=$1 AND ${period('m.created_at')} AND ${sharedChild} ORDER BY m.created_at,m.id LIMIT 5001`);
   for(const m of messages)if(messageDataHash(m.text,m.sender_id,m.created_at)!==m.data_hash)warnings.push(`Messaggio ${m.id}: impronta non corrispondente, integrità non verificata.`);
  }
  if(selected.has('agreements')){
   const agreements=await group('Accordi condivisi',`SELECT id,title,body,category,status,created_by,created_at,reviewed_by,reviewed_at,response_note FROM family_agreements WHERE family_id=$1 AND ${period('created_at')} AND ${sharedChild} ORDER BY created_at,id LIMIT 5001`);
   await group('Versioni e risposte degli accordi selezionati',`SELECT id,agreement_id,actor_user_id,action,snapshot,created_at FROM family_agreement_history WHERE family_id=$1 AND agreement_id=ANY($2::uuid[]) ORDER BY created_at,id LIMIT 5001`,[auth.familyId,agreements.map(r=>r.id)]);
  }
  if(selected.has('calendar')){
   await group('Eventi pianificati',`SELECT id,title,starts_at,ends_at,status,notes,location,child_id,created_by_user_id,reviewed_by,reviewed_at,response_note FROM family_events WHERE family_id=$1 AND ($2::date IS NULL OR ends_at>=($2::date::timestamp AT TIME ZONE 'Europe/Rome')) AND ($3::date IS NULL OR starts_at<(($3::date+1)::timestamp AT TIME ZONE 'Europe/Rome')) AND ($4::uuid IS NULL OR child_id=$4 OR child_id IS NULL) ORDER BY starts_at,id LIMIT 5001`);
   await group('Richieste di cambio permanenza',`SELECT id,child_id,custody_date::text,custodian_role,overnight,status,notes,requested_by,reviewed_by,reviewed_at,created_at FROM custody_exceptions WHERE family_id=$1 AND ${dayPeriod('custody_date')} AND ($4::uuid IS NULL OR child_id=$4) ORDER BY custody_date,created_at,id LIMIT 5001`);
   await group('Richieste di scambio calendario',`SELECT id,target_date::text,proposed_date::text,status,notes,requested_by,reviewed_by,reviewed_at,created_at FROM swap_requests WHERE family_id=$1 AND ${dayPeriod('target_date')} AND ${sharedChild} ORDER BY created_at,id LIMIT 5001`);
   await group('Schema settimanale attuale (non prova delle permanenze passate)',`SELECT id,child_id,weekday,custodian_role,overnight,notes,updated_at FROM custody_weekly_patterns WHERE family_id=$1 AND ($2::uuid IS NULL OR child_id=$2) ORDER BY child_id,weekday`,[auth.familyId,input.childId??null]);
   await group('Weekend alternati: regola attuale',`SELECT id,child_id,anchor_saturday::text,first_weekend_role,second_weekend_role,overnight,notes,updated_at FROM custody_alternating_weekends WHERE family_id=$1 AND ($2::uuid IS NULL OR child_id=$2) ORDER BY child_id`,[auth.familyId,input.childId??null]);
   await group('Turni pianificati inseriti nel calendario',`SELECT id,child_id,title,starts_at,ends_at,notes,custodian_role FROM custody_turns WHERE family_id=$1 AND ($2::date IS NULL OR ends_at>=($2::date::timestamp AT TIME ZONE 'Europe/Rome')) AND ($3::date IS NULL OR starts_at<(($3::date+1)::timestamp AT TIME ZONE 'Europe/Rome')) AND ($4::uuid IS NULL OR child_id=$4 OR child_id IS NULL) ORDER BY starts_at,id LIMIT 5001`);
  }
  if(selected.has('documents'))documents=await group('Documenti condivisi',`SELECT d.id,d.title,d.description,d.category,d.filename,d.mime_type,d.file_size_bytes,d.uploaded_by_user_id,d.created_at FROM documents d WHERE d.family_id=$1 AND ${period('d.created_at')} AND ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM duecase_document_children dc WHERE dc.family_id=$1 AND dc.document_id=d.id AND dc.child_id=$4) OR NOT EXISTS(SELECT 1 FROM duecase_document_children dc WHERE dc.family_id=$1 AND dc.document_id=d.id)) ORDER BY d.created_at,d.id LIMIT 5001`);
  if(selected.has('history'))await group('Registro cronologico delle attività condivise',`SELECT id,actor_user_id,entity_type,entity_id,action,details,created_at FROM family_activity_history WHERE family_id=$1 AND ${period('created_at')} AND ${sharedChild} ORDER BY created_at,id LIMIT 5001`);
  // Enumerate metadata first; never load unbounded bytea into the API process.
  const sources=[{table:'documents',column:'file_data',filename:'filename',ids:documents.map(r=>r.id),kind:'Documento'}, {table:'expenses',column:'receipt_data',filename:'receipt_filename',ids:expenses.map(r=>r.id),kind:'Ricevuta spesa'},{table:'expense_payments',column:'receipt_data',filename:'receipt_filename',ids:payments.map(r=>r.id),kind:'Contabile rimborso'}];
  let bytes=0;
  async function addFile(meta:Row,table:string,column:string){
   const n=attachments.length+1;const safe=String(meta.filename??'allegato').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'allegato';
   const path=`allegati/${String(n).padStart(4,'0')}-${safe}`;
   if(meta.bytes===null){warnings.push(`${meta.kind} ${meta.id}: originale non disponibile nell'archivio.`);attachments.push({...meta,path:null});return;}
   bytes+=Number(meta.bytes);if(bytes>100*1024*1024)throw new ApiError(413,'Gli allegati superano 100 MB. Esporta un periodo più breve o una sezione alla volta.','EXPORT_TOO_LARGE');
   let hash:string|null=meta.data_hash??null;
   if(input.format==='zip'){
    const file=await c.query(`SELECT ${column} AS data FROM ${table} WHERE family_id=$1 AND id=$2`,[auth.familyId,meta.id]);
    const data=Buffer.from(file.rows[0].data);hash=sha(data);
    if(meta.data_hash&&hash!==meta.data_hash)warnings.push(`Allegato ${meta.id}: impronta non corrispondente, integrità non verificata.`);
    archive[path]=data;
   }
   attachments.push({...meta,path,sha256:hash});
  }
  for(const source of sources){
   const metadata=await rows(`SELECT id,${source.filename} AS filename,octet_length(${source.column}) AS bytes FROM ${source.table} WHERE family_id=$1 AND id=ANY($2::uuid[]) AND (${source.column} IS NOT NULL OR ${source.filename} IS NOT NULL) ORDER BY id`,[auth.familyId,source.ids]);
   for(const m of metadata)await addFile({...m,kind:source.kind},source.table,source.column);
  }
  const messageFiles=await rows('SELECT id,message_id,filename,octet_length(file_data) AS bytes,data_hash FROM duecase_message_attachments WHERE family_id=$1 AND message_id=ANY($2::uuid[]) ORDER BY created_at,id',[auth.familyId,messages.map(r=>r.id)]);
  for(const m of messageFiles)await addFile({...m,kind:'Allegato messaggio'},'duecase_message_attachments','file_data');
  await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 const translate=(v:unknown,key=''):string=>{
  if(v==null)return 'Non registrato';
  if(v instanceof Date||(/(_at|At|Date)$/.test(key)&&v))return itDate(v);
  if(/_date$/.test(key))return itDate(v);
  if(Array.isArray(v))return v.length?v.map(x=>translate(x,key==='childIds'?'child_id':key)).join('; '):'Nessuno';
  if(typeof v==='object')return Object.entries(v).map(([k,x])=>`${labels[k]??k}: ${translate(x,k)}`).join(' | ');
  if(typeof v==='boolean')return v?'Sì':'No';
  if(key==='amount')return Number(v).toLocaleString('it-IT',{style:'currency',currency:'EUR'});
  const s=String(v);if(key==='weekday')return ['','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'][Number(v)]??s;
  if(/percentage|Percentage/.test(key))return Number(v).toLocaleString('it-IT');
  if(key!=='id'&&(/(_id|By|Id)$/.test(key)))return names.get(s)??s;
  if(['category','status','action','entity_type','event_type','role','sender_role','custodian_role','first_weekend_role','second_weekend_role','createdByRole','reviewedByRole','senderRole','custodianRole','firstWeekendRole','secondWeekendRole','expenseStatus'].includes(key))return labels[s]??s;
  return s;
 };
 const scope=`Periodo: ${input.from?itDate(input.from):'dall’inizio'} - ${input.to?itDate(input.to):'fino all’esportazione'}. Figlio: ${input.childId?names.get(input.childId):'tutti'}. Sezioni: ${[...selected].map(s=>labels[s]).join(', ')}.`;
 const limits='Le date e ore sono in Europe/Rome. Le permanenze sono pianificate, non presenze accertate. I pagamenti dichiarati non sono ricevute di incasso. Il dossier è un riepilogo dei dati presenti nel servizio: non certifica identità, veridicità o data certa e non attribuisce automaticamente valore legale o probatorio predeterminato. Gli hash sono controlli tecnici, non firme digitali o marche temporali qualificate. L’eventuale efficacia giuridica o probatoria dipende dalla normativa applicabile e dalla valutazione dell’autorità competente.';
 const filterNote=includeChildProfiles?'Messaggi, accordi e storico generale riguardano la famiglia e restano inclusi anche con filtro figlio; spese, documenti ed eventi senza un figlio associato restano inclusi. Le versioni e i rimborsi delle voci selezionate sono completi, anche se successivi al periodo. Le schede e le regole settimanali rappresentano lo stato attuale.':'Messaggi e accordi riguardano la famiglia e restano inclusi anche con filtro figlio; spese, documenti ed eventi senza un figlio associato restano inclusi. Le schede anagrafiche complete dei figli non sono incluse in questa esportazione professionale.';
 const dataset={schema:'DueCase-dossier-1',id,generatedAt,familyId:auth.familyId,generatedBy:auth.userId,filters:input,sections,attachments,warnings};
 const hash=reportDataHash(JSON.parse(JSON.stringify(dataset)));
 const hiddenHumanKeys=new Set(['id','data_hash']);
 const humanLine=(r:Row,i:number)=>`${i+1}. ${Object.entries(r).filter(([k])=>!hiddenHumanKeys.has(k)).map(([k,v])=>`${labels[k]??k}: ${translate(v,k)}`).join(' | ')}`;
 const summaryLines=[...sections.map(s=>`${s.title}: ${s.rows.length} ${s.rows.length===1?'voce':'voci'}`),`Allegati originali indicizzati: ${attachments.length}.`];
 const technicalLines=sections.flatMap(section=>section.rows.map((r,i)=>{
  const refs:string[]=[];
  if(r.id)refs.push(`ID ${r.id}`);
  if(r.data_hash)refs.push(`SHA-256 ${r.data_hash}`);
  return refs.length?`${section.title} · voce ${i+1}: ${refs.join(' | ')}`:null;
 }).filter((line):line is string=>Boolean(line)));
 const rendered=[
  {title:'Riepilogo del dossier',lines:summaryLines},
  {title:'Ambito e criteri di lettura',lines:[scope,limits,filterNote]},
  ...(warnings.length?[{title:'Avvertenze e anomalie',lines:warnings}]:[]),
  ...sections.map(s=>({title:`${s.title} (${s.rows.length})`,lines:s.rows.map(humanLine)})),
  {title:'Riferimenti tecnici dei record',lines:technicalLines.length?technicalLines:['Nessun riferimento tecnico aggiuntivo.']},
  {title:'Indice degli allegati originali',lines:attachments.map(a=>`${a.kind} ${a.id}${a.message_id?` - messaggio ${a.message_id}`:''}: ${a.filename??'nome non disponibile'} | ${a.path??'originale non disponibile'} | ${a.bytes??0} byte${a.sha256?` | SHA-256 ${a.sha256}`:''}`)}
 ];
 const pdf=await createLegalReportPdf({reportId:id,generatedAt,familyName:auth.familyName??'Famiglia',generatedBy:auth.displayName,verification:verificationString(id,generatedAt,hash),reportHash:hash,sections:rendered});
 const csv='\uFEFF'+[['Identificativo','Data','Descrizione','Categoria','Stato','Importo EUR','Quota Papà %','Quota Mamma %','Anticipato da'],...expenses.map(e=>[e.id,itDate(e.expense_date),e.title,translate(e.category,'category'),translate(e.status,'status'),String(e.amount).replace('.',','),e.father_percentage,e.mother_percentage,translate(e.paid_by_user_id,'paid_by_user_id')])].map(r=>r.map(csvCell).join(';')).join('\r\n');
 const paymentsCsv='\uFEFF'+[['Identificativo','Spesa','Rimborso effettuato da','Data dichiarata','Importo EUR','Stato','Confermato il','Confermato da'],...payments.map(p=>[p.id,p.expense_id,translate(p.payment_by_user_id,'payment_by_user_id'),itDate(p.paid_at),String(p.amount).replace('.',','),translate(p.status,'status'),itDate(p.confirmed_at),translate(p.confirmed_by_user_id,'confirmed_by_user_id')])].map(r=>r.map(csvCell).join(';')).join('\r\n');
 let data:Buffer=pdf;let mime='application/pdf',ext='pdf';
 if(input.format==='csv'){data=Buffer.from(csv);mime='text/csv; charset=utf-8';ext='csv';}
 if(input.format==='zip'){
  archive['Dossier.pdf']=pdf;archive['Spese.csv']=Buffer.from(csv);archive['Rimborsi.csv']=Buffer.from(paymentsCsv);
  archive['Dossier.txt']=Buffer.from(rendered.map(s=>s.title+'\n'+s.lines.join('\n\n')).join('\n\n'));
  archive['Dati-originali.json']=Buffer.from(JSON.stringify(dataset,null,2));
  archive['LEGGIMI.txt']=Buffer.from(scope+'\n\n'+limits+'\n\n'+filterNote+'\n\nDossier.txt conserva il testo Unicode originale. Nel PDF i caratteri non supportati sono indicati con il loro codice Unicode. SHA256SUMS.txt contiene le impronte dei file: un controllo tecnico, non una certificazione.');
  archive['SHA256SUMS.txt']=Buffer.from(Object.entries(archive).map(([path,b])=>`${sha(Buffer.from(b))}  ${path}`).join('\n'));
  data=Buffer.from(zipSync(archive,{level:1}));mime='application/zip';ext='zip';
 }
 await pool.query('INSERT INTO report_exports(id,family_id,generated_by,generated_at,report_hash,verification_string) VALUES($1,$2,$3,$4,$5,$6)',[id,auth.familyId,auth.userId,generatedAt,hash,verificationString(id,generatedAt,hash)]);
 return {data,mime,filename:`DueCase-dossier-${generatedAt.slice(0,10)}-${id.slice(0,8)}.${ext}`};
}
