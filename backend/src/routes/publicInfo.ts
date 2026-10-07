import { Router } from 'express';
import { z } from 'zod';
const router=Router();
const url=(v:string|undefined)=>{const r=z.string().url().safeParse(v);return r.success&&r.data.startsWith('https://')?r.data:null;};
router.get('/service-info',(_req,res)=>res.json({
 privacyUrl:url(process.env.PRIVACY_POLICY_URL),termsUrl:url(process.env.TERMS_URL),
 supportEmail:z.string().email().safeParse(process.env.SUPPORT_EMAIL).success?process.env.SUPPORT_EMAIL:null,
 moderationActive:process.env.MODERATION_ACTIVE==='true',
 deletionUrl:'/account-deletion',
}));
export default router;
