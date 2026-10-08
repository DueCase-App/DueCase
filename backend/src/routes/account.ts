import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { passwordSchema } from '../services/validation.js';
import { rateLimit } from '../services/rateLimit.js';
import { getAuth, requireAuth, signAccessToken } from '../auth.js';
import { pool, transaction } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
const router = Router();
router.use(requireAuth);

const preferencesSchema = z.object({messages:z.boolean(),agreements:z.boolean(),expenses:z.boolean(),calendar:z.boolean(),other:z.boolean(),previewContent:z.boolean().default(false)}).strict();
const defaults={messages:true,agreements:true,expenses:true,calendar:true,other:true,previewContent:false};
router.get('/preferences',asyncHandler(async(req,res)=>{
 const {rows}=await pool.query('SELECT notification_preferences FROM users WHERE id=$1',[getAuth(req).userId]);
 res.json({...defaults,...rows[0].notification_preferences});
}));
router.put('/preferences',asyncHandler(async(req,res)=>{
 const value=preferencesSchema.parse(req.body);
 await pool.query('UPDATE users SET notification_preferences=$2::jsonb,updated_at=NOW() WHERE id=$1',[getAuth(req).userId,JSON.stringify(value)]);
 res.json(value);
}));
router.put('/profile',asyncHandler(async(req,res)=>{
 const body=z.object({firstName:z.string().trim().min(2).max(80),lastName:z.string().trim().min(2).max(80),phone:z.string().trim().max(32).refine(v=>!v||v.replace(/\D/g,'').length>=6,'Numero non valido')}).strict().parse(req.body);
 const name=`${body.firstName} ${body.lastName}`;
 await transaction(async c=>{
  await c.query('UPDATE users SET first_name=$2,last_name=$3,display_name=$4,phone=$5,updated_at=NOW() WHERE id=$1',[getAuth(req).userId,body.firstName,body.lastName,name,body.phone||null]);
  await c.query('UPDATE parents SET display_name=$2 WHERE id=$1',[getAuth(req).userId,name]);
 });res.json({ok:true});
}));
router.post('/change-password',rateLimit(5,15*60*1000),asyncHandler(async(req,res)=>{
 const body=z.object({currentPassword:z.string().min(1).max(72),password:passwordSchema,confirmPassword:z.string()}).refine(v=>v.password===v.confirmPassword,'Le password non coincidono.').parse(req.body);
 const auth=getAuth(req);
 const version=await transaction(async c=>{
  const {rows}=await c.query('SELECT password_hash,token_version FROM users WHERE id=$1 FOR UPDATE',[auth.userId]);
  if(rows[0].token_version!==auth.tokenVersion)throw new ApiError(401,'Accedi nuovamente.','INVALID_TOKEN');
  if(!await bcrypt.compare(body.currentPassword,rows[0].password_hash))throw new ApiError(400,'La password attuale non è corretta.','WRONG_PASSWORD');
  const hash=await bcrypt.hash(body.password,12);
  await c.query('UPDATE users SET password_hash=$2,expo_push_token=NULL,token_version=token_version+1,updated_at=NOW() WHERE id=$1',[auth.userId,hash]);
  await c.query("DELETE FROM email_challenges WHERE user_id=$1 AND purpose='reset'",[auth.userId]);
  return rows[0].token_version+1;
 });res.json({token:signAccessToken(auth.userId,version)});
}));
router.post('/logout-other-devices',asyncHandler(async(req,res)=>{
 const auth=getAuth(req);
 const {rows}=await pool.query('UPDATE users SET expo_push_token=NULL,token_version=token_version+1 WHERE id=$1 AND token_version=$2 RETURNING token_version',[auth.userId,auth.tokenVersion]);
 if(!rows[0])throw new ApiError(401,'Accedi nuovamente.','INVALID_TOKEN');
 res.json({token:signAccessToken(auth.userId,rows[0].token_version)});
}));
router.get('/family-members',asyncHandler(async(req,res)=>{
 const auth=getAuth(req);
 if(!auth.familyId){res.json([]);return;}
 const {rows}=await pool.query('SELECT id,display_name AS "displayName",role FROM users WHERE family_id=$1 AND deleted_at IS NULL ORDER BY created_at',[auth.familyId]);res.json(rows);
}));
router.get('/export-profile',asyncHandler(async(req,res)=>{
 const a=getAuth(req);
 const {rows}=await pool.query('SELECT notification_preferences FROM users WHERE id=$1',[a.userId]);
 res.json({exportedAt:new Date().toISOString(),profile:{id:a.userId,email:a.email,firstName:a.firstName,lastName:a.lastName,displayName:a.displayName,birthDate:a.birthDate,phone:a.phone,role:a.role,emailVerifiedAt:a.emailVerifiedAt},notificationPreferences:{...defaults,...rows[0].notification_preferences}});
}));

