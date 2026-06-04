import { config } from './config.js';
import { q } from './db/index.js';
import { logger } from './lib/logger.js';
import { newId, now } from './lib/ids.js';
import { createNotification, purgeStaleNotifications } from './services/notifications.js';
import { getSettings } from './services/users.js';

/**
 * Background scheduler (SRS §7.2). A single timer drives two jobs:
 *   • reminder dispatch     — notify participants before a plan starts
 *   • recurrence rollover   — materialize the next occurrence of recurring plans
 *
 * Production would use a durable queue with per-job cadence; one timer is
 * sufficient and observable for the mockup scale.
 */

/* --- reminders ------------------------------------------------------------ */

interface ActivityLite {
  id: string;
  host_id: string;
  title: string;
  starts_at: number;
  reminder_minutes: number | null;
}

/** Effective reminder lead (minutes) for a (user, activity); null = no reminder. */
function effectiveLead(activity: ActivityLite, userId: string): number | null {
  // -1 = explicitly off; NULL = fall back to the user's default.
  if (activity.reminder_minutes === -1) return null;
  if (activity.reminder_minutes !== null) return activity.reminder_minutes;
  return getSettings(userId).defaultReminderMins; // may itself be null (off)
}

function runReminders(): void {
  const ts = now();
  const horizon = ts + 60 * 60 * 1000; // only look at plans starting within the next hour
  const upcoming = q.all<ActivityLite>(
    `SELECT id, host_id, title, starts_at, reminder_minutes
       FROM activities
      WHERE dissolved_at IS NULL AND starts_at > ? AND starts_at <= ?`,
    ts, horizon,
  );

  for (const a of upcoming) {
    // Participants = host + everyone with a `going` RSVP.
    const participants = [
      a.host_id,
      ...q.all<{ user_id: string }>(
        "SELECT user_id FROM rsvps WHERE activity_id = ? AND state = 'going'", a.id,
      ).map(r => r.user_id),
    ];
    for (const userId of participants) {
      const lead = effectiveLead(a, userId);
      if (lead === null) continue;
      const windowStart = a.starts_at - lead * 60 * 1000;
      if (ts < windowStart) continue;                           // too early

      // Idempotency — fire at most once per (user, activity).
      const already = q.get(
        'SELECT 1 FROM reminder_log WHERE user_id = ? AND activity_id = ?', userId, a.id,
      );
      if (already) continue;
      if (!getSettings(userId).pushEnabled) continue;

      q.run(
        'INSERT INTO reminder_log (user_id, activity_id, fired_at) VALUES (?, ?, ?)',
        userId, a.id, ts,
      );
      const mins = Math.max(1, Math.round((a.starts_at - ts) / 60000));
      createNotification({
        userId, type: 'reminder', fromId: a.host_id, activityId: a.id,
        body: `"${a.title}" starts in ${mins}m`,
      });
    }
  }
}

/* --- recurrence rollover -------------------------------------------------- */

const WEEK = 7 * 86_400_000;
const DAY = 86_400_000;

/**
 * For each recurring activity whose start time is in the past, create the next
 * occurrence (a fresh activity) so the series keeps rolling. Only one future
 * occurrence per series is kept materialized at a time.
 */
function runRecurrence(): void {
  const ts = now();
  const recurring = q.all<{
    id: string; host_id: string; category: string; custom_emoji: string | null;
    custom_label: string | null; title: string; description: string; place: string;
    starts_at: number; ends_at: number; max_size: number | null;
    is_private: number; is_open_invite: number; banner_url: string | null;
    recurrence: string; reminder_minutes: number | null;
  }>(
    `SELECT * FROM activities
      WHERE recurrence IS NOT NULL AND dissolved_at IS NULL AND ends_at < ?`,
    ts,
  );

  for (const a of recurring) {
    const rule = JSON.parse(a.recurrence) as { freq: string; weekday?: number };
    const step = rule.freq === 'daily' ? DAY : rule.freq === 'biweekly' ? 2 * WEEK : WEEK;

    // Advance from the old start until it lands in the future. The new
    // ends_at slides by the same delta so the duration of each occurrence
    // matches the original.
    let nextStart = a.starts_at;
    while (nextStart < ts) nextStart += step;
    const nextEnd = a.ends_at + (nextStart - a.starts_at);

    // Skip if a future occurrence of this title+host already exists.
    const exists = q.get(
      'SELECT 1 FROM activities WHERE host_id = ? AND title = ? AND starts_at >= ? AND recurrence IS NOT NULL',
      a.host_id, a.title, ts,
    );
    if (exists) continue;

    // Materialize the next occurrence; the old one stops recurring (recurrence cleared).
    q.run('UPDATE activities SET recurrence = NULL WHERE id = ?', a.id);
    const id = newId();
    q.run(
      `INSERT INTO activities
        (id, host_id, category, custom_emoji, custom_label, title, description, place,
         starts_at, ends_at, max_size, is_private, is_open_invite, banner_url,
         recurrence, reminder_minutes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, a.host_id, a.category, a.custom_emoji, a.custom_label, a.title, a.description,
      a.place, nextStart, nextEnd, a.max_size, a.is_private, a.is_open_invite,
      a.banner_url, a.recurrence, a.reminder_minutes, ts, ts,
    );
    // Carry forward the squad tags.
    for (const r of q.all<{ squad_id: string }>(
      'SELECT squad_id FROM activity_squads WHERE activity_id = ?', a.id,
    )) {
      q.run('INSERT OR IGNORE INTO activity_squads (activity_id, squad_id) VALUES (?, ?)', id, r.squad_id);
    }
  }
}

/* --- tick ----------------------------------------------------------------- */

let timer: ReturnType<typeof setInterval> | null = null;

/** Notifications older than this drop off automatically — they're rarely
 *  actionable past a week and clutter the inbox. The user can still wipe
 *  the full list manually via the "Clear all" button. */
const NOTIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function startScheduler(): void {
  const tick = () => {
    try {
      runReminders();
      runRecurrence();
      const purged = purgeStaleNotifications(NOTIFICATION_TTL_MS);
      if (purged > 0) {
        logger.info({ purged }, '[scheduler] purged stale notifications');
      }
    } catch (err) {
      logger.error({ err }, '[scheduler] tick failed');
    }
  };
  tick(); // run once at startup
  timer = setInterval(tick, config.schedulerIntervalMs);
  logger.info(`[scheduler] running every ${config.schedulerIntervalMs / 1000}s`);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
