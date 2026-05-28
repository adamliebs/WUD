/**
 * Trust & safety primitives — user blocks + abuse reports.
 *
 * Required by App Store Review Guideline 1.2 (User-Generated Content):
 *   • Mechanism to block abusive users
 *   • Mechanism to report objectionable content
 *   • Evidence of timely review (reports table acts as the queue)
 *
 * Blocks are bidirectional in effect — `isBlockedEither(a, b)` is true when
 * either side has blocked the other. Callers should use that helper (not the
 * raw table) for any visibility check so neither party can see around a block.
 */
import { q, tx } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { newId, now } from '../lib/ids.js';
import { publish } from '../realtime/bus.js';
import type { PublicUser } from '../types.js';
import { removeFriend } from './social.js';
import { getUserRow, toPublicUser } from './users.js';

/* ============ blocks ============ */

/** True if `userId` has blocked `otherId` (directional). */
export function hasBlocked(userId: string, otherId: string): boolean {
  return !!q.get(
    'SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?',
    userId, otherId,
  );
}

/** True if either user has blocked the other. Use this for visibility checks. */
export function isBlockedEither(a: string, b: string): boolean {
  if (a === b) return false;
  return !!q.get(
    `SELECT 1 FROM user_blocks
      WHERE (blocker_id = ? AND blocked_id = ?)
         OR (blocker_id = ? AND blocked_id = ?)`,
    a, b, b, a,
  );
}

/** All user IDs that this user has blocked OR been blocked by. */
export function blockedUserIds(userId: string): string[] {
  const rows = q.all<{ other: string }>(
    `SELECT blocked_id AS other FROM user_blocks WHERE blocker_id = ?
     UNION
     SELECT blocker_id AS other FROM user_blocks WHERE blocked_id = ?`,
    userId, userId,
  );
  return rows.map(r => r.other);
}

/** Just the users I've actively blocked (the ones surfaced in Settings). */
export function listBlockedByMe(userId: string): PublicUser[] {
  const rows = q.all<{ blocked_id: string }>(
    'SELECT blocked_id FROM user_blocks WHERE blocker_id = ? ORDER BY created_at DESC',
    userId,
  );
  return rows
    .map(r => getUserRow(r.blocked_id))
    .filter((u): u is NonNullable<typeof u> => !!u)
    .map(toPublicUser);
}

/**
 * Block another user. Removes any existing friendship in the same transaction
 * so the block takes effect immediately across the social graph. Pushes a
 * realtime event so the other side's client can drop me from their lists.
 */
export function blockUser(userId: string, otherId: string): void {
  if (userId === otherId) {
    throw badRequest('SELF_BLOCK', 'You cannot block yourself');
  }
  if (!getUserRow(otherId)) throw notFound('USER_NOT_FOUND', 'User not found');

  tx(() => {
    q.run(
      'INSERT OR IGNORE INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)',
      userId, otherId, now(),
    );
    // Mutual block: ensure friendship is gone too. Cleaner than leaving a
    // stale row that won't render anywhere but still pollutes friend counts.
    removeFriend(userId, otherId);
  });

  publish({ channel: `user:${userId}`,  type: 'block.changed', data: { blockedId: otherId, blocked: true } });
  publish({ channel: `user:${otherId}`, type: 'block.changed', data: { byId: userId } });
}

export function unblockUser(userId: string, otherId: string): void {
  q.run('DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?', userId, otherId);
  publish({ channel: `user:${userId}`, type: 'block.changed', data: { blockedId: otherId, blocked: false } });
}

/* ============ reports ============ */

export type ReportKind = 'user' | 'activity' | 'message';

const VALID_KINDS: ReportKind[] = ['user', 'activity', 'message'];

/**
 * File an abuse report. Stored in the `reports` table for offline moderator
 * review. Never throws on duplicates — repeat reports against the same target
 * by the same user simply stack (signal of severity).
 */
export function createReport(input: {
  reporterId: string;
  targetKind: ReportKind;
  targetId: string;
  reason: string;
  note?: string;
}): string {
  if (!VALID_KINDS.includes(input.targetKind)) {
    throw badRequest('BAD_KIND', 'targetKind must be user, activity, or message', 'targetKind');
  }
  if (input.reporterId === input.targetId && input.targetKind === 'user') {
    throw badRequest('SELF_REPORT', 'You cannot report yourself');
  }
  const reason = input.reason.trim().slice(0, 80);
  if (!reason) {
    throw badRequest('BAD_REASON', 'reason is required', 'reason');
  }
  const id = newId();
  q.run(
    `INSERT INTO reports (id, reporter_id, target_kind, target_id, reason, note, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    id, input.reporterId, input.targetKind, input.targetId, reason,
    input.note?.trim().slice(0, 1000) || null, now(),
  );
  return id;
}
