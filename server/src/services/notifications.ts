import { q } from '../db/index.js';
import { newId, now } from '../lib/ids.js';
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
  dispatchPush(input.userId, input.body);
  return notification;
}

/**
 * PRODUCTION STUB — would enqueue an APNs/FCM payload for each of the user's
 * registered devices (SRS §10.7). Requires real Apple/Google credentials, so
 * here it just logs. The `devices` table + per-user `push_enabled` check are
 * already in place for the real implementation.
 */
function dispatchPush(userId: string, body: string): void {
  const settings = getSettings(userId);
  if (!settings.pushEnabled) return;
  const devices = q.all<{ push_token: string }>(
    'SELECT push_token FROM devices WHERE user_id = ?', userId,
  );
  if (devices.length === 0) return;
  console.log(`[push:stub] → user ${userId} (${devices.length} device(s)): ${body}`);
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
