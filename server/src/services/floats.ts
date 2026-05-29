/**
 * Floats — soft proposals before plans. See migration 0006 for the storage
 * shape and motivation. This service handles create / list / respond / lock /
 * delete plus a viewer-set helper that mirrors the activity-side
 * `viewerIdsForRow` so we can push feed-style realtime updates.
 */

import { q, tx } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId, now } from '../lib/ids.js';
import { logger } from '../lib/logger.js';
import { publish } from '../realtime/bus.js';
import type { CategoryKey, Float, FloatResponse, FloatResponseState, FloatTiming } from '../types.js';
import { createActivity } from './activities.js';
import { createNotification } from './notifications.js';
import { isBlockedEither } from './safety.js';
import { areFriends, friendIds, isInSquad, squadEveryoneIds } from './social.js';
import { getUserRow } from './users.js';

/**
 * Wrap createNotification so a notification-side failure never breaks the
 * user-facing action that triggered it. Notifications are best-effort — if
 * the row can't be written (schema drift, push pipeline error, etc.) the
 * underlying respond/lock/create should still succeed and the client should
 * see "OK, your response was recorded" instead of "something went wrong."
 */
function safeNotify(input: Parameters<typeof createNotification>[0]): void {
  try {
    createNotification(input);
  } catch (err) {
    logger.warn({ err, type: input.type, userId: input.userId }, '[floats] notification failed (non-fatal)');
  }
}

interface FloatRow {
  id: string;
  sender_id: string;
  question: string;
  emoji: string | null;
  place: string | null;
  timing: FloatTiming | null;
  is_open_invite: number;
  is_private: number;
  created_at: number;
  expires_at: number;
  locked_into_activity_id: string | null;
  deleted_at: number | null;
}

/* ---- serialization ---- */

function responsesFor(floatId: string): FloatResponse[] {
  return q.all<{ user_id: string; state: FloatResponseState; updated_at: number }>(
    'SELECT user_id, state, updated_at FROM float_responses WHERE float_id = ?', floatId,
  ).map(r => ({ userId: r.user_id, state: r.state, at: r.updated_at }));
}

function squadIdsFor(floatId: string): string[] {
  return q.all<{ squad_id: string }>(
    'SELECT squad_id FROM float_squads WHERE float_id = ?', floatId,
  ).map(r => r.squad_id);
}

export function toFloat(row: FloatRow): Float {
  return {
    id: row.id,
    senderId: row.sender_id,
    question: row.question,
    emoji: row.emoji ?? undefined,
    place: row.place ?? undefined,
    timing: row.timing ?? undefined,
    isOpenInvite: !!row.is_open_invite,
    isPrivate: !!row.is_private,
    squadIds: squadIdsFor(row.id),
    responses: responsesFor(row.id),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lockedIntoActivityId: row.locked_into_activity_id ?? undefined,
  };
}

function getFloatRow(id: string): FloatRow | undefined {
  return q.get<FloatRow>(
    'SELECT * FROM floats WHERE id = ? AND deleted_at IS NULL', id,
  );
}

export function getFloat(id: string): Float {
  const row = getFloatRow(id);
  if (!row) throw notFound('FLOAT_NOT_FOUND', 'Float not found');
  return toFloat(row);
}

/* ---- visibility ---- */

/** Server port of "who can see this float." Mirrors canSeeActivity rules. */
export function canSeeFloat(userId: string, row: FloatRow): boolean {
  if (row.sender_id === userId) return true;
  if (isBlockedEither(userId, row.sender_id)) return false;

  const tagged = squadIdsFor(row.id);
  if (tagged.some(sid => isInSquad(sid, userId))) return true;

  if (row.is_open_invite) {
    if (areFriends(userId, row.sender_id)) return true;
    // FoF unlock: any responder that's keen + my friend grants visibility.
    if (!row.is_private) {
      const keenFriend = q.get<{ user_id: string }>(
        `SELECT fr.user_id FROM float_responses fr
          WHERE fr.float_id = ? AND fr.state = 'keen'
            AND fr.user_id IN (SELECT user_a FROM friendships WHERE user_b = ?
                               UNION SELECT user_b FROM friendships WHERE user_a = ?)
          LIMIT 1`,
        row.id, userId, userId,
      );
      if (keenFriend) return true;
    }
  }
  return false;
}

