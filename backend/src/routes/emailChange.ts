import { Router } from 'express';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { requireAuth, getAuth, signAccessToken } from '../auth.js';
import { pool, transaction } from '../db.js';
import { config } from '../config.js';
import { ApiError, asyncHandler } from '../http.js';
import { isEmailConfigured, sendAccountCode } from '../services/emailService.js';
import { rateLimit } from '../services/rateLimit.js';
const router=Router();router.use(requireAuth);
const digest=(user:string,email:string,code:string)=>createHmac('sha256',config.OTP_SECRET??config.JWT_SECRET).update(`email-change|${user}|${email}|${code}`).digest();
router.post('/change-email/request',rateLimit(5,3600000),asyncHandler(async(req,res)=>{
 const a=getAuth(req);const b=z.object({email:z.string().trim().email().transform(v=>v.toLowerCase()),password:z.string().min(1).max(72)}).parse(req.body);
 if(!isEmailConfigured())throw new ApiError(503,'Invio email non ancora configurato.','EMAIL_NOT_CONFIGURED');
 if(b.email===a.email)throw new ApiError(400,'Inserisci un indirizzo diverso da quello attuale.');
 await transaction(async c=>{
  const {rows}=await c.query('SELECT password_hash,token_version FROM users WHERE id=$1 FOR UPDATE',[a.userId]);
  if(rows[0].token_version!==a.tokenVersion)throw new ApiError(401,'Accedi nuovamente.');
  if(!await bcrypt.compare(b.password,rows[0].password_hash))throw new ApiError(400,'Password attuale non corretta.');
  const used=await c.query('SELECT 1 FROM users WHERE lower(email)=$1',[b.email]);if(used.rowCount)throw new ApiError(409,'Questo indirizzo non è disponibile.');
  const code=String(randomInt(100000,1000000));
  await c.query("INSERT INTO duecase_email_changes(user_id,new_email,code_hash,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes') ON CONFLICT(user_id) DO UPDATE SET new_email=$2,code_hash=$3,expires_at=NOW()+INTERVAL '10 minutes',attempts=0,created_at=NOW()",[a.userId,b.email,digest(a.userId,b.email,code).toString('hex')]);
  await sendAccountCode(b.email,code,'verify');
 });res.json({sent:true});
}));
router.post('/change-email/confirm',rateLimit(10,15*60000),asyncHandler(async(req,res)=>{
 const a=getAuth(req);const code=z.string().regex(/^\d{6}$/).parse(req.body.code);
 const result=await transaction(async c=>{
  const u=await c.query('SELECT token_version FROM users WHERE id=$1 FOR UPDATE',[a.userId]);
  if(u.rows[0].token_version!==a.tokenVersion)throw new ApiError(401,'Accedi nuovamente.');
  const r=await c.query('SELECT * FROM duecase_email_changes WHERE user_id=$1 AND expires_at>NOW() FOR UPDATE',[a.userId]);const row=r.rows[0];
  if(!row||row.attempts>=5)return null;
  if(!timingSafeEqual(Buffer.from(row.code_hash,'hex'),digest(a.userId,row.new_email,code))){await c.query('UPDATE duecase_email_changes SET attempts=attempts+1 WHERE user_id=$1',[a.userId]);return null;}
  const used=await c.query('SELECT 1 FROM users WHERE lower(email)=$1',[row.new_email]);if(used.rowCount)throw new ApiError(409,'Questo indirizzo non è disponibile.');
  await c.query('UPDATE users SET email=$2,email_verified_at=NOW(),token_version=token_version+1,expo_push_token=NULL,updated_at=NOW() WHERE id=$1',[a.userId,row.new_email]);
  await c.query('DELETE FROM duecase_email_changes WHERE user_id=$1',[a.userId]);
  await c.query('DELETE FROM email_challenges WHERE user_id=$1',[a.userId]);
  return signAccessToken(a.userId,a.tokenVersion+1);
 });if(!result)throw new ApiError(400,'Codice scaduto o non valido.','INVALID_CODE');res.json({token:result});
}));
export default router;
