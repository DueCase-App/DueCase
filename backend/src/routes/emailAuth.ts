import { Router } from 'express';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { requireAuth, getAuth } from '../auth.js';
import { pool } from '../db.js';
import { config } from '../config.js';
import { ApiError, asyncHandler } from '../http.js';
import { isEmailConfigured, sendAccountCode } from '../services/emailService.js';
import { passwordSchema } from '../services/validation.js';
const router = Router();
const email = z.string().trim().email().transform(v => v.toLowerCase());
const hash = (id: string, code: string) => createHmac('sha256', config.OTP_SECRET ?? config.JWT_SECRET).update(`${id}|${code}`).digest('hex');
router.get('/email-status', requireAuth, asyncHandler(async (req,res) => {
 const { rows } = await pool.query('SELECT email_verified_at FROM users WHERE id=$1',[getAuth(req).userId]);
 res.json({ configured:isEmailConfigured(), verified:Boolean(rows[0]?.email_verified_at), required:config.EMAIL_VERIFICATION_REQUIRED });
}));
async function issue(userId: string, address: string, purpose: 'verify'|'reset') {
 if (!isEmailConfigured()) throw new ApiError(503,'Invio email non ancora configurato.','EMAIL_NOT_CONFIGURED');
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[userId]);
  const recent=await client.query("SELECT 1 FROM email_challenges WHERE user_id=$1 AND created_at > NOW()-INTERVAL '1 minute'",[userId]);
  if(recent.rowCount) throw new ApiError(429,'Attendi un minuto prima di richiedere un nuovo codice.','CODE_RATE_LIMIT');
  const id=randomUUID(), code=String(randomInt(100000,1000000));
  await client.query('UPDATE email_challenges SET consumed_at=NOW() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL',[userId,purpose]);
  await client.query("INSERT INTO email_challenges(id,user_id,purpose,code_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '10 minutes')",[id,userId,purpose,hash(id,code)]);
  await sendAccountCode(address,code,purpose);
  await client.query('COMMIT');
 } catch(e) {await client.query('ROLLBACK');throw e;} finally {client.release();}
}
router.post('/verify-email/request',requireAuth,asyncHandler(async(req,res)=>{
 const auth=getAuth(req);await issue(auth.userId,auth.email,'verify');res.json({sent:true});
}));
router.post('/password-reset/request',asyncHandler(async(req,res)=>{
 if(!isEmailConfigured()) throw new ApiError(503,'Invio email non ancora configurato.','EMAIL_NOT_CONFIGURED');
 const address=email.parse(req.body.email);
 const {rows}=await pool.query('SELECT id FROM users WHERE email=$1',[address]);
 if(rows[0]) {try {await issue(rows[0].id,address,'reset');} catch(e) {if(!(e instanceof ApiError && e.status===429)) throw e;}}
 res.json({message:'Se l’indirizzo è registrato, riceverai un codice.'});
}));
async function consume(userId:string,purpose:'verify'|'reset',code:string,password?:string) {
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const {rows}=await client.query("SELECT * FROM email_challenges WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[userId,purpose]);
  const challenge=rows[0];
  if(!challenge || challenge.attempts>=5) throw new ApiError(400,'Codice scaduto o non valido.','INVALID_CODE');
  const valid=timingSafeEqual(Buffer.from(challenge.code_hash,'hex'),Buffer.from(hash(challenge.id,code),'hex'));
  if(!valid) {
   await client.query('UPDATE email_challenges SET attempts=attempts+1 WHERE id=$1',[challenge.id]);
   await client.query('COMMIT');throw new ApiError(400,'Codice non valido.','INVALID_CODE');
  }
  await client.query('UPDATE email_challenges SET consumed_at=NOW() WHERE id=$1',[challenge.id]);
  if(purpose==='verify') await client.query('UPDATE users SET email_verified_at=NOW() WHERE id=$1',[userId]);
  else await client.query('UPDATE users SET password_hash=$2, token_version=token_version+1 WHERE id=$1',[userId,await bcrypt.hash(password!,12)]);
  await client.query('COMMIT');
 } catch(e){await client.query('ROLLBACK');throw e;} finally{client.release();}
}
router.post('/verify-email/confirm',requireAuth,asyncHandler(async(req,res)=>{
 await consume(getAuth(req).userId,'verify',z.string().regex(/^\d{6}$/).parse(req.body.code));res.json({verified:true});
}));
router.post('/password-reset/confirm',asyncHandler(async(req,res)=>{
 const input=z.object({email,code:z.string().regex(/^\d{6}$/),password:passwordSchema,confirmPassword:z.string()}).refine(v=>v.password===v.confirmPassword,'Le password non coincidono.').parse(req.body);
 const {rows}=await pool.query('SELECT id FROM users WHERE email=$1',[input.email]);
 if(!rows[0]) throw new ApiError(400,'Codice scaduto o non valido.','INVALID_CODE');
 await consume(rows[0].id,'reset',input.code,input.password);res.json({reset:true});
}));
export default router;
