import { q, tx } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId, now } from '../lib/ids.js';
import { publish } from '../realtime/bus.js';
import type { Activity, CategoryKey, Reaction, Recurrence, RsvpState } from '../types.js';
import { messagesForActivity, sendSystem } from './chat.js';
import { createNotification } from './notifications.js';
import { areFriends, isInSquad } from './social.js';
import { getUserRow } from './users.js';

/* ----- "you are here" point for the Near-me filter (matches the client) ---- */
const YOU_XY: [number, number] = [0.5, 0.5];
const NEAR_RADIUS = 0.3;

interface ActivityRow {
  id: string;
  host_id: string;
  category: string;
  custom_emoji: string | null;
  custom_label: string | null;
  title: string;
  description: string;
  place: string;
  lat: number | null;
  lng: number | null;
  map_x: number | null;
  map_y: number | null;
  starts_at: number;
  max_size: number | null;
  is_private: number;
  is_open_invite: number;
  banner_url: string | null;
  recurrence: string | null;
  reminder_minutes: number | null;
  created_at: number;
  updated_at: number;
  dissolved_at: number | null;
}

/* ===================== serialization ===================== */

function rsvpIds(activityId: string, state: RsvpState): string[] {
  return q.all<{ user_id: string }>(
    'SELECT user_id FROM rsvps WHERE activity_id = ? AND state = ? ORDER BY order_index',
    activityId, state,
  ).map(r => r.user_id);
}

function reactionsFor(activityId: string): Reaction[] {
  return q.all<{ emoji: string; user_id: string; created_at: number }>(
    'SELECT emoji, user_id, created_at FROM reactions WHERE activity_id = ?', activityId,
  ).map(r => ({ emoji: r.emoji, userId: r.user_id, at: r.created_at }));
}

function squadIdsFor(activityId: string): string[] {
  return q.all<{ squad_id: string }>(
    'SELECT squad_id FROM activity_squads WHERE activity_id = ?', activityId,
  ).map(r => r.squad_id);
}

export function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    hostId: row.host_id,
    category: row.category as CategoryKey,
    customEmoji: row.custom_emoji ?? undefined,
    customLabel: row.custom_label ?? undefined,
    title: row.title,
    place: row.place,
    description: row.description,
    startsAt: row.starts_at,
    joinerIds: rsvpIds(row.id, 'going'),
    maybeIds: rsvpIds(row.id, 'maybe'),
    cantIds: rsvpIds(row.id, 'cant'),
    maxSize: row.max_size ?? undefined,
    isPrivate: !!row.is_private,
    squadIds: squadIdsFor(row.id),
    isOpenInvite: !!row.is_open_invite,
    // Storage encoding: NULL = use user default (undefined), -1 = off (null), else the value.
    reminderMins: row.reminder_minutes === null ? undefined
      : row.reminder_minutes === -1 ? null
      : row.reminder_minutes,
    reactions: reactionsFor(row.id),
    bannerUrl: row.banner_url ?? undefined,
    mapX: row.map_x ?? undefined,
    mapY: row.map_y ?? undefined,
    recurrence: row.recurrence ? (JSON.parse(row.recurrence) as Recurrence) : undefined,
    createdAt: row.created_at,
    chat: messagesForActivity(row.id),
  };
}

export function getActivityRow(id: string): ActivityRow | undefined {
  return q.get<ActivityRow>('SELECT * FROM activities WHERE id = ?', id);
}

export function getActivity(id: string): Activity {
  const row = getActivityRow(id);
  if (!row) throw notFound('ACTIVITY_NOT_FOUND', 'Plan not found');
  return toActivity(row);
}

const isPast = (row: ActivityRow): boolean => row.starts_at < now();

/* ===================== visibility (SRS FR-FEED-02) ===================== */

/**
 * Server-authoritative port of the client's `canSeeActivity`.
 *   host → yes · member of any tagged squad → yes ·
 *   open invite → friend-of-host, or (not private) a friend has a `going` RSVP.
 */