/** Everyone who could plausibly see this float — used for realtime fan-out. */
function viewerIdsForRow(row: FloatRow): string[] {
  const viewers = new Set<string>([row.sender_id]);
  if (row.is_open_invite) {
    for (const fid of friendIds(row.sender_id)) viewers.add(fid);
  }
  for (const sid of squadIdsFor(row.id)) {
    for (const uid of squadEveryoneIds(sid)) viewers.add(uid);
  }
  if (row.is_open_invite && !row.is_private) {
    // friends of any "keen" responder
    const keen = q.all<{ user_id: string }>(
      "SELECT user_id FROM float_responses WHERE float_id = ? AND state = 'keen'",
      row.id,
    );
    for (const r of keen) for (const fid of friendIds(r.user_id)) viewers.add(fid);
  }
  return [...viewers].filter(uid => canSeeFloat(uid, row));
}

/* ---- realtime fan-out ----
 *
 * Floats reuse the existing `user:<id>` channels (the gateway auto-subscribes
 * every connected user to their own). One event type — `float.changed` —
 * tells viewers "refetch your floats." Keeping it generic avoids per-action
 * channel proliferation; the client just re-pulls the list.
 */
function publishFloatChange(row: FloatRow, reason: 'created' | 'updated' | 'removed' | 'locked'): void {
  for (const viewerId of viewerIdsForRow(row)) {
    publish({
      channel: `user:${viewerId}`,
      type: 'float.changed',
      data: { floatId: row.id, reason },
    });
  }
}

/* ---- list ---- */

/** Active + recently-expired floats the user can see. Recently-expired
 *  (last 24h) come back too so users can re-float ideas that didn't catch. */
export function floatsFor(userId: string): Float[] {
  const ts = now();
  const STALE_AFTER = 24 * 60 * 60 * 1000;
  const rows = q.all<FloatRow>(
    `SELECT * FROM floats
      WHERE deleted_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC`,
    ts - STALE_AFTER,
  );
  return rows.filter(r => canSeeFloat(userId, r)).map(toFloat);
}

/* ---- create ---- */

const DEFAULT_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 hours

