import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
let queue=Promise.resolve();
async function acquire(){let unlock;const previous=queue;queue=new Promise(r=>unlock=r);await previous;return unlock;}
async function query(sql,values){const r=await db.query(sql,values);return {...r,rowCount:r.rows.length||r.affectedRows||0};}
pool.query=async(sql,values)=>{const release=await acquire();try{return await query(sql,values);}finally{release();}};
pool.connect=async()=>{let unlock=await acquire();const release=()=>{unlock?.();unlock=null;};return {query:async(s,v)=>{const r=await query(s,v);if(/^(COMMIT|ROLLBACK)$/i.test(s.trim()))release();return r;},release,on(){}};};

const {app}=await import('../dist/app.js');
const server=app.listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}/api`;
async function api(path,{token,body,method=body?'POST':'GET',status=200}={}){
 const response=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ } ),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);
 return data;
}

await test('account deletion revokes only access granted by the deleted parent',async()=>{
 const father=await api('/auth/register',{body:{displayName:'Padre Test',email:'delete-father@example.test',password:'Password.1',confirmPassword:'Password.1',role:'father',familyName:'Famiglia Delete'},status:201});
 const mother=await api('/auth/register',{body:{displayName:'Madre Test',email:'delete-mother@example.test',password:'Password.1',confirmPassword:'Password.1',role:'mother'},status:201});
 await api('/family/join',{token:mother.token,body:{inviteCode:father.user.family.inviteCode}});
 await api('/auth/me',{token:father.token});
 await api('/auth/me',{token:mother.token});

 const familyId=father.user.family.id;
 const professionalId=randomUUID();
 const invitationId=randomUUID();
 const fatherGrantId=randomUUID();
 const motherGrantId=randomUUID();

 await db.query(`INSERT INTO professional_users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)`,[professionalId,'avvocato@example.test','not-used-in-this-test','Avv. Test']);
 await db.query(`INSERT INTO professional_invitations(id,family_id,invited_by_user_id,invite_email,token_hash,scopes,expires_at) VALUES($1,$2,$3,$4,$5,ARRAY['calendar']::text[],NOW()+INTERVAL '7 days')`,[invitationId,familyId,father.user.id,'pending-lawyer@example.test','test-token-hash']);
 await db.query(`INSERT INTO professional_access_grants(id,professional_id,family_id,granted_by_user_id,scopes) VALUES($1,$2,$3,$4,ARRAY['calendar']::text[])`,[fatherGrantId,professionalId,familyId,father.user.id]);
 await db.query(`INSERT INTO professional_access_grants(id,professional_id,family_id,granted_by_user_id,scopes) VALUES($1,$2,$3,$4,ARRAY['expenses']::text[])`,[motherGrantId,professionalId,familyId,mother.user.id]);

 const activeSessionsBefore=await db.query(`SELECT count(*)::int AS count FROM duecase_sessions WHERE user_id=$1 AND revoked_at IS NULL`,[father.user.id]);
 assert.ok(activeSessionsBefore.rows[0].count>=1);

 await api('/auth/delete-account',{token:father.token,method:'DELETE'});
 await api('/auth/me',{token:father.token,status:401});

 const sessions=await db.query(`SELECT count(*)::int AS count FROM duecase_sessions WHERE user_id=$1 AND revoked_at IS NULL`,[father.user.id]);
 assert.equal(sessions.rows[0].count,0);

 const invitation=await db.query(`SELECT revoked_at FROM professional_invitations WHERE id=$1`,[invitationId]);
 assert.ok(invitation.rows[0].revoked_at);

 const grants=await db.query(`SELECT id,revoked_at FROM professional_access_grants WHERE id IN ($1,$2)`,[fatherGrantId,motherGrantId]);
 const fatherGrant=grants.rows.find(row=>row.id===fatherGrantId);
 const motherGrant=grants.rows.find(row=>row.id===motherGrantId);
 assert.ok(fatherGrant?.revoked_at);
 assert.equal(motherGrant?.revoked_at,null);

 const audit=await db.query(`SELECT action,details FROM professional_access_audit WHERE actor_parent_user_id=$1 ORDER BY created_at`,[father.user.id]);
 assert.ok(audit.rows.some(row=>row.action==='invitation_revoked'&&row.details?.reason==='parent_account_deleted'));
 assert.ok(audit.rows.some(row=>row.action==='access_revoked'&&row.details?.reason==='parent_account_deleted'));

 const deleted=await db.query(`SELECT first_name,last_name,birth_date,phone,family_id,deleted_at,display_name FROM users WHERE id=$1`,[father.user.id]);
 assert.equal(deleted.rows[0].first_name,null);
 assert.equal(deleted.rows[0].last_name,null);
 assert.equal(deleted.rows[0].family_id,null);
 assert.equal(deleted.rows[0].display_name,'Account eliminato');
 assert.ok(deleted.rows[0].deleted_at);
});

await new Promise(resolve=>server.close(resolve));
await db.close();
await pool.end();
