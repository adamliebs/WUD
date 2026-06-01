import { q, tx } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId, now } from '../lib/ids.js';
import { logger } from '../lib/logger.js';
import { publish } from '../realtime/bus.js';
import type { Activity, CategoryKey, Reaction, Recurrence, RsvpState } from '../types.js';
import { messagesForActivity, sendSystem } from './chat.js';
import { createNotification } from './notifications.js';
import { isBlockedEither } from './safety.js';
import { areFriends, friendIds, isInSquad, squadEveryoneIds } from './social.js';
import { getUserRow } from './users.js';

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
  starts_at: number;
  ends_at: number;
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
    endsAt: row.ends_at,
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

/** An activity is "past" only once its END time has elapsed. A live event
 *  (started, still in its window) is current, not past. */
const isPast = (row: ActivityRow): boolean => row.ends_at < now();

/* ===================== visibility (SRS FR-FEED-02) ===================== */

/**
 * Server-authoritative port of the client's `canSeeActivity`.
 *   host → yes · member of any tagged squad → yes ·
 *   open invite → friend-of-host, or (not private) a friend has a `going` RSVP.
 */
export function canSeeActivity(userId: string, row: ActivityRow): boolean {
  if (row.host_id === userId) return true;
  // Blocks hide both directions — if either party has blocked the other, the
  // host's plans must disappear from the viewer's world (Apple Guideline 1.2).
  if (isBlockedEither(userId, row.host_id)) return false;

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
}

/** Visible, current+upcoming activities for the feed. Live (started but
 *  not ended) activities stay visible so they don't drop out of the feed
 *  the moment they start — they migrate to the live strip and the main
 *  list as the user's home page picks them up. */
