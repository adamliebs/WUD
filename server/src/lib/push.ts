/**
 * FCM push delivery via the Firebase Admin SDK. Init is shared with the auth
 * verifier through lib/firebase.ts so one boot logs covers both subsystems.
 */
import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseApp } from './firebase.js';
import { logger } from './logger.js';

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
  const app = getFirebaseApp();
  if (!app) return 'skipped';
  try {
    await getMessaging(app).send({
      token,
      notification: { title, body },
      // Custom data — read by the client's notificationActionPerformed listener
      // to deep-link into the relevant plan / chat.
      data: link ? { link } : undefined,
      apns: {
        // High-priority so the banner shows immediately even when the device
        // is asleep / the app has been evicted from memory.
        headers: { 'apns-priority': '10' },
        // Just a sound override — DO NOT add content-available:1 here. That
        // flag tells iOS this is a silent background push and the system
        // suppresses the visible banner once the app isn't in memory.
        payload: { aps: { sound: 'default' } },
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