export function canSeeActivity(userId: string, row: ActivityRow): boolean {
  if (row.host_id === userId) return true;

  const tagged = squadIdsFor(row.id);
  if (tagged.some(sid => isInSquad(sid, userId))) return true;

  if (row.is_open_invite) {
    if (areFriends(userId, row.host_id)) return true;
    if (row.is_private) return false;
    const goingFriend = rsvpIds(row.id, 'going').some(id => areFriends(userId, id));
    if (goingFriend) return true;
  }
  return false;
}

/** True when the only reason a user can see a plan is the FoF unlock. */
function isFoF(userId: string, row: ActivityRow): boolean {
  if (row.host_id === userId) return false;
  const tagged = squadIdsFor(row.id);
  if (tagged.some(sid => isInSquad(sid, userId))) return false;
  if (areFriends(userId, row.host_id)) return false;
  if (!row.is_open_invite || row.is_private) return false;
  return rsvpIds(row.id, 'going').some(id => areFriends(userId, id));
}

export interface FeedFilters {
  scope?: 'friends' | 'fof';
  category?: CategoryKey;
  timeWindow?: 'now' | 'today' | 'week' | 'all';
  nearMe?: boolean;
}

/** Visible, upcoming activities for the feed, with discovery filters applied. */
export function feedFor(userId: string, filters: FeedFilters = {}): Activity[] {
  const ts = now();
  const HOUR = 3_600_000, DAY = 86_400_000;
  const rows = q.all<ActivityRow>(
    'SELECT * FROM activities WHERE starts_at >= ? AND dissolved_at IS NULL ORDER BY starts_at',
    ts,
  );
  return rows
    .filter(r => canSeeActivity(userId, r))
    .filter(r => (filters.scope === 'friends' ? !isFoF(userId, r) : true))
    .filter(r => !filters.category || r.category === filters.category)
    .filter(r => {
      const dt = r.starts_at - ts;
      if (filters.timeWindow === 'now') return dt <= HOUR;
      if (filters.timeWindow === 'today') return dt <= DAY;
      if (filters.timeWindow === 'week') return dt <= 7 * DAY;
      return true;
    })
    .filter(r => {
      if (!filters.nearMe) return true;
      if (r.map_x == null || r.map_y == null) return false;
      return Math.hypot(r.map_x - YOU_XY[0], r.map_y - YOU_XY[1]) <= NEAR_RADIUS;
    })
    .map(toActivity);
}

/** Whether any visible plan is reachable only via FoF (drives the scope toggle). */
export function hasFoFAvailable(userId: string): boolean {
  return q.all<ActivityRow>(
    'SELECT * FROM activities WHERE starts_at >= ? AND dissolved_at IS NULL', now(),
  ).some(r => canSeeActivity(userId, r) && isFoF(userId, r));
}

/** Past activities the user hosted or RSVP'd to. */
export function historyFor(userId: string): Activity[] {
  const rows = q.all<ActivityRow>(
    `SELECT DISTINCT a.* FROM activities a
       LEFT JOIN rsvps r ON r.activity_id = a.id AND r.user_id = ?
      WHERE a.starts_at < ? AND (a.host_id = ? OR r.user_id = ?)
      ORDER BY a.starts_at DESC`,
    userId, now(), userId, userId,
  );
  return rows.map(toActivity);
}

/* ===================== create ===================== */

