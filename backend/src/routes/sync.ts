import { Router } from 'express';
import { requireAuth, requireFamily } from '../auth.js';
import { asyncHandler } from '../http.js';
import { revision, subscribe, startLiveListener } from '../services/liveService.js';
import { pool } from '../db.js';
const router=Router();router.use(requireAuth);
router.get('/',asyncHandler(async(req,res)=>{
 const auth=requireFamily(req);await startLiveListener();
 const send=()=>{if(!res.writableEnded)res.json({revision:revision(auth.familyId)});};
 if(req.query.since!==revision(auth.familyId)){send();return;}
 let off=()=>{};
 const done=()=>{clearTimeout(timer);off();send();};
 const timer=setTimeout(done,20000);off=subscribe(auth.familyId,done);
 res.on('close',()=>{clearTimeout(timer);off();});
}));
router.get('/counts',asyncHandler(async(req,res)=>{
 const a=requireFamily(req);
 const {rows}=await pool.query(`SELECT
  (SELECT COUNT(*)::int FROM in_app_notifications WHERE user_id=$1 AND read_at IS NULL) AS notifications,
  (SELECT COUNT(*)::int FROM messages m WHERE family_id=$2 AND sender_id<>$1 AND m.read_at IS NULL AND NOT EXISTS(SELECT 1 FROM message_read_receipts r WHERE r.message_id=m.id AND r.reader_id=$1)) AS messages,
  (SELECT COUNT(*)::int FROM family_agreements WHERE family_id=$2 AND status='pending' AND created_by<>$1) AS agreements,
  ((SELECT COUNT(*)::int FROM expenses WHERE family_id=$2 AND status='pending_approval' AND paid_by_user_id<>$1)+(SELECT COUNT(*)::int FROM expense_payments WHERE family_id=$2 AND status='declared' AND paid_by_user_id<>$1)) AS expenses,
  (SELECT COUNT(*)::int FROM custody_exceptions WHERE family_id=$2 AND status='pending' AND requested_by<>$1) AS permanence,
  (SELECT COUNT(*)::int FROM family_events WHERE family_id=$2 AND status='pending' AND created_by_user_id<>$1)+(SELECT COUNT(*)::int FROM swap_requests WHERE family_id=$2 AND status='pending' AND requested_by<>$1) AS calendar`,[a.userId,a.familyId]);
 res.json(rows[0]);
}));
export default router;
