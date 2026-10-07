import { z } from 'zod';
export const passwordSchema = z.string().min(8, 'Usa almeno 8 caratteri.').max(72)
  .regex(/[A-Z]/, 'Inserisci almeno una maiuscola.')
  .regex(/[^a-zA-Z0-9\s]/, 'Inserisci almeno un carattere speciale.')
  .refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password troppo lunga.');
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
 const d = new Date(v + 'T12:00:00Z');
 return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === v;
}, 'Data non valida.');
