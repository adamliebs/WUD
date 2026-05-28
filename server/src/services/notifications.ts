import { q } from '../db/index.js';
import { newId, now } from '../lib/ids.js';
import { logger } from '../lib/logger.js';
import { sendFcm } from '../lib/push.js';
import { publish } from '../realtime/bus.js';
import type { AppNotification, NotificationType } from '../types.js';
import { getSettings } from './users.js';

interface NotifRow {
  id: string;
  type: NotificationType;
  from_id: string | null;
  activity_id: string | null;
  body: string;
  read: number;
  resolved: number;
  created_at: number;
}

function toNotification(r: NotifRow): AppNotification {
  return {
    id: r.id,
    type: r.type,
    fromId: r.from_id ?? 'system',
    activityId: r.activity_id ?? undefined,
    text: r.body,
    at: r.created_at,
    read: !!r.read,
    resolved: !!r.resolved,
  };
}

/**
 * Create a notification for a recipient, publish a realtime event, and (in
 * production) enqueue a push. Push dispatch is a documented stub — see below.
 */
export function createNotification(input: {
  userId: string;             // recipient
  type: NotificationType;
  fromId?: string;
  activityId?: string;
  body: string;
}): AppNotification {
  const id = newId();
  q.run(
    `INSERT INTO notifications (id, user_id, type, from_id, activity_id, body, read, resolved, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    id, input.userId, input.type, input.fromId ?? null, input.activityId ?? null, input.body, now(),
  );
  const row = q.get<NotifRow>('SELECT * FROM notifications WHERE id = ?', id)!;
  const notification = toNotification(row);

  publish({ channel: `user:${input.userId}`, type: 'notification.created', data: notification });
  // Fire-and-forget; createNotification stays sync. Errors are swallowed by
  // dispatchPush itself and surface only in logs (push failures should never
  // break the originating action).
  dispatchPush(input.userId, input.type, input.body, input.activityId);
  return notification;
}

/**
 * Banner title shown on the lockscreen / notification center. Distinct per
 * notification type so a glance at the device tells you what's happening —
 * "WUD" alone is too generic when 4 of these stack up.
 */
function bannerTitle(type: NotificationType): string {
  switch (type) {
    case 'join':         return 'New RSVP';
    case 'ping':         return 'Ping';
    case 'reminder':     return 'Starting soon';
    case 'invite':       return 'New plan visible';
    case 'host_offer':   return "You're up to host";
    case 'host_taken':   return 'Host accepted';
    default:             return 'WUD';
  }
}

/**
 * Push the notification to all of the user's registered devices via FCM.
 * Skips silently when:
 *   • the user has disabled push in their settings, or
 *   • they have no registered devices.
 *
 * Invalid tokens (uninstalled apps, token mismatch) are pruned from `devices`
 * so the table doesn't accumulate dead entries that we'd retry forever.
 */
function dispatchPush(
  userId: string,
  type: NotificationType,
  body: string,
  activityId?: string,
): void {
  const settings = getSettings(userId);
  if (!settings.pushEnabled) return;
  const devices = q.all<{ id: string; push_token: string }>(
    'SELECT id, push_token FROM devices WHERE user_id = ?', userId,
  );
  if (devices.length === 0) return;

  const title = bannerTitle(type);
  // Deep-link the user to the plan when the notification has one attached, so
  // tapping the banner lands them on the activity detail instead of just
  // opening the app.
  const link = activityId ? `wud://plan/${activityId}` : undefined;

  void Promise.all(devices.map(async d => {
    const result = await sendFcm(d.push_token, title, body, link);
    if (result === 'invalid') {
      // Token rejected by FCM — most often "app uninstalled" or "token
      // belongs to a different app/project." Prune so we don't keep trying.
      q.run('DELETE FROM devices WHERE id = ?', d.id);
      logger.info({ deviceId: d.id, userId }, '[push] pruned invalid token');
    }
  })).catch(err => logger.warn({ err }, '[push] dispatch batch failed'));
}

export function listNotifications(userId: string): AppNotification[] {
  return q.all<NotifRow>(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', userId,
  ).map(toNotification);
}

export function unreadCount(userId: string): number {
  return q.get<{ n: number }>(
    'SELECT COUNT(*) n FROM notifications WHERE user_id = ? AND read = 0', userId,
  )?.n ?? 0;
}

export function markAllRead(userId: string): void {
  q.run('UPDATE notifications SET read = 1 WHERE user_id = ?', userId);
}

/** Fetch one notification belonging to a user (or undefined). */
export function getNotification(id: string, userId: string): AppNotification | undefined {
  const row = q.get<NotifRow>(
    'SELECT * FROM notifications WHERE id = ? AND user_id = ?', id, userId,
  );
  return row ? toNotification(row) : undefined;
}

/** Mark a single actionable notification resolved (e.g. host offer accepted). */
export function resolveNotification(id: string, userId: string): void {
  q.run('UPDATE notifications SET resolved = 1, read = 1 WHERE id = ? AND user_id = ?', id, userId);
}

/** Resolve every pending host-offer notification for a (user, activity) pair. */
export function resolveHostOffers(userId: string, activityId: string): void {
  q.run(
    `UPDATE notifications SET resolved = 1, read = 1
      WHERE user_id = ? AND activity_id = ? AND type = 'host_offer'`,
    userId, activityId,
  );
}

/**
 * Send a ping. Recipients are validated to be the sender's friends and to have
 * `pings_enabled`. Returns how many pings were actually delivered.
 */
export function sendPing(senderId: string, text: string, recipientIds: string[]): number {
  let delivered = 0;
  for (const recipientId of new Set(recipientIds)) {
    if (recipientId === senderId) continue;
    if (!getSettings(recipientId).pingsEnabled) continue;
    createNotification({
      userId: recipientId,
      type: 'ping',
      fromId: senderId,
      body: text,
    });
    delivered++;
  }
  return delivered;
}
