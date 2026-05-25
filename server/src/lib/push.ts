/**
 * Firebase Admin SDK wrapper for sending push notifications via FCM.
 *
 * Initialised lazily on first send so the rest of the server (tests, dev
 * without Firebase configured) doesn't pay the SDK boot cost.
 *
 * Configuration comes from one of two env vars (see config.ts):
 *   • FIREBASE_SERVICE_ACCOUNT_PATH — absolute path to the service-account JSON
 *   • FIREBASE_SERVICE_ACCOUNT_JSON — the JSON contents pasted inline
 * With neither set, sendFcm() is a no-op and dispatchPush() falls back to its
 * console-log stub.
 */
import { readFileSync } from 'node:fs';
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { config } from '../config.js';
import { logger } from './logger.js';

/** Tri-state init status — null = not yet attempted, App = ready, false = skipped. */
let firebaseApp: App | null | false = null;

/**
 * Best-effort init. Returns the App on success, false if Firebase isn't
 * configured (no env vars), and rethrows only on bad credentials.
 */
function ensureInit(): App | false {
  if (firebaseApp !== null) return firebaseApp;
  const { firebaseServiceAccountPath, firebaseServiceAccountJson } = config;
  if (!firebaseServiceAccountPath && !firebaseServiceAccountJson) {
    logger.info('[push] firebase not configured — pushes will log only (see PUSH.md)');
    firebaseApp = false;
    return false;
  }
  try {
    const raw = firebaseServiceAccountPath
      ? readFileSync(firebaseServiceAccountPath, 'utf8')
      : firebaseServiceAccountJson;
    // Google's service-account JSON uses snake_case; firebase-admin's cert()
    // accepts that shape at runtime even though the TS type expects camelCase.
    const credentials = JSON.parse(raw) as { project_id?: string };
    // Re-use any existing default app (test reloads, hot reload) instead of
    // crashing with "default app already exists."
    firebaseApp = getApps()[0] ?? initializeApp({ credential: cert(credentials as unknown as ServiceAccount) });
    logger.info(`[push] firebase admin initialised (project=${credentials.project_id ?? '?'})`);
    return firebaseApp;
  } catch (err) {
    logger.error({ err }, '[push] firebase admin init failed — pushes will log only');
    firebaseApp = false;
    return false;
  }
}

/**
 * Send one notification to one FCM token. Returns:
 *   • 'sent'        — delivered to FCM successfully
 *   • 'invalid'     — token rejected (unregistered / mismatch) → caller deletes it
 *   • 'skipped'     — Firebase not configured (silent stub)
 *   • 'error'       — transient failure, leave token in place for retry
 *
 * The deep-link payload is optional; when provided, the client uses it to
 * route the user straight to a specific plan when they tap the banner.
 */
export type SendResult = 'sent' | 'invalid' | 'skipped' | 'error';

export async function sendFcm(
  token: string,
  title: string,
  body: string,
  link?: string,
): Promise<SendResult> {
  const app = ensureInit();
  if (!app) return 'skipped';
  try {
    await getMessaging(app).send({
      token,
      notification: { title, body },
      // Custom data — read by the client's notificationActionPerformed listener
      // to deep-link into the relevant plan / chat.
      data: link ? { link } : undefined,
      apns: {
        // iOS-specific tweaks: default sound + content-available so iOS will
        // wake the app briefly when the user taps through.
        payload: { aps: { sound: 'default', 'content-available': 1 } },
      },
    });
    return 'sent';
  } catch (err) {
    // Type guard for the FCM error shape — `code` is the documented field for
    // categorising recoverable vs unrecoverable send failures.
    const code = (err as { code?: string } | undefined)?.code ?? '';
    if (code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument') {
      return 'invalid';
    }
    logger.warn({ err, code }, '[push] FCM send failed');
    return 'error';
  }
}
