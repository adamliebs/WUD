/**
 * Shared Firebase Admin SDK initialisation.
 *
 * Used by:
 *   • lib/push.ts        — FCM message sending
 *   • services/auth.ts   — verifying Firebase ID tokens at sign-in
 *
 * Configuration comes from one of two env vars (see config.ts):
 *   • FIREBASE_SERVICE_ACCOUNT_PATH — absolute path to the service-account JSON
 *   • FIREBASE_SERVICE_ACCOUNT_JSON — the JSON contents pasted inline
 * With neither set, getFirebaseApp() returns null and callers should
 * gracefully degrade (push falls back to console log, Firebase auth refuses).
 */
import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { config } from '../config.js';
import { logger } from './logger.js';

let cached: App | null | false = null;

/**
 * Best-effort init. Returns the App on success, null if Firebase isn't
 * configured (no env vars), and logs on bad credentials. Idempotent across
 * calls within a process.
 */
export function getFirebaseApp(): App | null {
  if (cached !== null) return cached || null;
  const { firebaseServiceAccountPath, firebaseServiceAccountJson } = config;
  if (!firebaseServiceAccountPath && !firebaseServiceAccountJson) {
    logger.info('[firebase] not configured — push + Firebase auth disabled (see PUSH.md)');
    cached = false;
    return null;
  }
  try {
    const raw = firebaseServiceAccountPath
      ? readFileSync(firebaseServiceAccountPath, 'utf8')
      : firebaseServiceAccountJson;
    // Google's service-account JSON uses snake_case; firebase-admin's cert()
    // accepts that shape at runtime even though the TS type expects camelCase.
    const credentials = JSON.parse(raw) as { project_id?: string };
    cached = getApps()[0] ?? initializeApp({ credential: cert(credentials as unknown as ServiceAccount) });
    logger.info(`[firebase] admin initialised (project=${credentials.project_id ?? '?'})`);
    return cached;
  } catch (err) {
    logger.error({ err }, '[firebase] admin init failed');
    cached = false;
    return null;
  }
}
