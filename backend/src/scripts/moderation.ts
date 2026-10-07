/** Operator CLI: protected backend environment only. Never expose this as a public endpoint. */
import { pool } from '../db.js';
import { z } from 'zod';
try{
 const [command,id,state]=process.argv.slice(2);
 if(command==='list'){
  const {rows}=await pool.query("SELECT id,status,created_at FROM duecase_abuse_reports WHERE status<>'resolved' ORDER BY created_at LIMIT 100");console.log(JSON.stringify(rows,null,2));
 }else if(command==='review'){
  const reportId=z.string().uuid().parse(id);const {rows}=await pool.query('SELECT r.id,r.reason,r.status,r.created_at,m.text FROM duecase_abuse_reports r JOIN messages m ON m.id=r.message_id AND m.family_id=r.family_id WHERE r.id=$1',[reportId]);console.log(JSON.stringify(rows,null,2));
 }else if(command==='status'){
  const reportId=z.string().uuid().parse(id);const status=z.enum(['reviewing','resolved']).parse(state);
  const r=await pool.query('UPDATE duecase_abuse_reports SET status=$2 WHERE id=$1',[reportId,status]);console.log(JSON.stringify({updated:r.rowCount}));
 }else throw Error('Uso: moderation list | review ID | status ID reviewing|resolved');
}finally{await pool.end();}