export function createActivity(hostId: string, input: {
  category: CategoryKey;
  customEmoji?: string;
  customLabel?: string;
  title: string;
  place?: string;
  description?: string;
  startsAt: number;
  maxSize?: number;
  isPrivate?: boolean;
  isOpenInvite?: boolean;
  bannerUrl?: string;
  recurrence?: Recurrence;
  reminderMins?: number | null;
  squadIds?: string[];
  mapX?: number;
  mapY?: number;
}): Activity {
  const id = newId();
  const ts = now();
  const isCustom = input.category === 'custom';
  // reminderMins → storage: undefined→NULL (default), null→-1 (off), number→value.
  const reminderCol =
    input.reminderMins === undefined ? null
    : input.reminderMins === null ? -1
    : input.reminderMins;
  return tx(() => {
    q.run(
      `INSERT INTO activities
        (id, host_id, category, custom_emoji, custom_label, title, description, place,
         map_x, map_y, starts_at, max_size, is_private, is_open_invite, banner_url,
         recurrence, reminder_minutes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, hostId, input.category,
      isCustom ? (input.customEmoji?.trim() || '✨') : null,
      isCustom ? (input.customLabel?.trim() || 'Custom') : null,
      input.title.trim() || 'Doing a thing',
      input.description?.trim() ?? '',
      input.place?.trim() ?? '',
      input.mapX ?? null, input.mapY ?? null,
      input.startsAt,
      input.maxSize ?? null,
      input.isPrivate ? 1 : 0,
      input.isOpenInvite === false ? 0 : 1,
      input.bannerUrl?.trim() || null,
      input.recurrence ? JSON.stringify(input.recurrence) : null,
      reminderCol,
      ts, ts,
    );
    // Validate + attach squad tags (only squads the host belongs to).
    for (const squadId of new Set(input.squadIds ?? [])) {
      if (isInSquad(squadId, hostId)) {
        q.run('INSERT OR IGNORE INTO activity_squads (activity_id, squad_id) VALUES (?, ?)', id, squadId);
      }
    }
    return getActivity(id);
  });
}

/** Host-only edit of mutable fields before the plan starts. */
export function updateActivity(actorId: string, activityId: string, patch: {
  title?: string; description?: string; place?: string; startsAt?: number;
  maxSize?: number | null; bannerUrl?: string | null;
}): Activity {
  const row = getActivityRow(activityId);
  if (!row) throw notFound('ACTIVITY_NOT_FOUND', 'Plan not found');
  if (row.host_id !== actorId) throw forbidden('Only the host can edit this plan');
  if (isPast(row)) throw conflict('ACTIVITY_OVER', 'This plan has already started');
  q.run(
    `UPDATE activities SET title = ?, description = ?, place = ?, starts_at = ?,
       max_size = ?, banner_url = ?, updated_at = ? WHERE id = ?`,
    patch.title?.trim() || row.title,
    patch.description?.trim() ?? row.description,
    patch.place?.trim() ?? row.place,
    patch.startsAt ?? row.starts_at,
    patch.maxSize === undefined ? row.max_size : patch.maxSize,
    patch.bannerUrl === undefined ? row.banner_url : patch.bannerUrl,
    now(), activityId,
  );
  return emitActivity(activityId);
}

function emitActivity(activityId: string): Activity {
  const activity = getActivity(activityId);
  publish({ channel: `activity:${activityId}`, type: 'activity.updated', data: activity });
  return activity;
}

/* ===================== RSVP ===================== */

/** Is the user a participant (host or `going`) — used for chat authorization. */
export function isParticipant(userId: string, activityId: string): boolean {
  const row = getActivityRow(activityId);
  if (!row) return false;
  if (row.host_id === userId) return true;
  return !!q.get(
    "SELECT 1 FROM rsvps WHERE activity_id = ? AND user_id = ? AND state = 'going'",
    activityId, userId,
  );
}

/**
 * Set the user's RSVP. `state === 'none'` clears it. Enforces: not-past,
 * not-host, max-size cap on `going`. Sends a `join` notification to the host
 * on a fresh `going`.
 */
export function setRsvp(userId: string, activityId: string, state: RsvpState | 'none'): Activity {
  const row = getActivityRow(activityId);
  if (!row) throw notFound('ACTIVITY_NOT_FOUND', 'Plan not found');
  if (isPast(row)) throw conflict('RSVP_ACTIVITY_OVER', 'This plan has already started');
  if (row.host_id === userId) throw badRequest('HOST_NO_RSVP', 'You are hosting this plan');

  return tx(() => {
    const existing = q.get<{ state: RsvpState }>(
      'SELECT state FROM rsvps WHERE activity_id = ? AND user_id = ?', activityId, userId,
    );
    if (existing?.state === state) return getActivity(activityId);  // no-op

    if (state === 'going' && row.max_size != null && existing?.state !== 'going') {
      // Party size = 1 host + current `going` joiners. Reject if already at the cap.
      const goingCount = q.get<{ n: number }>(
        "SELECT COUNT(*) n FROM rsvps WHERE activity_id = ? AND state = 'going'", activityId,
      )!.n;
      if (1 + goingCount >= row.max_size) {
        throw conflict('ACTIVITY_FULL', 'This plan is full');
      }
    }

    q.run('DELETE FROM rsvps WHERE activity_id = ? AND user_id = ?', activityId, userId);
    if (state !== 'none') {
      const maxOrder = q.get<{ m: number | null }>(
        'SELECT MAX(order_index) m FROM rsvps WHERE activity_id = ?', activityId,
      )!.m ?? 0;
      const ts = now();
      q.run(
        `INSERT INTO rsvps (activity_id, user_id, state, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        activityId, userId, state, maxOrder + 1, ts, ts,
      );
      if (state === 'going' && existing?.state !== 'going') {
        const me = getUserRow(userId);
        createNotification({
          userId: row.host_id, type: 'join', fromId: userId, activityId,
          body: `${me?.name ?? 'Someone'} is going to "${row.title}"`,
        });
      }
    }
    publish({ channel: `activity:${activityId}`, type: 'rsvp.changed', data: { activityId, userId, state } });
    return getActivity(activityId);
  });
}

