import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { rateLimit } from '../services/rateLimit.js';
const router=Router();router.use(requireAuth);
router.get('/message-block',asyncHandler(async(req,res)=>{
 const a=requireFamily(req);const r=await pool.query('SELECT user_id FROM duecase_message_blocks WHERE family_id=$1',[a.familyId]);
 res.json({blockedByMe:r.rows.some(x=>x.user_id===a.userId),messagingBlocked:r.rows.length>0});
}));
router.put('/message-block',asyncHandler(async(req,res)=>{
 const a=requireFamily(req);const {blocked}=z.object({blocked:z.boolean()}).parse(req.body);
 if(blocked)await pool.query('INSERT INTO duecase_message_blocks(user_id,family_id) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET family_id=$2,blocked_at=NOW()',[a.userId,a.familyId]);
 else await pool.query('DELETE FROM duecase_message_blocks WHERE user_id=$1',[a.userId]);
 res.json({blockedByMe:blocked});
}));
router.post('/report-message',rateLimit(5,3600000),asyncHandler(async(req,res)=>{
 const a=requireFamily(req);const b=z.object({messageId:z.string().uuid(),reason:z.string().trim().min(5).max(2000)}).parse(req.body);
 const m=await pool.query('SELECT id FROM messages WHERE id=$1 AND family_id=$2 AND sender_id<>$3',[b.messageId,a.familyId,a.userId]);
 if(!m.rowCount)throw new ApiError(404,'Messaggio non trovato.','MESSAGE_NOT_FOUND');
 const id=randomUUID();await pool.query('INSERT INTO duecase_abuse_reports(id,family_id,reporter_id,message_id,reason) VALUES($1,$2,$3,$4,$5)',[id,a.familyId,a.userId,b.messageId,b.reason]);
 res.status(201).json({id,status:'received'});
}));
export default router;
