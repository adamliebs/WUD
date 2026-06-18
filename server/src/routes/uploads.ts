import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import convertHeic from 'heic-convert';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { logger } from '../lib/logger.js';

/** Accepted input image mime types. Output is always WebP (except animated
 *  GIFs, which pass through so the animation survives). HEIC/HEIF covers
 *  iPhone camera photos, which iOS sometimes hands over un-transcoded. */
const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
]);

/**
 * Longest-edge cap (px) per upload kind. Phone cameras and screenshots produce
 * multi-megabyte originals; downscaling to these caps + re-encoding to WebP
 * cuts stored/served bytes by an order of magnitude with no visible loss at the
 * sizes the app actually renders.
 *   • avatar — usually shown small, but tappable to view full-screen on the
 *     profile, so 1024 keeps it crisp when enlarged (still far below original).
 *   • banner / photo — full-width hero or a tapped-to-fullscreen chat image.
 */
const MAX_DIM: Record<string, number> = { avatar: 1024, banner: 1600, photo: 1600 };
const WEBP_QUALITY = 80;

// Memory storage — we resize + re-encode the buffer before it ever touches
// disk, so the persistent volume only ever holds the optimized version.
const upload = multer({
  storage: multer.memoryStorage(),
  // Cap the INPUT we'll accept; the stored output is far smaller after
  // processing. Rejecting huge inputs up front protects memory + CPU.
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.has(file.mimetype)) cb(null, true);
    else cb(new Error('UNSUPPORTED_TYPE'));
  },
});

export const uploadsRouter = Router();

/**
 * POST /v1/uploads — accept a single `photo` multipart field (+ optional
 * `kind` text field: 'avatar' | 'banner' | 'photo'), downscale + compress it,
 * store it on the persistent uploads volume under a random name, and return
 * its absolute URL.
 */
uploadsRouter.post('/uploads', (req, res, next) => {
  upload.single('photo')(req, res, (err: unknown) => {
    void (async () => {
      if (err) {
        const msg = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
          ? 'That photo is too large'
          : 'Photo must be a JPG, PNG, WebP or GIF';
        return next(badRequest('UPLOAD_FAILED', msg, 'photo'));
      }
      if (!req.file) return next(badRequest('NO_FILE', 'No photo was provided', 'photo'));
      try {
        const kindRaw = typeof req.body?.kind === 'string' ? req.body.kind : 'photo';
        const maxDim = MAX_DIM[kindRaw] ?? MAX_DIM.photo;
        const filename = await storeImage(req.file.buffer, req.file.mimetype, maxDim);
        // Relative URL — each client resolves it against its own API base, so the
        // same stored value works from the web, the iOS app and the Android app.
        res.status(201).json({ url: `/uploads/${filename}` });
      } catch (e) {
        logger.warn({ err: e }, '[uploads] image processing failed');
        return next(badRequest('UPLOAD_FAILED', 'Could not process that image', 'photo'));
      }
    })();
  });
});

/**
 * Detect a HEIC/HEIF image from its container brand, so we catch iPhone photos
 * even when the browser mislabels the mime (octet-stream, etc.). The ISO-BMFF
 * header is `....ftyp<brand>` — HEVC-coded brands need heic-convert because
 * sharp's prebuilt binary ships libheif WITHOUT the HEVC decoder.
 */
function isHeic(buffer: Buffer, mimetype: string): boolean {
  if (mimetype === 'image/heic' || mimetype === 'image/heif'
      || mimetype === 'image/heic-sequence' || mimetype === 'image/heif-sequence') {
    return true;
  }
  if (buffer.length < 12 || buffer.toString('ascii', 4, 8) !== 'ftyp') return false;
  const brand = buffer.toString('ascii', 8, 12);
  return ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand);
}

/**
 * Resize + re-encode an uploaded image and write it to the uploads volume.
 * Returns the stored filename.
 *   • Animated GIFs are stored as-is (re-encoding to a single WebP frame
 *     would drop the animation).
 *   • HEIC/HEIF (iPhone) is decoded to JPEG via heic-convert first — sharp's
 *     prebuilt binary can't decode HEVC-coded HEIF on its own.
 *   • Everything else is auto-oriented from EXIF, downscaled to fit `maxDim`,
 *     and saved as WebP (universally renderable across web / iOS / Android).
 */
async function storeImage(buffer: Buffer, mimetype: string, maxDim: number): Promise<string> {
  if (mimetype === 'image/gif') {
    const meta = await sharp(buffer).metadata().catch(() => null);
    if (meta && (meta.pages ?? 1) > 1) {
      const filename = `${newId()}.gif`;
      await writeFile(path.join(config.uploadsDir, filename), buffer);
      return filename;
    }
  }

  // HEIC → JPEG (lossless-ish) before handing to sharp for the resize/encode.
  let input = buffer;
  if (isHeic(buffer, mimetype)) {
    const jpeg = await convertHeic({ buffer, format: 'JPEG', quality: 0.92 });
    input = Buffer.from(jpeg);
  }

  const out = await sharp(input)
    .rotate()  // apply EXIF orientation before stripping metadata (phone photos)
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
  const filename = `${newId()}.webp`;
  await writeFile(path.join(config.uploadsDir, filename), out);
  return filename;
}
