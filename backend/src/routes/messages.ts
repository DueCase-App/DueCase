import { randomUUID } from 'node:crypto';
import { Router } from 'express';
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
  text: z.string().min(1).max(10000).refine((value) => value.trim().length > 0, 'Il messaggio non può essere vuoto.'),
});
const toneSchema = z.object({
  text: z.string().min(1).max(10000).refine((value) => value.trim().length > 0, 'Il testo non può essere vuoto.'),
});
const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.string().optional().refine((value) => !value || !Number.isNaN(new Date(value).getTime()), 'Timestamp non valido.'),
});

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
         m.data_hash AS "dataHash"
    FROM messages m
    LEFT JOIN users u ON u.id = m.sender_id
    LEFT JOIN LATERAL (
      SELECT MIN(mr.read_at) AS read_at
        FROM message_reads mr
       WHERE mr.message_id = m.id
         AND mr.family_id = m.family_id
    ) r ON TRUE
`;

function serializeMessage(row: MessageRow, currentUserId: string): MessageRow & { isMine: boolean; integrityVerified: true } {
  const expected = messageDataHash(row.text, row.senderId, row.createdAt);
  if (expected !== row.dataHash) {
    throw new ApiError(409, 'Integrità del messaggio non verificabile.', 'MESSAGE_INTEGRITY_ERROR');
  }

  return {
    ...row,
    isMine: row.senderId === currentUserId,
    integrityVerified: true,
  };
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

  const messages = rows.reverse().map((row) => serializeMessage(row, auth.userId));
  res.json(messages);
}));

router.post('/analyze-tone', asyncHandler(async (req, res) => {
  requireFamily(req);
  const body = toneSchema.parse(req.body);
  res.json(analyzeTone(body.text));
}));

router.post('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createSchema.parse(req.body);
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const dataHash = messageDataHash(body.text, auth.userId, createdAt);

  await pool.query(
    `INSERT INTO messages (id, family_id, sender_id, sender_role, text, created_at, data_hash)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)`,
    [id, auth.familyId, auth.userId, auth.role, body.text, createdAt, dataHash],
  );

  const { rows } = await pool.query<MessageRow>(
    `${messageSelect} WHERE m.id = $1 AND m.family_id = $2`,
    [id, auth.familyId],
  );
  const saved = rows[0];
  if (!saved) throw new ApiError(500, 'Impossibile rileggere il messaggio salvato.', 'MESSAGE_REFRESH_ERROR');

  await sendPushToOtherParent(auth.familyId, auth.userId, {
    title: 'Nuovo messaggio DueCase',
    body: `${parentRoleSubject(auth.role)} ti ha inviato un nuovo messaggio.`,
    data: { type: 'message_created', screen: 'messages', messageId: id },
  });

  res.status(201).json(serializeMessage(saved, auth.userId));
}));

router.put('/:id/read', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const messageId = uuid.parse(req.params.id);

  const existingResult = await pool.query<MessageRow>(
    `${messageSelect} WHERE m.id = $1 AND m.family_id = $2`,
    [messageId, auth.familyId],
  );
  const existing = existingResult.rows[0];
  if (!existing) throw new ApiError(404, 'Messaggio non trovato.', 'MESSAGE_NOT_FOUND');
  if (existing.senderId === auth.userId) {
    throw new ApiError(403, 'Il mittente non può registrare la lettura del proprio messaggio.', 'SELF_READ_NOT_ALLOWED');
  }

  serializeMessage(existing, auth.userId);
  if (!existing.readAt) {
    await pool.query(
      `INSERT INTO message_reads (message_id, family_id, reader_id, read_at)
       VALUES ($1, $2, $3, clock_timestamp())
       ON CONFLICT (message_id, reader_id) DO NOTHING`,
      [messageId, auth.familyId, auth.userId],
    );
  }

  const refreshedResult = await pool.query<MessageRow>(
    `${messageSelect} WHERE m.id = $1 AND m.family_id = $2`,
    [messageId, auth.familyId],
  );
  const refreshed = refreshedResult.rows[0];
  if (!refreshed) throw new ApiError(500, 'Impossibile rileggere il messaggio.', 'MESSAGE_REFRESH_ERROR');

  res.json(serializeMessage(refreshed, auth.userId));
}));

export default router;