router.delete('/delete-account', asyncHandler(async(req,res)=>{
 const auth=getAuth(req);
 await transaction(async client=>{
  const current=await client.query('SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[auth.userId]);
  if(!current.rowCount)throw new ApiError(404,'Account non trovato','ACCOUNT_NOT_FOUND');

  await client.query('DELETE FROM duecase_message_blocks WHERE user_id=$1',[auth.userId]);
  await client.query('DELETE FROM duecase_email_changes WHERE user_id=$1',[auth.userId]);
  await client.query('DELETE FROM email_challenges WHERE user_id=$1',[auth.userId]);
  await client.query('DELETE FROM otp_requests WHERE user_id=$1',[auth.userId]);
  await client.query('DELETE FROM in_app_notifications WHERE user_id=$1',[auth.userId]);
  await client.query('UPDATE duecase_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=$1 AND revoked_at IS NULL',[auth.userId]);

  // Un account eliminato non può continuare a concedere accessi a professionisti.
  // Gli eventuali grant concessi autonomamente dall'altro genitore restano invariati.
  await client.query(`
    WITH revoked AS (
      UPDATE professional_invitations
         SET revoked_at=NOW(),updated_at=NOW()
       WHERE invited_by_user_id=$1
         AND revoked_at IS NULL
         AND accepted_at IS NULL
       RETURNING id,family_id
    )
    INSERT INTO professional_access_audit(id,family_id,actor_parent_user_id,action,details)
    SELECT gen_random_uuid(),family_id,$1,'invitation_revoked',
           jsonb_build_object('invitationId',id,'reason','parent_account_deleted')
      FROM revoked`,[auth.userId]);

  await client.query(`
    WITH revoked AS (
      UPDATE professional_access_grants
         SET revoked_at=NOW(),updated_at=NOW()
       WHERE granted_by_user_id=$1
         AND revoked_at IS NULL
       RETURNING id,professional_id,family_id
    )
    INSERT INTO professional_access_audit(id,professional_id,grant_id,family_id,actor_parent_user_id,action,details)
    SELECT gen_random_uuid(),professional_id,id,family_id,$1,'access_revoked',
           jsonb_build_object('reason','parent_account_deleted')
      FROM revoked`,[auth.userId]);

  // Do not erase the other parent's shared expenses, receipts, agreements or messages here:
  // their retention is governed by the shared-history policy and must remain explicit.
  await client.query(`UPDATE parents SET display_name='Account eliminato' WHERE id=$1`,[auth.userId]);
  await client.query(`UPDATE users SET email=$2,password_hash=$3,display_name='Account eliminato',
    first_name=NULL,last_name=NULL,birth_date=NULL,phone=NULL,
    expo_push_token=NULL,email_verified_at=NULL,token_version=token_version+1,
    family_id=NULL,deleted_at=clock_timestamp(),updated_at=NOW() WHERE id=$1`,
    [auth.userId,`deleted-${auth.userId}@invalid.example`,randomBytes(48).toString('hex')]);

  // Rotate and clear the pending family invitation so an old link cannot be reused.
  if(auth.familyId) await client.query(`UPDATE families
     SET invite_code=$2,invite_email=NULL,invite_sent_at=NULL,invite_expires_at=NULL
     WHERE id=$1`,[auth.familyId,randomBytes(8).toString('hex').toUpperCase()]);
 });
 res.json({deleted:true,note:'Accesso revocato e profilo personale eliminato. Sessioni e autorizzazioni professionali concesse da questo account sono state revocate. I dati già condivisi nella famiglia restano nello storico secondo la policy applicabile, attribuiti ad “Account eliminato”.'});
}));
router.get('/sessions',asyncHandler(async(req,res)=>{
 const a=getAuth(req);const {rows}=await pool.query('SELECT id,device_label AS device,created_at AS "createdAt",last_seen_at AS "lastSeenAt",(id=$3) AS current FROM duecase_sessions WHERE user_id=$1 AND token_version=$2 AND revoked_at IS NULL AND expires_at>NOW() ORDER BY last_seen_at DESC',[a.userId,a.tokenVersion,a.sessionId]);res.json(rows);
}));
router.delete('/sessions/:id',asyncHandler(async(req,res)=>{
 const a=getAuth(req);const id=z.string().regex(/^[a-f0-9]{64}$/).parse(req.params.id);
 if(id===a.sessionId)throw new ApiError(400,'Per questo dispositivo usa Esci dall’account.');
 await pool.query('UPDATE duecase_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2',[id,a.userId]);res.json({revoked:true});
}));
router.post('/logout',asyncHandler(async(req,res)=>{
 const a=getAuth(req);await pool.query('UPDATE duecase_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2',[a.sessionId,a.userId]);res.json({ok:true});
}));
export default router;
