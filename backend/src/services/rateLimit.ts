import { createHash } from 'node:crypto';
import type { RequestHandler } from 'express';
/** Small process-local guard. Challenge attempt limits are also persisted in PostgreSQL. */
export function rateLimit(limit:number,windowMs:number,methods: string[]=['POST']):RequestHandler {
 const requests=new Map<string,{count:number;until:number}>();
 const cleanup=setInterval(()=>{const now=Date.now();for(const [k,v] of requests)if(v.until<=now)requests.delete(k);},windowMs);cleanup.unref();
 return(req,res,next)=>{
  if(!methods.includes(req.method)){next();return;}
  const identity=typeof req.body?.email==='string'?req.body.email.trim().toLowerCase():req.header('authorization')??'';
  const key=createHash('sha256').update(`${req.ip}|${identity}|${req.path}`).digest('hex');const now=Date.now();let entry=requests.get(key);
  if(!entry||entry.until<=now){entry={count:0,until:now+windowMs};requests.set(key,entry);}
  if(++entry.count>limit){res.setHeader('Retry-After',String(Math.ceil((entry.until-now)/1000)));res.status(429).json({error:'Troppi tentativi. Riprova tra qualche minuto.',code:'RATE_LIMITED'});return;}
  next();
 };
}