export function createFloat(senderId: string, input: {
  question: string;
  emoji?: string;
  place?: string;
  timing?: FloatTiming;
  isOpenInvite?: boolean;
  isPrivate?: boolean;
  squadIds?: string[];
  /** Optional explicit lifetime in ms; otherwise the default 8h applies. */
  lifetimeMs?: number;
}): Float {
  const question = input.question.trim();
  if (!question) throw badRequest('EMPTY_QUESTION', 'A float needs a question', 'question');
  if (question.length > 120) {
    throw badRequest('QUESTION_TOO_LONG', 'Keep the question under 120 characters', 'question');
  }

  const id = newId();
  const ts = now();
  const lifetime = Math.max(60_000, input.lifetimeMs ?? DEFAULT_LIFETIME_MS);
  const isOpenInvite = input.isOpenInvite !== false;
  const isPrivate = !!input.isPrivate;

  tx(() => {
    q.run(
      `INSERT INTO floats
        (id, sender_id, question, emoji, place, timing,
         is_open_invite, is_private, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, senderId, question,
      input.emoji?.trim() || null,
      input.place?.trim() || null,
      input.timing ?? null,
      isOpenInvite ? 1 : 0,
      isPrivate ? 1 : 0,
      ts, ts + lifetime,
    );
    for (const squadId of new Set(input.squadIds ?? [])) {
      if (isInSquad(squadId, senderId)) {
        q.run('INSERT OR IGNORE INTO float_squads (float_id, squad_id) VALUES (?, ?)', id, squadId);
      }
    }
  });

  const row = q.get<FloatRow>('SELECT * FROM floats WHERE id = ?', id)!;
  publishFloatChange(row, 'created');

  // In-app notification for direct friends only — squad members and FoF can
  // discover via realtime feed.changed without an explicit lockscreen prod.
  // Keeps the push channel reserved for "your circle wants to do something."
  const sender = getUserRow(senderId);
  const preview = question.length > 60 ? `${question.slice(0, 57)}…` : question;
  for (const friendId of friendIds(senderId)) {
    if (!canSeeFloat(friendId, row)) continue;
    safeNotify({
      userId: friendId,
      type: 'float_received',
      fromId: senderId,
      floatId: id,
      body: `${sender?.name ?? 'Someone'} floated: "${preview}"`,
    });
  }
  return toFloat(row);
}

/* ---- respond ---- */

export function respondToFloat(
  userId: string, floatId: string, state: FloatResponseState,
): Float {
  const row = getFloatRow(floatId);
  if (!row) throw notFound('FLOAT_NOT_FOUND', 'Float not found');
  if (row.sender_id === userId) {
    throw badRequest('SELF_RESPONSE', "You can't react to your own float");
  }
  if (row.expires_at <= now()) {
    throw conflict('FLOAT_EXPIRED', 'This float has already expired');
  }
  if (row.locked_into_activity_id) {
    throw conflict('FLOAT_LOCKED', 'This float was already locked into a plan');
  }
  if (!canSeeFloat(userId, row)) {
    // Treat as 404 instead of 403 — leaking visibility to non-viewers via
    // a different status code defeats the visibility model.
    throw notFound('FLOAT_NOT_FOUND', 'Float not found');
  }

  const ts = now();
  q.run(
    `INSERT INTO float_responses (float_id, user_id, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (float_id, user_id) DO UPDATE SET
       state = excluded.state, updated_at = excluded.updated_at`,
    floatId, userId, state, ts, ts,
  );

  // Sender notification — only on first 'keen' so the sender doesn't get
  // pinged for every flip. The float card surfaces the live tally anyway.
  if (state === 'keen') {
    const me = getUserRow(userId);
    safeNotify({
      userId: row.sender_id,
      type: 'float_keen',
      fromId: userId,
      floatId: row.id,
      body: `${me?.name ?? 'Someone'} is keen — "${row.question}"`,
    });
  }

  publishFloatChange(row, 'updated');
  return toFloat(row);
}

/* ---- lock-in ---- */

/**
 * Promote a float into a real activity. Only the sender can lock in. The
 * caller passes the standard activity fields (title, time, place, etc.);
 * the keen responders are auto-RSVP'd via createActivity's prefilledGoingIds.
 */
export function lockFloat(senderId: string, floatId: string, input: {
  title?: string;
  category: CategoryKey;
  customEmoji?: string;
  customLabel?: string;
  place?: string;
  description?: string;
  startsAt: number;
  endsAt: number;
  maxSize?: number;
  bannerUrl?: string;
  isPrivate?: boolean;
  isOpenInvite?: boolean;
  squadIds?: string[];
  reminderMins?: number | null;
}) {
  const row = getFloatRow(floatId);
  if (!row) throw notFound('FLOAT_NOT_FOUND', 'Float not found');
  if (row.sender_id !== senderId) {
    throw forbidden('Only the sender can lock this float into a plan');
  }
  if (row.locked_into_activity_id) {
    throw conflict('FLOAT_ALREADY_LOCKED', 'This float was already locked');
  }

  // Anyone who said "keen" gets auto-RSVP'd to going. Visibility/blocks are
  // re-checked in createActivity, so an old keen who's since blocked the
  // sender (or vice versa) won't get force-added.
  const keenIds = q.all<{ user_id: string }>(
    "SELECT user_id FROM float_responses WHERE float_id = ? AND state = 'keen'", floatId,
  ).map(r => r.user_id);

  const activity = createActivity(senderId, {
    category: input.category,
    customEmoji: input.customEmoji,
    customLabel: input.customLabel,
    title: input.title || row.question,
    place: input.place ?? row.place ?? '',
    description: input.description,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    maxSize: input.maxSize,
    isPrivate: input.isPrivate ?? !!row.is_private,
    isOpenInvite: input.isOpenInvite ?? !!row.is_open_invite,
    bannerUrl: input.bannerUrl,
    reminderMins: input.reminderMins,
    squadIds: input.squadIds ?? squadIdsFor(floatId),
    prefilledGoingIds: keenIds,
  });

  q.run(
    'UPDATE floats SET locked_into_activity_id = ? WHERE id = ?',
    activity.id, floatId,
  );

  // Tell the keen crew their float just became a plan.
  for (const userId of keenIds) {
    safeNotify({
      userId,
      type: 'float_locked',
      fromId: senderId,
      floatId: row.id,
      activityId: activity.id,
      body: `Locked in: "${activity.title}"`,
    });
  }

  const updated = q.get<FloatRow>('SELECT * FROM floats WHERE id = ?', floatId)!;
  publishFloatChange(updated, 'locked');
  return { float: toFloat(updated), activityId: activity.id };
}

/* ---- delete ---- */

export function deleteFloat(senderId: string, floatId: string): void {
  const row = getFloatRow(floatId);
  if (!row) throw notFound('FLOAT_NOT_FOUND', 'Float not found');
  if (row.sender_id !== senderId) {
    throw forbidden('Only the sender can delete this float');
  }
  q.run('UPDATE floats SET deleted_at = ? WHERE id = ?', now(), floatId);
  publishFloatChange(row, 'removed');
}