export function feedFor(userId: string, filters: FeedFilters = {}): Activity[] {
  const ts = now();
  const HOUR = 3_600_000, DAY = 86_400_000;
  const rows = q.all<ActivityRow>(
    'SELECT * FROM activities WHERE ends_at >= ? AND dissolved_at IS NULL ORDER BY starts_at',
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
    .map(toActivity);
}

/** Whether any visible plan is reachable only via FoF (drives the scope toggle). */
export function hasFoFAvailable(userId: string): boolean {
  return q.all<ActivityRow>(
    'SELECT * FROM activities WHERE ends_at >= ? AND dissolved_at IS NULL', now(),
  ).some(r => canSeeActivity(userId, r) && isFoF(userId, r));
}

/** Past activities the user hosted or RSVP'd to. An activity only counts as
 *  history once its end window has fully passed. */
export function historyFor(userId: string): Activity[] {
  const rows = q.all<ActivityRow>(
    `SELECT DISTINCT a.* FROM activities a
       LEFT JOIN rsvps r ON r.activity_id = a.id AND r.user_id = ?
      WHERE a.ends_at < ? AND (a.host_id = ? OR r.user_id = ?)
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
  /** Required. Must be strictly after startsAt. Activities without an end
   *  time aren't supported — clients pick a chip ("1h"/"2h"/etc.) for the
   *  "Happening now" mode or a full picker for scheduled. */
  endsAt: number;
  maxSize?: number;
  isPrivate?: boolean;
  isOpenInvite?: boolean;
  bannerUrl?: string;
  recurrence?: Recurrence;
  reminderMins?: number | null;
  squadIds?: string[];
  /** User ids to auto-RSVP as `going` right after creation. Used by the
   *  floats lock-in flow so a float's "keen" responders land in the new plan
   *  without a second tap. Each id is re-checked against blocks before
   *  inserting the RSVP — a keen who's since blocked the host (or vice versa)
   *  silently drops out. */
  prefilledGoingIds?: string[];
}): Activity {
  if (!Number.isFinite(input.endsAt) || input.endsAt <= input.startsAt) {
    throw badRequest('INVALID_END_TIME', 'End time must be after start time', 'endsAt');
  }
  const id = newId();
  const ts = now();
  const isCustom = input.category === 'custom';
  // reminderMins → storage: undefined→NULL (default), null→-1 (off), number→value.
  const reminderCol =
    input.reminderMins === undefined ? null
    : input.reminderMins === null ? -1
    : input.reminderMins;
  const created = tx(() => {
    q.run(
      `INSERT INTO activities
        (id, host_id, category, custom_emoji, custom_label, title, description, place,
         starts_at, ends_at, max_size, is_private, is_open_invite, banner_url,
         recurrence, reminder_minutes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, hostId, input.category,
      isCustom ? (input.customEmoji?.trim() || '✨') : null,
      isCustom ? (input.customLabel?.trim() || 'Custom') : null,
      input.title.trim() || 'Doing a thing',
      input.description?.trim() ?? '',
      input.place?.trim() ?? '',
      input.startsAt,
      input.endsAt,
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
    // Prefilled going RSVPs (from floats lock-in). Order them sequentially so
    // they get stable order_index values matching the order they were keen.
    let prefillOrder = 1;
    for (const userId of new Set(input.prefilledGoingIds ?? [])) {
      if (userId === hostId) continue;
      if (isBlockedEither(hostId, userId)) continue;
      q.run(
        `INSERT OR IGNORE INTO rsvps (activity_id, user_id, state, order_index, created_at, updated_at)
         VALUES (?, ?, 'going', ?, ?, ?)`,
        id, userId, prefillOrder++, ts, ts,
      );
    }
    return getActivity(id);
  });
  // Post-commit side effects (realtime fan-out + notification fan-out) are
  // best-effort. The activity is already persisted in the TX above; if
  // anything in here throws we'd 500 the user's POST and they'd see the plan
  // they just created vanish into "something went wrong". Wrap in try/catch
  // so failures here surface only in logs.
  try {
    const row = getActivityRow(id);
    if (row) {
      publishFeedChange(row, 'created');
      // In-app notification fan-out: direct friends of the host only — squad
      // members and FoF discover via the realtime feed.changed event.
      const host = getUserRow(hostId);
      const hostName = host?.name ?? 'Someone';
      const isLive = row.starts_at <= ts && ts <= row.ends_at;
      const body = isLive
        ? `${hostName} is live: "${row.title}"`
        : `${hostName} posted a plan: "${row.title}"`;
      for (const friendId of friendIds(hostId)) {
        if (!canSeeActivity(friendId, row)) continue;
        createNotification({
          userId: friendId,
          type: 'activity_created',
          fromId: hostId,
          activityId: id,
          body,
        });
      }
    }
  } catch (err) {
    logger.warn({ err, activityId: id }, '[createActivity] post-commit side effects failed');
  }
  return created;
}

/**
 * Edit mutable fields. Most fields are host-only; the per-plan `reminderMins`
 * can be set by any participant (it's that user's own reminder preference) and
 * is allowed even after the plan starts is disallowed — reminders only matter
 * before. Storage encoding for reminderMins: undefined→NULL, null→-1, n→n.
 */
export function updateActivity(actorId: string, activityId: string, patch: {
  title?: string; description?: string; place?: string;
  startsAt?: number; endsAt?: number;
  maxSize?: number | null; bannerUrl?: string | null;
  isPrivate?: boolean;
  isOpenInvite?: boolean;
  /** Full new squad tag set — drives a delete+reinsert of activity_squads.
   *  Omit to leave tags untouched. Each id must be a squad the host belongs to. */
  squadIds?: string[];
  // 'default' clears the override (use the user's default), 'off' disables it.
  reminderMins?: number | 'default' | 'off';
  /** Change the plan's category. customEmoji + customLabel only apply when
   *  the new category is 'custom'; for built-in categories the server clears
   *  the per-row custom fields so the category's default emoji/label win. */
  category?: CategoryKey;
  customEmoji?: string;
  customLabel?: string;
}): Activity {
  const row = getActivityRow(activityId);
  if (!row) throw notFound('ACTIVITY_NOT_FOUND', 'Plan not found');

  const reminderOnly =
    patch.title === undefined && patch.description === undefined && patch.place === undefined &&
    patch.startsAt === undefined && patch.endsAt === undefined &&
    patch.maxSize === undefined && patch.bannerUrl === undefined &&
    patch.isPrivate === undefined && patch.isOpenInvite === undefined &&
    patch.squadIds === undefined &&
    patch.category === undefined && patch.customEmoji === undefined && patch.customLabel === undefined;

  // Host-only for content edits; participants may tweak only their reminder.
  if (!reminderOnly && row.host_id !== actorId) {
    throw forbidden('Only the host can edit this plan');
  }
  if (!reminderOnly && isPast(row)) {
    throw conflict('ACTIVITY_OVER', 'This plan has already ended');
  }

  // Plans currently in their window may extend or shorten via endsAt, but the
  // start time is fixed once the plan is live — moving it would either rewrite
  // history or pretend the plan never started yet.
  const ts = now();
  const isLive = row.starts_at <= ts && ts <= row.ends_at;
  if (isLive && patch.startsAt !== undefined && patch.startsAt !== row.starts_at) {
    throw conflict('ACTIVITY_LIVE_START_LOCKED',
      'Start time is locked once a plan is live. You can still adjust the end time.');
  }

  // Validate that any new time window stays end-after-start. Use the patched
  // value if present, else the existing row's value.
  const nextStarts = patch.startsAt ?? row.starts_at;
  const nextEnds   = patch.endsAt   ?? row.ends_at;
  if (nextEnds <= nextStarts) {
    throw badRequest('INVALID_END_TIME', 'End time must be after start time', 'endsAt');
  }

  const reminderCol =
    patch.reminderMins === undefined ? row.reminder_minutes  // unchanged
    : patch.reminderMins === 'default' ? null                // clear override
    : patch.reminderMins === 'off' ? -1                      // disabled
    : patch.reminderMins;                                    // explicit lead

  // Capture viewers BEFORE the update so we can also tell anyone who's about
  // to lose visibility (squad-untag, privacy flip) to refetch — emitActivity
  // only fans to the new viewer set.
  const oldViewers = new Set<string>(viewerIdsForRow(row));

  // Resolve the new category + custom fields. When switching INTO 'custom'
  // the patch should carry customEmoji + customLabel; when switching OUT
  // we clear the per-row custom fields so the category's defaults win.
  const nextCategory = patch.category ?? (row.category as CategoryKey);
  const isCustomNext = nextCategory === 'custom';
  const nextCustomEmoji =
    !isCustomNext ? null
    : (patch.customEmoji?.trim() ?? row.custom_emoji ?? '✨');
  const nextCustomLabel =
    !isCustomNext ? null
    : (patch.customLabel?.trim() ?? row.custom_label ?? 'Custom');

  tx(() => {
    q.run(
      `UPDATE activities SET category = ?, custom_emoji = ?, custom_label = ?,
         title = ?, description = ?, place = ?, starts_at = ?, ends_at = ?,
         max_size = ?, banner_url = ?, is_private = ?, is_open_invite = ?,
         reminder_minutes = ?, updated_at = ? WHERE id = ?`,
      nextCategory,
      nextCustomEmoji,
      nextCustomLabel,
      patch.title?.trim() || row.title,
      patch.description?.trim() ?? row.description,
      patch.place?.trim() ?? row.place,
      nextStarts,
      nextEnds,
      patch.maxSize === undefined ? row.max_size : patch.maxSize,
      patch.bannerUrl === undefined ? row.banner_url : patch.bannerUrl,
      patch.isPrivate === undefined ? row.is_private : (patch.isPrivate ? 1 : 0),
      patch.isOpenInvite === undefined ? row.is_open_invite : (patch.isOpenInvite ? 1 : 0),
      reminderCol,
      ts, activityId,
    );
    // Replace squad tags wholesale when a new set is provided. Validation
    // mirrors createActivity — only squads the host is in are honored.
    if (patch.squadIds !== undefined) {
      q.run('DELETE FROM activity_squads WHERE activity_id = ?', activityId);
      for (const squadId of new Set(patch.squadIds)) {
        if (isInSquad(squadId, row.host_id)) {
          q.run('INSERT OR IGNORE INTO activity_squads (activity_id, squad_id) VALUES (?, ?)', activityId, squadId);
        }
      }
    }
  });

  // Detect material changes worth notifying participants about. Time +
  // place are the load-bearing ones — if start moves, people need to
  // re-plan their evening. Everything else (title tweak, description, max
  // size, banner) doesn't warrant a push.
  const newRow = getActivityRow(activityId)!;
  const startsChanged = newRow.starts_at !== row.starts_at;
  const endsChanged   = newRow.ends_at   !== row.ends_at;
  const placeChanged  = (newRow.place ?? '') !== (row.place ?? '');
  if (!reminderOnly && (startsChanged || endsChanged || placeChanged)) {
    const host = getUserRow(newRow.host_id);
    const hostName = host?.name ?? 'The host';
    const changes: string[] = [];
    if (startsChanged) changes.push('time');
    if (!startsChanged && endsChanged) changes.push('end time');
    if (placeChanged) changes.push('place');
    const changeLabel = changes.join(' + ');
    const body = `${hostName} updated the ${changeLabel} for "${newRow.title}"`;
    const participants = q.all<{ user_id: string }>(
      "SELECT user_id FROM rsvps WHERE activity_id = ? AND state IN ('going','maybe')",
      activityId,
    );
    for (const p of participants) {
      if (p.user_id === actorId) continue;
      createNotification({
        userId: p.user_id,
        type: 'activity_updated',
        fromId: newRow.host_id,
        activityId,
        body,
      });
    }
  }

  // Push feed.changed to viewers who lost visibility (squad-untag, privacy
  // flipped, etc.) before letting emitActivity push to the new viewer set.
  const newViewers = new Set<string>(viewerIdsForRow(newRow));
  for (const viewerId of oldViewers) {
    if (!newViewers.has(viewerId)) {
      publish({
        channel: `user:${viewerId}`,
        type: 'feed.changed',
        data: { activityId, reason: 'updated' },
      });
    }
  }
  return emitActivity(activityId);
}

function emitActivity(activityId: string): Activity {
  const activity = getActivity(activityId);
  publish({ channel: `activity:${activityId}`, type: 'activity.updated', data: activity });
  // The set of plans visible to each potential viewer can shift on edit (time
  // window, squad tags, privacy flag), so nudge every plausible viewer to
  // refetch their feed alongside the activity-level update.
  const row = getActivityRow(activityId);
  if (row) publishFeedChange(row, 'updated');
  return activity;
}

/**
 * Every user who can currently see this activity. Used to fan out feed.changed
 * pushes on create/update/dissolve so a brand-new plan appears on a friend's
 * home screen without them having to refresh. The candidate set is the host,
 * friends-of-host, members of any tagged squad, and (for open + non-private)
 * friends of anyone already going — then narrowed by canSeeActivity so
 * blocked pairs drop out.
 */
function viewerIdsForRow(row: ActivityRow): string[] {
  const viewers = new Set<string>([row.host_id]);
  for (const fid of friendIds(row.host_id)) viewers.add(fid);
  for (const sid of squadIdsFor(row.id)) {
    for (const uid of squadEveryoneIds(sid)) viewers.add(uid);
  }
  if (row.is_open_invite && !row.is_private) {
    for (const id of rsvpIds(row.id, 'going')) {
      for (const fid of friendIds(id)) viewers.add(fid);
    }
  }
  return [...viewers].filter(uid => canSeeActivity(uid, row));
}

function publishFeedChange(row: ActivityRow, reason: 'created' | 'updated' | 'removed'): void {
  for (const viewerId of viewerIdsForRow(row)) {
    publish({
      channel: `user:${viewerId}`,
      type: 'feed.changed',
      data: { activityId: row.id, reason },
    });
  }
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
    // Friend-of-friend visibility hinges on whether a friend has a `going`
    // RSVP, so a transition across the going boundary on an open + non-private
    // plan can newly grant or revoke visibility for the RSVPer's friends. Fan
    // feed.changed to each of those friends so they pick the plan up (or drop
    // it) without a manual refresh.
    const wasGoing = existing?.state === 'going';
    const nowGoing = state === 'going';
    if (wasGoing !== nowGoing && row.is_open_invite && !row.is_private) {
      for (const fid of friendIds(userId)) {
        publish({
          channel: `user:${fid}`,
          type: 'feed.changed',
          data: { activityId, reason: 'rsvp' },
        });
      }
    }
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
      // Fan out a feed.changed so viewers drop the dissolved plan without
      // having to refresh.
      publishFeedChange(row, 'removed');
      // Tell everyone who'd RSVP'd in any state that the plan is gone. The
      // going/maybe/cant trio captures everyone with active interest; the
      // host themselves is the actor and doesn't need to be told.
      const host = getUserRow(userId);
      const hostName = host?.name ?? 'The host';
      const participants = q.all<{ user_id: string }>(
        "SELECT user_id FROM rsvps WHERE activity_id = ? AND state IN ('going','maybe','cant')",
        activityId,
      );
      for (const p of participants) {
        if (p.user_id === userId) continue;
        createNotification({
          userId: p.user_id,
          type: 'activity_cancelled',
          fromId: userId,
          activityId,
          body: `${hostName} cancelled "${row.title}"`,
        });
      }
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
