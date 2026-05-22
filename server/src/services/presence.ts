import { q } from '../db/index.js';
import { now } from '../lib/ids.js';
import { publish } from '../realtime/bus.js';
import type { LiveStatus } from '../types.js';

interface LiveRow {
  user_id: string;
  emoji: string;
  text: string;
  place: string | null;
  open_to_join: number;
  started_at: number;
  expires_at: number;
}

function toLive(r: LiveRow): LiveStatus {
  return {
    emoji: r.emoji,
    text: r.text,
    place: r.place ?? undefined,
    openToJoin: !!r.open_to_join,
    startedAt: r.started_at,
    expiresAt: r.expires_at,
  };
}

/** A user's live status, or null if none / expired. */
export function getLiveStatus(userId: string): LiveStatus | null {
  const r = q.get<LiveRow>('SELECT * FROM live_statuses WHERE user_id = ?', userId);
  if (!r) return null;
  if (r.expires_at <= now()) return null;        // lazily ignore the expired row
  return toLive(r);
}

/** Set / replace the user's live status. */
export function setLiveStatus(
  userId: string,
  input: { emoji: string; text: string; place?: string; openToJoin?: boolean; durationMins: number },
): LiveStatus {
  const ts = now();
  const expiresAt = ts + Math.max(1, input.durationMins) * 60_000;
  q.run(
    `INSERT INTO live_statuses (user_id, emoji, text, place, open_to_join, started_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       emoji = excluded.emoji, text = excluded.text, place = excluded.place,
       open_to_join = excluded.open_to_join, started_at = excluded.started_at,
       expires_at = excluded.expires_at`,
    userId,
    input.emoji.trim() || '✨',
    input.text.trim() || 'doing a thing',
    input.place?.trim() || null,
    input.openToJoin ? 1 : 0,
    ts,
    expiresAt,
  );
  publish({ channel: 'presence:friends', type: 'presence.changed', data: { userId } });
  return getLiveStatus(userId)!;
}

export function clearLiveStatus(userId: string): void {
  q.run('DELETE FROM live_statuses WHERE user_id = ?', userId);
  publish({ channel: 'presence:friends', type: 'presence.changed', data: { userId } });
}

/** Delete every expired live status. Returns the count purged (scheduler job). */
export function purgeExpiredLiveStatuses(): number {
  const before = q.get<{ n: number }>('SELECT COUNT(*) n FROM live_statuses WHERE expires_at <= ?', now());
  q.run('DELETE FROM live_statuses WHERE expires_at <= ?', now());
  const purged = before?.n ?? 0;
  if (purged > 0) {
    publish({ channel: 'presence:friends', type: 'presence.changed', data: { purged } });
  }
  return purged;
}
