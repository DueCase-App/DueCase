import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { getAuth, requireAuth } from '../auth.js';
import { transaction } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
const router = Router();
router.use(requireAuth);
router.delete('/delete-account', asyncHandler(async(req,res)=>{
 const auth=getAuth(req);
 await transaction(async client=>{
  const current=await client.query('SELECT id FROM users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',[auth.userId]);
  if(!current.rowCount)throw new ApiError(404,'Account non trovato','ACCOUNT_NOT_FOUND');
  await client.query('DELETE FROM email_challenges WHERE user_id=$1',[auth.userId]);
  await client.query('DELETE FROM otp_requests WHERE user_id=$1',[auth.userId]);
  await client.query('DELETE FROM in_app_notifications WHERE user_id=$1',[auth.userId]);
  // Do not erase the other parent's shared expenses, receipts, agreements or messages.
  await client.query(`UPDATE parents SET display_name='Account eliminato' WHERE id=$1`,[auth.userId]);
  await client.query(`UPDATE users SET email=$2,password_hash=$3,display_name='Account eliminato',
    first_name=NULL,last_name=NULL,birth_date=NULL,tax_code=NULL,phone=NULL,
    expo_push_token=NULL,email_verified_at=NULL,token_version=token_version+1,
    family_id=NULL,deleted_at=clock_timestamp(),updated_at=NOW() WHERE id=$1`,
    [auth.userId,`deleted-${auth.userId}@invalid.example`,randomBytes(48).toString('hex')]);
  // Rotate the invitation so a previously shared code cannot reopen this family.
  if(auth.familyId) await client.query('UPDATE families SET invite_code=$2 WHERE id=$1',[auth.familyId,randomBytes(8).toString('hex').toUpperCase()]);
 });
 res.json({deleted:true,note:'Accesso revocato e profilo personale eliminato. I dati già condivisi nella famiglia restano nello storico, attribuiti ad “Account eliminato”.'});
}));
export default router;
