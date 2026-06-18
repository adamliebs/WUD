import { q } from '../db/index.js';
import { newId, now } from '../lib/ids.js';
import { logger } from '../lib/logger.js';
import { sendFcm } from '../lib/push.js';
import { publish } from '../realtime/bus.js';
import type { AppNotification, AppSettings, NotificationType } from '../types.js';
import { BUDDY_ID } from './buddy.js';
import { getSettings } from './users.js';

interface NotifRow {
  id: string;
  type: NotificationType;
  from_id: string | null;
  activity_id: string | null;
  float_id: string | null;
  squad_id: string | null;
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
    floatId: r.float_id ?? undefined,
    squadId: r.squad_id ?? undefined,
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
  floatId?: string;
  squadId?: string;
  body: string;
}): AppNotification | null {
  const id = newId();
  // Notifications are a *side effect*, never the user-facing action. An
  // INSERT failure (schema drift between code and DB, FK violation against
  // a freshly-deleted row, etc.) used to take down the caller's whole route
  // — e.g. a host leaving an activity 500'd because the host_offer notif
  // couldn't be written. Make this best-effort: log and bail, let the action
  // keep going.
  try {
    q.run(
      `INSERT INTO notifications (id, user_id, type, from_id, activity_id, float_id, squad_id, body, read, resolved, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
      id, input.userId, input.type, input.fromId ?? null, input.activityId ?? null,
      input.floatId ?? null, input.squadId ?? null, input.body, now(),
    );
  } catch (err) {
    logger.warn({ err, type: input.type, userId: input.userId }, '[notifications] insert failed (non-fatal)');
    return null;
  }
  const row = q.get<NotifRow>('SELECT * FROM notifications WHERE id = ?', id)!;
  const notification = toNotification(row);

  publish({ channel: `user:${input.userId}`, type: 'notification.created', data: notification });
  // Fire-and-forget; createNotification stays sync. Errors are swallowed by
  // dispatchPush itself and surface only in logs (push failures should never
  // break the originating action). Passing fromId lets dispatchPush use the
  // sender's name in the lockscreen title — e.g. "Adam pinged you" instead
  // of the generic "Ping".
  dispatchPush(input.userId, input.type, input.body, input.activityId, input.fromId);
  return notification;
}

/**
 * Sender-aware lockscreen title — preferred over the generic bannerTitle
 * when the notification has an identifiable actor. Returning null tells
 * the caller to fall back to bannerTitle.
 *
 * For most types the body ALREADY embeds the sender's name ("Adam is going
 * to..."), so we only override the title where the generic banner is the
 * weakest — pings (body is just "👋") and chat messages (body is just the
 * preview text). For everything else the generic title + name-in-body
 * combo reads cleaner than duplicating the name across both fields.
 */
function composePushTitle(type: NotificationType, fromName: string | null | undefined): string | null {
  if (!fromName) return null;
  switch (type) {
    case 'ping':            return `${fromName} pinged you`;
    case 'chat_message':    return fromName;
    case 'invite':          return `${fromName} wants to be your friend`;
    case 'friend_accepted': return `${fromName} accepted your request`;
    case 'host_offer':      return `You're up to host`;
    case 'plan_invite':     return `${fromName} invited you to a plan`;
    case 'squad_invite':    return `${fromName} invited you to a squad`;
    default:                return null;
  }
}

/**
 * Banner title shown on the lockscreen / notification center. Distinct per
 * notification type so a glance at the device tells you what's happening —
 * "WUD" alone is too generic when 4 of these stack up.
 */
function bannerTitle(type: NotificationType): string {
  switch (type) {
    case 'join':            return 'New RSVP';
    case 'ping':            return 'Ping';
    case 'reminder':        return 'Starting soon';
    case 'invite':          return 'New plan visible';
    case 'host_offer':      return "You're up to host";
    case 'host_taken':      return 'Host accepted';
    case 'float_received':  return 'New float';
    case 'float_keen':      return 'Someone is keen';
    case 'float_locked':    return 'Locked in';
    case 'activity_created':return 'New plan';
    case 'activity_updated':return 'Plan updated';
    case 'activity_cancelled': return 'Plan cancelled';
    case 'chat_message':    return 'New message';
    case 'friend_accepted': return 'New friend';
    case 'plan_invite':     return 'You\'re invited';
    case 'squad_invite':    return 'Squad invite';
    default:                return 'WUD';
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
  fromId?: string,
): void {
  const settings = getSettings(userId);
  if (!shouldPushCategory(type, settings)) return;
  const devices = q.all<{ id: string; push_token: string }>(
    'SELECT id, push_token FROM devices WHERE user_id = ?', userId,
  );
  if (devices.length === 0) return;

  // Compose the lockscreen title. When we know the sender, prefer their
  // name (or a name-anchored phrase like "Adam pinged you") over the
  // generic per-type banner ("Ping", "New message", etc) — users want to
  // see WHO the notification is from at a glance, especially on iOS where
  // multiple banners stack and the type alone tells them nothing.
  const fromName = fromId
    ? q.get<{ name: string }>('SELECT name FROM users WHERE id = ?', fromId)?.name
    : null;
  const title = composePushTitle(type, fromName) ?? bannerTitle(type);
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

/** Wipe every notification belonging to a user. Used by the "Clear all"
 *  affordance on the Alerts page. Returns the row count deleted. */
export function clearAllNotifications(userId: string): number {
  const result = q.run('DELETE FROM notifications WHERE user_id = ?', userId);
  return result.changes;
}

/** Drop notifications older than the cutoff. Called by the scheduler each
 *  tick so the table doesn't accumulate ancient noise. Returns the row count
 *  deleted (zero on most ticks). */
export function purgeStaleNotifications(olderThanMs: number): number {
  const result = q.run(
    'DELETE FROM notifications WHERE created_at < ?',
    Date.now() - olderThanMs,
  );
  return result.changes;
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
 * Decide whether a specific notification type should be pushed to this user.
 * The master `pushEnabled` switch always wins; when it's on, the per-category
 * toggle for that type's bucket determines delivery. The in-app notification
 * (Alerts tab) is created regardless — only the lock-screen push is gated, so
 * users can quiet a category without losing the event history.
 *
 * Friend-request invites are intentionally not per-category gated: they're
 * infrequent and almost always something the recipient wants to know about
 * right away, so the master push toggle is the only gate.
 */
function shouldPushCategory(type: NotificationType, s: AppSettings): boolean {
  if (!s.pushEnabled) return false;
  switch (type) {
    case 'join':
    case 'host_offer':
    case 'host_taken':
    case 'activity_created':
    case 'activity_updated':
    case 'activity_cancelled':
    case 'plan_invite':
      return s.notifyJoins;
    case 'chat_message':
      return s.notifyChat;
    case 'float_received':
    case 'float_keen':
    case 'float_locked':
      return s.notifyFloats;
    case 'reminder':
      return s.notifyReminders;
    case 'ping':
      return s.pingsEnabled;
    case 'invite':
    case 'friend_accepted':
    case 'squad_invite':
      // Friend social events bypass per-category gating — they're rare
      // and almost always wanted. Master pushEnabled still applies.
      return true;
  }
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
    // WUD Buddy (the built-in test friend) pings back after a beat, so a
    // brand-new user with no real friends sees the full round-trip: their
    // ping lands, then an alert arrives back. Delay keeps it feeling like
    // a reply rather than an echo.
    if (recipientId === BUDDY_ID) {
      setTimeout(() => {
        try {
          createNotification({
            userId: senderId,
            type: 'ping',
            fromId: BUDDY_ID,
            body: '👋 Buddy here — that\'s exactly how pings land for your friends!',
          });
        } catch (err) {
          logger.warn({ err }, '[buddy] ping auto-reply failed');
        }
      }, 1500);
    }
  }
  return delivered;
}
