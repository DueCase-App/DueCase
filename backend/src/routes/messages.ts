import { createHash, randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';
import { messageDataHash } from '../services/integrityService.js';
import { parentRoleSubject, sendPushToOtherParent } from '../services/notificationService.js';
import { analyzeTone } from '../services/toneMeterService.js';

const router = Router();
router.use(requireAuth);

const uuid = z.string().uuid();
const createSchema = z.object({
  text: z.string().max(10000).optional().default(''),
});
const toneSchema = z.object({
  text: z.string().min(1).max(10000).refine((value) => value.trim().length > 0, 'Il testo non può essere vuoto.'),
});
const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.string().optional().refine((value) => !value || !Number.isNaN(new Date(value).getTime()), 'Timestamp non valido.'),
});

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error('L’allegato deve essere un PDF o un’immagine supportata.'));
      return;
    }
    callback(null, true);
  },
});
function uploadAttachment(req: Request, res: Response, next: NextFunction): void {
  upload.single('attachment')(req, res, (error) => {
    if (!error) { next(); return; }
    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'L’allegato non può superare 12 MB.'
      : error instanceof Error ? error.message : 'Allegato non valido.';
    next(new ApiError(400, message, 'INVALID_MESSAGE_ATTACHMENT'));
  });
}

export type MessageAttachmentRow = {
  id: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  dataHash: string;
  fileUrl: string;
  createdAt: string;
};

type MessageRow = {
  id: string;
  familyId: string;
  senderId: string;
  senderName: string;
  senderRole: 'father' | 'mother' | null;
  text: string;
  createdAt: string;
  readAt: string | null;
  dataHash: string;
  attachments: MessageAttachmentRow[];
};

const messageSelect = `
  SELECT m.id,
         m.family_id AS "familyId",
         m.sender_id AS "senderId",
         COALESCE(u.display_name, 'Account eliminato') AS "senderName",
         COALESCE(u.role, m.sender_role) AS "senderRole",
         m.text,
         to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
         CASE WHEN COALESCE(r.read_at, m.read_at) IS NULL THEN NULL
              ELSE to_char(COALESCE(r.read_at, m.read_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          END AS "readAt",
         m.data_hash AS "dataHash",
         COALESCE((
           SELECT json_agg(json_build_object(
             'id', ma.id,
             'filename', ma.filename,
             'mimeType', ma.mime_type,
             'fileSizeBytes', ma.file_size_bytes,
             'dataHash', ma.data_hash,
             'fileUrl', '/messages/' || m.id::text || '/attachments/' || ma.id::text || '/file',
             'createdAt', to_char(ma.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
           ) ORDER BY ma.created_at, ma.id)
             FROM duecase_message_attachments ma
            WHERE ma.message_id = m.id AND ma.family_id = m.family_id
         ), '[]'::json) AS attachments
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN LATERAL (
      SELECT MIN(mr.read_at) AS read_at
        FROM message_read_receipts mr
       WHERE mr.message_id = m.id
         AND mr.family_id = m.family_id
    ) r ON TRUE
`;

function serializeMessage(row: MessageRow, currentUserId: string): MessageRow & { isMine: boolean; integrityVerified: true } {
  const expected = messageDataHash(row.text, row.senderId, row.createdAt);
  if (expected !== row.dataHash) throw new ApiError(409, 'Integrità del messaggio non verificabile.', 'MESSAGE_INTEGRITY_ERROR');
  return { ...row, isMine: row.senderId === currentUserId, integrityVerified: true };
}

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const query = listSchema.parse(req.query);
  const values: Array<string | number> = [auth.familyId];
  let beforeFilter = '';
  if (query.before) {
    values.push(new Date(query.before).toISOString());
    beforeFilter = ` AND m.created_at < $${values.length}::timestamptz`;
  }
  values.push(query.limit);
  const { rows } = await pool.query<MessageRow>(
    `${messageSelect}
      WHERE m.family_id = $1${beforeFilter}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $${values.length}`,
    values,
  );
  res.json(rows.reverse().map((row) => serializeMessage(row, auth.userId)));
}));

router.post('/analyze-tone', asyncHandler(async (req, res) => {
  requireFamily(req);
  const body = toneSchema.parse(req.body);
  res.json(analyzeTone(body.text));
}));

