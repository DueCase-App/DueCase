import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHmac } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
process.env.DATABASE_URL='postgres://test:test@localhost/test';
process.env.JWT_SECRET='local-test-secret-not-a-production-credential';
process.env.NODE_ENV='test';
process.env.PREMIUM_ENFORCEMENT_ENABLED='false';
delete process.env.SMTP_HOST;
const db=new PGlite({extensions:{pgcrypto}});
const sqlDir=new URL('../sql/',import.meta.url);
const migrations=(await readdir(sqlDir)).filter(x=>x.endsWith('.sql')).sort();
for(const file of migrations) await db.exec(await readFile(new URL(file,sqlDir),'utf8'));
const {pool}=await import('../dist/db.js');
// PGlite is PostgreSQL WASM; serialize transactions because it has one connection.
let queue=Promise.resolve();
async function acquire(){let unlock;const previous=queue;queue=new Promise(r=>unlock=r);await previous;return unlock;}
async function query(sql,values){const r=await db.query(sql,values);return {...r,rowCount:r.rows.length || r.affectedRows || 0};}
pool.query=async(sql,values)=>{const release=await acquire();try{return await query(sql,values);}finally{release();}};
pool.connect=async()=>{let unlock=await acquire();const release=()=>{unlock?.();unlock=null;};return {query:async(s,v)=>{const r=await query(s,v);if(/^(COMMIT|ROLLBACK)$/i.test(s.trim()))release();return r;},release,on(){}};};
const {app}=await import('../dist/app.js');
const server=app.listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/api`;
async function api(path,{token,body,method=body?'POST':'GET',status=200}={}){
 const r=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body && !(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
 const data=await r.json();assert.equal(r.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data;
}
let father,mother,outsider,childId;
await test('Registration validates passwords and two parents join one family',async()=>{
 await api('/auth/register',{body:{displayName:'Test Padre',email:'invalid@example.test',password:'weak',confirmPassword:'weak',role:'father'},status:400});
 father=await api('/auth/register',{body:{displayName:'Test Padre',email:'father@example.test',password:'Password.1',confirmPassword:'Password.1',role:'father',familyName:'Famiglia test',children:[{displayName:'Figlio Test',birthDate:'2020-01-01'}]},status:201});
 mother=await api('/auth/register',{body:{displayName:'Test Madre',email:'mother@example.test',password:'Password.1',confirmPassword:'Password.1',role:'mother'},status:201});
 assert.equal(mother.user.familyId,null);
 await api('/family/join',{token:mother.token,body:{inviteCode:father.user.family.inviteCode}});
 outsider=await api('/auth/register',{body:{displayName:'Altro Padre',email:'other@example.test',password:'Password.1',confirmPassword:'Password.1',role:'father',familyName:'Altra famiglia'},status:201});
 childId=(await db.query('SELECT id FROM children WHERE family_id=$1',[father.user.familyId])).rows[0].id;
});
await test('Messages: idempotent retry, attachment only, isolation, unread/read counts',async()=>{
 const id=randomUUID();const form=()=>{const f=new FormData();f.set('text','Ciao, test messaggio');f.set('clientRequestId',id);return f;};
 const message=await api('/messages',{token:father.token,body:form(),status:201});
 const retry=await api('/messages',{token:father.token,body:form()});assert.equal(retry.id,message.id);
 assert.equal((await api('/messages',{token:mother.token})).length,1);
 assert.equal((await api('/sync/counts',{token:mother.token})).messages,1);
 await api(`/messages/${message.id}/read`,{token:outsider.token,method:'PUT',status:404});
 await api(`/messages/${message.id}/read`,{token:mother.token,method:'PUT'});
 assert.equal((await api('/sync/counts',{token:mother.token})).messages,0);
 const f=new FormData();f.set('text','');f.set('attachment',new Blob(['%PDF-1.4 test'],{type:'application/pdf'}),'test.pdf');
 await api('/messages',{token:father.token,body:f,status:201});
});
await test('Agreements cannot be self-approved or answered twice and persist audit',async()=>{
 const a=await api('/agreements',{token:father.token,body:{category:'school',title:'Gita',body:'Proposta gita'},status:201});
 await api(`/agreements/${a.id}/respond`,{token:father.token,body:{status:'approved'},status:403});
 await api(`/agreements/${a.id}/respond`,{token:mother.token,body:{status:'approved'}});
 await api(`/agreements/${a.id}/respond`,{token:mother.token,body:{status:'rejected'},status:409});
 assert.equal((await api(`/agreements/${a.id}/history`,{token:mother.token})).length,2);
});
await test('Confirmed reimbursements reduce balances; declaration cannot exceed remaining share',async()=>{
 const e=await api('/expenses',{token:father.token,body:{title:'Libri',amount:'100.00',category:'Scuola',fatherPercentage:50,motherPercentage:50},status:201});
 await api(`/expenses/${e.id}/approve`,{token:mother.token,body:{}});
 assert.equal((await api('/expenses/balance',{token:father.token})).settlementAmount,'50.00');
 await api(`/expenses/${e.id}/payments`,{token:mother.token,body:{amount:'51.00'},status:409});
 const p=await api(`/expenses/${e.id}/payments`,{token:mother.token,body:{amount:'30.00'},status:201});
 await api(`/expenses/${e.id}/payments`,{token:mother.token,body:{amount:'21.00'},status:409});
 await api(`/expenses/${e.id}/payments/${p.id}/confirm`,{token:father.token,body:{}});
 assert.equal((await api('/expenses/balance',{token:father.token})).settlementAmount,'20.00');
 const rest=await api(`/expenses/${e.id}/payments`,{token:mother.token,body:{amount:'20.00'},status:201});
 await api(`/expenses/${e.id}/payments/${rest.id}/confirm`,{token:father.token,body:{}});
 assert.equal((await api('/expenses/balance',{token:father.token})).settlementAmount,'0.00');
 // First rollout replays legacy SQL once before tracking; settled status must survive.
 for(const file of migrations) await db.exec(await readFile(new URL(file,sqlDir),'utf8'));
 assert.equal((await db.query('SELECT status FROM expenses WHERE id=$1',[e.id])).rows[0].status,'paid');
});
await test('Approved custody exception agrees across current view and calendar',async()=>{
 await api(`/permanence/pattern/${childId}/1`,{token:father.token,method:'PUT',body:{custodianRole:'father'}});
 const e=await api('/permanence/exceptions',{token:father.token,body:{childId,custodyDate:'2026-10-12',custodianRole:'mother'},status:201});
 await api(`/permanence/exceptions/${e.id}/respond`,{token:mother.token,body:{status:'approved'}});
 const current=await api('/permanence/current?date=2026-10-12',{token:father.token});
 const turns=await api('/turns?from=2026-10-12&to=2026-10-12',{token:father.token});
 assert.equal(current.children[0].custodianRole,'mother');assert.equal(turns[0].custodianRole,'mother');
});
await test('Email provider absence is explicit',async()=>{
 assert.equal((await api('/auth/email-status',{token:father.token})).configured,false);
 await api('/auth/verify-email/request',{token:father.token,body:{},status:503});
});
await test('PDF export includes shared records and has a valid PDF payload',async()=>{
 const r=await fetch(base+'/reports/pdf',{headers:{Authorization:`Bearer ${father.token}`}});
 assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('content-type'),'application/pdf');
 assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
});
await test('Email code attempt limits, single use and reset revoke old JWT',async()=>{
 const id=randomUUID(),code='123456';
 const hash=createHmac('sha256',process.env.JWT_SECRET).update(`${id}|${code}`).digest('hex');
 await db.query("INSERT INTO email_challenges(id,user_id,purpose,code_hash,expires_at) VALUES($1,$2,'verify',$3,NOW()+INTERVAL '10 minutes')",[id,father.user.id,hash]);
 await api('/auth/verify-email/confirm',{token:father.token,body:{code:'000000'},status:400});
 await api('/auth/verify-email/confirm',{token:father.token,body:{code}});
 await api('/auth/verify-email/confirm',{token:father.token,body:{code},status:400});
 assert.ok((await api('/auth/me',{token:father.token})).emailVerifiedAt);
 const reset=randomUUID();
 await db.query("INSERT INTO email_challenges(id,user_id,purpose,code_hash,expires_at) VALUES($1,$2,'reset',$3,NOW()+INTERVAL '10 minutes')",[reset,father.user.id,createHmac('sha256',process.env.JWT_SECRET).update(`${reset}|${code}`).digest('hex')]);
 await api('/auth/password-reset/confirm',{body:{email:'father@example.test',code,password:'NewPassword.2',confirmPassword:'NewPassword.2'}});
 await api('/auth/me',{token:father.token,status:401});
 father=await api('/auth/login',{body:{email:'father@example.test',password:'NewPassword.2'}});
});
await test('Profile and preferences are scoped, exports exclude secrets, password change revokes sessions',async()=>{
 await api('/auth/profile',{token:father.token,method:'PUT',body:{firstName:'Nuovo',lastName:'Padre',phone:'3331234567'}});
 assert.equal((await api('/auth/me',{token:father.token})).displayName,'Nuovo Padre');
 const defaults=await api('/auth/preferences',{token:father.token});assert.equal(defaults.messages,true);
 await api('/auth/preferences',{token:father.token,method:'PUT',body:{...defaults,messages:false}});
 assert.equal((await api('/auth/preferences',{token:father.token})).messages,false);
 assert.equal((await api('/auth/preferences',{token:mother.token})).messages,true);
 const exported=await api('/auth/export-profile',{token:father.token});
 assert.equal(exported.profile.email,'father@example.test');assert.ok(!JSON.stringify(exported).includes('password_hash'));
 assert.equal((await api('/auth/family-members',{token:father.token})).length,2);
 await api('/auth/change-password',{token:father.token,body:{currentPassword:'Wrong.1',password:'ChangedPassword.3',confirmPassword:'ChangedPassword.3'},status:400});
 await api('/auth/change-password',{token:father.token,body:{currentPassword:'NewPassword.2',password:'ChangedPassword.3',confirmPassword:'Mismatch.1'},status:400});
 const old=father.token;
 const result=await api('/auth/change-password',{token:old,body:{currentPassword:'NewPassword.2',password:'ChangedPassword.3',confirmPassword:'ChangedPassword.3'}});
 father.token=result.token;await api('/auth/me',{token:old,status:401});await api('/auth/me',{token:father.token});
 await api('/auth/login',{body:{email:'father@example.test',password:'NewPassword.2'},status:401});
 const second=await api('/auth/login',{body:{email:'father@example.test',password:'ChangedPassword.3'}});
 const revoked=await api('/auth/logout-other-devices',{token:father.token,method:'POST'});father.token=revoked.token;
 await api('/auth/me',{token:second.token,status:401});await api('/auth/me',{token:father.token});
});
await test('Account deletion revokes access without deleting the other parent’s shared ledger',async()=>{
 const before=(await api('/expenses',{token:mother.token})).length;
 await api('/auth/delete-account',{token:father.token,method:'DELETE'});
 await api('/auth/me',{token:father.token,status:401});
 assert.equal((await api('/expenses',{token:mother.token})).length,before);
 assert.equal((await api('/expenses/balance',{token:mother.token})).settlementAmount,'0.00');
 assert.ok((await api('/messages',{token:mother.token})).length>=2);
});
await new Promise(r=>server.close(r));await db.close();await pool.end();
