import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
export type LegalPdfInput={reportId:string;generatedAt:string;familyName:string;generatedBy:string;verification:string;reportHash:string;sections:Array<{title:string;lines:string[]}>};
/** Unicode font is embedded; unsupported symbols are made explicit, originals remain in the ZIP. */
function printable(s:string){return [...s].map(c=>{const n=c.codePointAt(0)!;return n<=0x52f||(n>=0x1e00&&n<=0x1eff)||(n>=0x2000&&n<=0x206f)||(n>=0x20a0&&n<=0x20cf)||(n>=0x2190&&n<=0x21ff)||(n>=0x2600&&n<=0x26ff)?c:`[U+${n.toString(16).toUpperCase()}]`;}).join('');}
export async function createLegalReportPdf(input:LegalPdfInput):Promise<Buffer>{
 const doc=new PDFDocument({size:'A4',margin:48,bufferPages:true,info:{Title:'DueCase - Dossier della famiglia',Author:'DueCase',CreationDate:new Date(input.generatedAt)}});
 const chunks:Buffer[]=[];const complete=new Promise<Buffer>((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 doc.registerFont('DueCase',fileURLToPath(new URL('../../assets/DueCaseSans.ttf',import.meta.url)));doc.font('DueCase');
 const text=(s:string,size=10)=>doc.fontSize(size).fillColor('#18334F').text(printable(s),{lineGap:3});
 text('DUECASE',12);doc.moveDown(.4);text('Dossier della famiglia',23);doc.moveDown(.6);
 text(`Famiglia: ${input.familyName}`,12);text(`Generato da: ${input.generatedBy}`);
 text(`Generato il: ${new Date(input.generatedAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'})} (Europe/Rome)`);
 text(`Identificativo: ${input.reportId}`,8);doc.moveDown();
 text('Documento riepilogativo dei dati disponibili nell’app. Non è una certificazione, una firma digitale o una marca temporale qualificata. I controlli SHA-256 permettono il confronto tecnico dei file esportati; non dimostrano la veridicità dei fatti dichiarati.',9);doc.moveDown();
 text('Indice delle sezioni',13);input.sections.forEach((s,i)=>text(`${i+1}. ${s.title}`,9));
 doc.addPage();
 for(const [index,section] of input.sections.entries()){
  if(doc.y>680)doc.addPage();
  doc.moveDown(.5);text(`${index+1}. ${section.title}`,13);doc.moveDown(.5);
  if(!section.lines.length)text('Nessun dato presente.',10);
  for(const line of section.lines){text(line);doc.moveDown(.6);}
 }
 if(doc.y>650)doc.addPage();doc.moveDown();text('Riferimenti tecnici dell’esportazione',13);text(`SHA-256 dei dati: ${input.reportHash}`,8);text(`Stringa di verifica: ${input.verification}`,8);
 const range=doc.bufferedPageRange();for(let p=range.start;p<range.start+range.count;p++){
  doc.switchToPage(p);doc.save();doc.font('DueCase').fontSize(8).fillColor('#65758B').text(`DueCase · ${input.reportId.slice(0,8)} · Pagina ${p+1} di ${range.count}`,48,810,{lineBreak:false});doc.restore();
 }
 doc.end();return complete;
}
