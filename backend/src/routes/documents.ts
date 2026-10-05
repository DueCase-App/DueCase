import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireAuth, requireFamily } from '../auth.js';
import { pool } from '../db.js';
import { ApiError, asyncHandler } from '../http.js';

const router = Router();
const uuid = z.string().uuid();
const categories = ['Salute', 'Scuola', 'Legale', 'Altro'] as const;

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
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error('Sono ammessi solo PDF o immagini JPEG, PNG, WEBP, HEIC e HEIF.'));
      return;
    }
    callback(null, true);
  },
});

function uploadDocument(req: Request, res: Response, next: NextFunction): void {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }

    const message = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE'
      ? 'Il documento non può superare 20 MB.'
      : error instanceof Error ? error.message : 'Documento non valido.';
    next(new ApiError(400, message, 'INVALID_DOCUMENT_FILE'));
  });
}

const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(3000).optional(),
  category: z.enum(categories),
});

router.use(requireAuth);

const documentSelect = `
  SELECT d.id,
         d.family_id AS "familyId",
         d.title,
         d.description,
         d.file_url AS "fileUrl",
         d.uploaded_by_user_id AS "uploadedByUserId",
         u.display_name AS "uploadedByName",
         u.role AS "uploadedByRole",
         d.category,
         d.mime_type AS "mimeType",
         d.filename,
         d.file_size_bytes AS "fileSizeBytes",
         d.created_at AS "createdAt",
         d.updated_at AS "updatedAt"
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by_user_id
`;

router.get('/', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const { rows } = await pool.query(
    `${documentSelect}
      WHERE d.family_id = $1
      ORDER BY d.category, d.created_at DESC`,
    [auth.familyId],
  );
  res.json(rows);
}));

router.get('/:id/file', asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const documentId = uuid.parse(req.params.id);
  const { rows } = await pool.query<{
    fileData: Buffer | null;
    mimeType: string | null;
    filename: string | null;
  }>(
    `SELECT file_data AS "fileData",
            mime_type AS "mimeType",
            filename
       FROM documents
      WHERE id = $1
        AND family_id = $2`,
    [documentId, auth.familyId],
  );

  const document = rows[0];
  if (!document) {
    throw new ApiError(404, 'Documento non trovato', 'DOCUMENT_NOT_FOUND');
  }
  if (!document.fileData) {
    throw new ApiError(
      409,
      'Questo documento proviene da una versione precedente e deve essere ricaricato per essere aperto in modo protetto.',
      'DOCUMENT_REUPLOAD_REQUIRED',
    );
  }

  const safeFilename = (document.filename ?? 'documento').replace(/["\\\r\n]/g, '_');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', document.mimeType ?? 'application/octet-stream');
  res.setHeader('Content-Length', String(document.fileData.length));
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);
  res.send(document.fileData);
}));

router.post('/', uploadDocument, asyncHandler(async (req, res) => {
  const auth = requireFamily(req);
  const body = createDocumentSchema.parse(req.body);
  if (!req.file) {
    throw new ApiError(400, 'Seleziona un PDF o un’immagine da caricare.', 'DOCUMENT_FILE_REQUIRED');
  }

  const id = randomUUID();
  const fileUrl = `/documents/${id}/file`;

  await pool.query(
    `INSERT INTO documents
      (id, family_id, title, description, file_url, uploaded_by_user_id,
       category, mime_type, filename, file_size_bytes, file_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      auth.familyId,
      body.title,
      body.description || null,
      fileUrl,
      auth.userId,
      body.category,
      req.file.mimetype,
      req.file.originalname,
      req.file.size,
      req.file.buffer,
    ],
  );

  const { rows } = await pool.query(
    `${documentSelect} WHERE d.id = $1 AND d.family_id = $2`,
    [id, auth.familyId],
  );
  res.status(201).json(rows[0]);
}));

export default router;
