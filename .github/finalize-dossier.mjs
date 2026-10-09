import fs from 'node:fs';

const path = 'backend/src/services/dossierService.ts';
let source = fs.readFileSync(path, 'utf8');

function replaceRequired(before, after, label) {
  if (!source.includes(before)) throw new Error(`Missing expected block: ${label}`);
  source = source.replace(before, after);
}

replaceRequired("disputed:'Contestato'", "disputed:'Rimborso contestato'", 'disputed label');
replaceRequired(
  "paidAt:'Data pagamento dichiarata',expenseId:'Spesa collegata'",
  "paidAt:'Data pagamento dichiarata',payment_by_user_id:'Rimborso effettuato da',expenseId:'Spesa collegata'",
  'payment payer label',
);
replaceRequired(
  "SELECT id,expense_id,paid_by_user_id,amount::text,status,paid_at,confirmed_at,confirmed_by_user_id,notes,created_at FROM expense_payments",
  "SELECT id,expense_id,paid_by_user_id AS payment_by_user_id,amount::text,status,paid_at,confirmed_at,confirmed_by_user_id,notes,created_at FROM expense_payments",
  'payment payer query',
);

const oldRendered = ` const rendered=[{title:'Ambito e criteri di lettura',lines:[scope,limits,filterNote]},...(warnings.length?[{title:'Avvertenze e anomalie',lines:warnings}]:[]),...sections.map(s=>({title:\`${'${s.title}'} (${'${s.rows.length}'})\`,lines:s.rows.map((r,i)=>\`${'${i+1}'}. ${'${Object.entries(r).map(([k,v])=>`${labels[k]??k}: ${translate(v,k)}`).join(\' | \')}'}\`)})),{title:'Indice degli allegati originali',lines:attachments.map(a=>\`${'${a.kind}'} ${'${a.id}'}${'${a.message_id?` - messaggio ${a.message_id}`:\'\'}'}: ${'${a.filename??\'nome non disponibile\'}'} | ${'${a.path??\'originale non disponibile\'}'} | ${'${a.bytes??0}'} byte${'${a.sha256?` | SHA-256 ${a.sha256}`:\'\'}'}\`)}];\n`;

const newRendered = ` const hiddenHumanKeys=new Set(['id','data_hash']);
 const humanLine=(r:Row,i:number)=>\`${'${i+1}'}. ${'${Object.entries(r).filter(([k])=>!hiddenHumanKeys.has(k)).map(([k,v])=>`${labels[k]??k}: ${translate(v,k)}`).join(\' | \')}'}\`;
 const summaryLines=[...sections.map(s=>\`${'${s.title}'}: ${'${s.rows.length}'} ${'${s.rows.length===1?\'voce\':\'voci\'}'}\`),\`Allegati originali indicizzati: ${'${attachments.length}'}.\`];
 const technicalLines=sections.flatMap(section=>section.rows.map((r,i)=>{
  const refs:string[]=[];
  if(r.id)refs.push(\`ID ${'${r.id}'}\`);
  if(r.data_hash)refs.push(\`SHA-256 ${'${r.data_hash}'}\`);
  return refs.length?\`${'${section.title}'} · voce ${'${i+1}'}: ${'${refs.join(\' | \')}'}\`:null;
 }).filter((line):line is string=>Boolean(line)));
 const rendered=[
  {title:'Riepilogo del dossier',lines:summaryLines},
  {title:'Ambito e criteri di lettura',lines:[scope,limits,filterNote]},
  ...(warnings.length?[{title:'Avvertenze e anomalie',lines:warnings}]:[]),
  ...sections.map(s=>({title:\`${'${s.title}'} (${'${s.rows.length}'})\`,lines:s.rows.map(humanLine)})),
  {title:'Riferimenti tecnici dei record',lines:technicalLines.length?technicalLines:['Nessun riferimento tecnico aggiuntivo.']},
  {title:'Indice degli allegati originali',lines:attachments.map(a=>\`${'${a.kind}'} ${'${a.id}'}${'${a.message_id?` - messaggio ${a.message_id}`:\'\'}'}: ${'${a.filename??\'nome non disponibile\'}'} | ${'${a.path??\'originale non disponibile\'}'} | ${'${a.bytes??0}'} byte${'${a.sha256?` | SHA-256 ${a.sha256}`:\'\'}'}\`)}
 ];\n`;
replaceRequired(oldRendered, newRendered, 'rendered dossier block');

const oldPaymentsCsv = ` const paymentsCsv='\\uFEFF'+[['Identificativo','Spesa','Data dichiarata','Importo EUR','Stato','Confermato il','Confermato da'],...payments.map(p=>[p.id,p.expense_id,itDate(p.paid_at),String(p.amount).replace('.',','),translate(p.status,'status'),itDate(p.confirmed_at),translate(p.confirmed_by_user_id,'confirmed_by_user_id')])].map(r=>r.map(csvCell).join(';')).join('\\r\\n');\n`;
const newPaymentsCsv = ` const paymentsCsv='\\uFEFF'+[['Identificativo','Spesa','Rimborso effettuato da','Data dichiarata','Importo EUR','Stato','Confermato il','Confermato da'],...payments.map(p=>[p.id,p.expense_id,translate(p.payment_by_user_id,'payment_by_user_id'),itDate(p.paid_at),String(p.amount).replace('.',','),translate(p.status,'status'),itDate(p.confirmed_at),translate(p.confirmed_by_user_id,'confirmed_by_user_id')])].map(r=>r.map(csvCell).join(';')).join('\\r\\n');\n`;
replaceRequired(oldPaymentsCsv, newPaymentsCsv, 'payment csv block');

fs.writeFileSync(path, source);