router.get('/:id/attachments/:attachmentId/file', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const messageId = uuid.parse(req.params.id);
  const attachmentId = uuid.parse(req.params.attachmentId);
  const { rows } = await pool.query<{
    filename: string;
    mimeType: string;
    fileData: Buffer;
    dataHash: string;
  }>(
    `SELECT filename,
            mime_type AS "mimeType",
            file_data AS "fileData",
            data_hash AS "dataHash"
       FROM duecase_message_attachments
      WHERE id = $1 AND message_id = $2 AND family_id = $3`,
    [attachmentId, messageId, auth.familyId],
  );
  const attachment = rows[0];
  if (!attachment) throw new ApiError(404, 'Allegato non trovato.', 'MESSAGE_ATTACHMENT_NOT_FOUND');
  const actualHash = createHash('sha256').update(attachment.fileData).digest('hex');
  if (actualHash !== attachment.dataHash) throw new ApiError(409, 'Integrità dell’allegato non verificabile.', 'MESSAGE_ATTACHMENT_INTEGRITY_ERROR');
  const safeFilename = attachment.filename.replace(/["\\\r\n]/g, '_');
  res.setHeader('Content-Type', attachment.mimeType);
  res.setHeader('Content-Length', String(attachment.fileData.length));
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-DueCase-Attachment-SHA256', attachment.dataHash);
  res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
  res.send(attachment.fileData);
}));

router.post('/', uploadAttachment, asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createSchema.parse(req.body ?? {});
  const text = body.text.trim();
  if (!text && !req.file) throw new ApiError(400, 'Inserisci un messaggio o allega un file.', 'MESSAGE_CONTENT_REQUIRED');

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const dataHash = messageDataHash(text, auth.userId, createdAt);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO messages (id, family_id, sender_id, sender_role, text, created_at, data_hash)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)`,
      [id, auth.familyId, auth.userId, auth.role, text, createdAt, dataHash],
    );

    if (req.file) {
      const attachmentId = randomUUID();
      const attachmentHash = createHash('sha256').update(req.file.buffer).digest('hex');
      await client.query(
        `INSERT INTO duecase_message_attachments
          (id, message_id, family_id, sender_id, filename, mime_type, file_size_bytes, file_data, data_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [attachmentId, id, auth.familyId, auth.userId, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, attachmentHash],
      );
    }

    await client.query(
      `INSERT INTO family_activity_history (id, family_id, actor_user_id, entity_type, entity_id, action, details)
       VALUES ($1,$2,$3,'message',$4,'sent',$5::jsonb)`,
      [randomUUID(), auth.familyId, auth.userId, id, JSON.stringify({ hasAttachment: Boolean(req.file), role: auth.role })],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }

  const { rows } = await pool.query<MessageRow>(`${messageSelect} WHERE m.id = $1 AND m.family_id = $2`, [id, auth.familyId]);
  const saved = rows[0];
  if (!saved) throw new ApiError(500, 'Impossibile rileggere il messaggio salvato.', 'MESSAGE_REFRESH_ERROR');

  await sendPushToOtherParent(auth.familyId, auth.userId, {
    title: 'Nuovo messaggio DueCase',
    body: req.file ? `${parentRoleSubject(auth.role)} ti ha inviato un messaggio con allegato.` : `${parentRoleSubject(auth.role)} ti ha inviato un nuovo messaggio.`,
    data: { type: 'message_created', screen: 'messages', messageId: id },
  });
  res.status(201).json(serializeMessage(saved, auth.userId));
}));

router.put('/:id/read', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const messageId = uuid.parse(req.params.id);
  const existingResult = await pool.query<MessageRow>(`${messageSelect} WHERE m.id = $1 AND m.family_id = $2`, [messageId, auth.familyId]);
  const existing = existingResult.rows[0];
  if (!existing) throw new ApiError(404, 'Messaggio non trovato.', 'MESSAGE_NOT_FOUND');
  if (existing.senderId === auth.userId) throw new ApiError(403, 'Il mittente non può registrare la lettura del proprio messaggio.', 'SELF_READ_NOT_ALLOWED');

  serializeMessage(existing, auth.userId);
  if (!existing.readAt) {
    await pool.query(
      `INSERT INTO message_read_receipts (message_id, family_id, reader_id, read_at)
       VALUES ($1, $2, $3, clock_timestamp())
       ON CONFLICT (message_id, reader_id) DO NOTHING`,
      [messageId, auth.familyId, auth.userId],
    );
  }

  const refreshedResult = await pool.query<MessageRow>(`${messageSelect} WHERE m.id = $1 AND m.family_id = $2`, [messageId, auth.familyId]);
  const refreshed = refreshedResult.rows[0];
  if (!refreshed) throw new ApiError(500, 'Impossibile rileggere il messaggio.', 'MESSAGE_REFRESH_ERROR');
  res.json(serializeMessage(refreshed, auth.userId));
}));

export default router;
