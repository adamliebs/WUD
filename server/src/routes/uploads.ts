import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { newId } from '../lib/ids.js';

/** Allowed image mime types → stored file extension. */
const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadsDir),
    // Random, unguessable filename — never trust the client's name.
    filename: (_req, file, cb) => cb(null, newId() + ALLOWED[file.mimetype]),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype in ALLOWED) cb(null, true);
    else cb(new Error('UNSUPPORTED_TYPE'));
  },
});

export const uploadsRouter = Router();

/**
 * POST /v1/uploads — accept a single `photo` multipart field, store it on the
 * persistent uploads volume under a random name, and return its absolute URL.
 */
uploadsRouter.post('/uploads', (req, res, next) => {
  upload.single('photo')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
        ? 'That photo is too large'
        : 'Photo must be a JPG, PNG, WebP or GIF';
      return next(badRequest('UPLOAD_FAILED', msg, 'photo'));
    }
    if (!req.file) return next(badRequest('NO_FILE', 'No photo was provided', 'photo'));
    // Relative URL — each client resolves it against its own API base, so the
    // same stored value works from the web, the iOS app and the Android app.
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});