/**
 * Leave an activity. A non-host simply clears their RSVP. A host triggers
 * succession: the earliest `going` joiner is promoted; if none, the plan
 * dissolves (SRS FR-ACT-08 / FR-ACT-09).
 */
export function leaveActivity(userId: string, activityId: string): { dissolved: boolean; activity?: Activity } {
  const row = getActivityRow(activityId);
  if (!row) throw notFound('ACTIVITY_NOT_FOUND', 'Plan not found');
  if (isPast(row)) throw conflict('ACTIVITY_OVER', 'This plan is over');

  if (row.host_id !== userId) {
    setRsvp(userId, activityId, 'none');
    return { dissolved: false, activity: getActivity(activityId) };
  }

  // Host is leaving — find the successor under a transaction with row locking
  // semantics (single-writer SQLite makes this atomic).
  return tx(() => {
    const next = q.get<{ user_id: string }>(
      "SELECT user_id FROM rsvps WHERE activity_id = ? AND state = 'going' ORDER BY order_index LIMIT 1",
      activityId,
    );
    if (!next) {
      q.run('UPDATE activities SET dissolved_at = ?, updated_at = ? WHERE id = ?', now(), now(), activityId);
      publish({ channel: `activity:${activityId}`, type: 'activity.updated', data: { id: activityId, dissolved: true } });
      return { dissolved: true };
    }
    // Promote: new host, drop their RSVP row.
    q.run('UPDATE activities SET host_id = ?, updated_at = ? WHERE id = ?', next.user_id, now(), activityId);
    q.run('DELETE FROM rsvps WHERE activity_id = ? AND user_id = ?', activityId, next.user_id);

    const oldHost = getUserRow(userId);
    const newHost = getUserRow(next.user_id);
    sendSystem(
      { activityId },
      `${oldHost?.name ?? 'The host'} left — ${newHost?.name ?? 'a joiner'} is now hosting.`,
    );
    // Notify the new host. type host_offer so the client shows the crown card;
    // accepting confirms, declining triggers a fresh transfer.
    createNotification({
      userId: next.user_id, type: 'host_offer', fromId: userId, activityId,
      body: `You're now hosting "${row.title}". Tap to confirm or pass it on.`,
    });
    publish({ channel: `activity:${activityId}`, type: 'host.transferred', data: { activityId, newHostId: next.user_id } });
    return { dissolved: false, activity: getActivity(activityId) };
  });
}

/* ===================== reactions ===================== */

/** Toggle the user's single emoji reaction on an activity. */
export function toggleReaction(userId: string, activityId: string, emoji: string): Activity {
  const row = getActivityRow(activityId);
  if (!row) throw notFound('ACTIVITY_NOT_FOUND', 'Plan not found');
  tx(() => {
    const mine = q.get<{ emoji: string }>(
      'SELECT emoji FROM reactions WHERE activity_id = ? AND user_id = ?', activityId, userId,
    );
    q.run('DELETE FROM reactions WHERE activity_id = ? AND user_id = ?', activityId, userId);
    if (!mine || mine.emoji !== emoji) {
      q.run(
        'INSERT INTO reactions (activity_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)',
        activityId, userId, emoji, now(),
      );
    }
  });
  const activity = getActivity(activityId);
  publish({ channel: `activity:${activityId}`, type: 'reaction.changed', data: { activityId } });
  return activity;
}
