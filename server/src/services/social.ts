import { q, tx } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId, now, shortId } from '../lib/ids.js';
import { publish } from '../realtime/bus.js';
import type { PublicUser, Squad } from '../types.js';
import { messagesForSquad } from './chat.js';
import { createNotification } from './notifications.js';
import { getUserRow, toPublicUser } from './users.js';

/* ===================== FRIENDS ===================== */

/** Friendships are stored once with an ordered pair; this normalizes inputs. */
function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export function areFriends(a: string, b: string): boolean {
  if (a === b) return true;
  const [x, y] = pair(a, b);
  return !!q.get('SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ?', x, y);
}

/** IDs of a user's friends. */
export function friendIds(userId: string): string[] {
  const rows = q.all<{ user_a: string; user_b: string }>(
    'SELECT user_a, user_b FROM friendships WHERE user_a = ? OR user_b = ?', userId, userId,
  );
  return rows.map(r => (r.user_a === userId ? r.user_b : r.user_a));
}

export function listFriends(userId: string): PublicUser[] {
  return friendIds(userId)
    .map(getUserRow)
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(toPublicUser);
}

/** Create a friendship directly (used by request-accept and the demo seeder). */
export function addFriendship(a: string, b: string): void {
  if (a === b) return;
  const [x, y] = pair(a, b);
  q.run(
    'INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)',
    x, y, now(),
  );
  publish({ channel: `user:${a}`, type: 'friend.changed', data: { friendId: b } });
  publish({ channel: `user:${b}`, type: 'friend.changed', data: { friendId: a } });
}

export function removeFriend(userId: string, otherId: string): void {
  const [x, y] = pair(userId, otherId);
  q.run('DELETE FROM friendships WHERE user_a = ? AND user_b = ?', x, y);
  publish({ channel: `user:${userId}`, type: 'friend.changed', data: { removed: otherId } });
  publish({ channel: `user:${otherId}`, type: 'friend.changed', data: { removed: userId } });
}

/* --- friend requests ------------------------------------------------------ */

export function sendFriendRequest(requesterId: string, recipientId: string): string {
  if (requesterId === recipientId) {
    throw badRequest('SELF_FRIEND', 'You cannot friend yourself');
  }
  if (!getUserRow(recipientId)) throw notFound('USER_NOT_FOUND', 'User not found');
  if (areFriends(requesterId, recipientId)) {
    throw conflict('ALREADY_FRIENDS', 'You are already friends');
  }
  // An existing pending request either way → no duplicate.
  const dup = q.get<{ id: string; requester_id: string }>(
    `SELECT id, requester_id FROM friend_requests
      WHERE status = 'pending'
        AND ((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))`,
    requesterId, recipientId, recipientId, requesterId,
  );
  if (dup) {
    // If they already requested us, accepting is the right move.
    if (dup.requester_id === recipientId) {
      acceptFriendRequest(dup.id, requesterId);
      return dup.id;
    }
    return dup.id;
  }
  const id = newId();
  q.run(
    `INSERT INTO friend_requests (id, requester_id, recipient_id, status, created_at)
     VALUES (?, ?, ?, 'pending', ?)`,
    id, requesterId, recipientId, now(),
  );
  publish({ channel: `user:${recipientId}`, type: 'friend.changed', data: { requestFrom: requesterId } });
  // Surface the request in the recipient's Alerts inbox (and enqueue a push).
  // Reuses the 'invite' notification type — see schema CHECK constraint.
  createNotification({
    userId: recipientId,
    type: 'invite',
    fromId: requesterId,
    body: 'wants to be your friend',
  });
  return id;
}

/** Resolve the friend-request ('invite') notification once it's been actioned. */
function resolveFriendInviteNotification(recipientId: string, requesterId: string): void {
  q.run(
    "UPDATE notifications SET read = 1, resolved = 1 WHERE user_id = ? AND type = 'invite' AND from_id = ?",
    recipientId, requesterId,
  );
}

export function acceptFriendRequest(requestId: string, actingUserId: string): void {
  const r = q.get<{ requester_id: string; recipient_id: string; status: string }>(
    'SELECT requester_id, recipient_id, status FROM friend_requests WHERE id = ?', requestId,
  );
  if (!r) throw notFound('REQUEST_NOT_FOUND', 'Friend request not found');
  if (r.recipient_id !== actingUserId) throw forbidden('Only the recipient can accept this request');
  if (r.status !== 'pending') throw conflict('REQUEST_RESOLVED', 'This request was already resolved');
  tx(() => {
    q.run("UPDATE friend_requests SET status = 'accepted', resolved_at = ? WHERE id = ?", now(), requestId);
    addFriendship(r.requester_id, r.recipient_id);
    resolveFriendInviteNotification(r.recipient_id, r.requester_id);
  });
}

export function declineFriendRequest(requestId: string, actingUserId: string): void {
  const r = q.get<{ recipient_id: string; requester_id: string; status: string }>(
    'SELECT recipient_id, requester_id, status FROM friend_requests WHERE id = ?', requestId,
  );
  if (!r) throw notFound('REQUEST_NOT_FOUND', 'Friend request not found');
  if (r.recipient_id !== actingUserId && r.requester_id !== actingUserId) {
    throw forbidden('Not your request');
  }
  const newStatus = r.requester_id === actingUserId ? 'cancelled' : 'declined';
  q.run('UPDATE friend_requests SET status = ?, resolved_at = ? WHERE id = ?', newStatus, now(), requestId);
  resolveFriendInviteNotification(r.recipient_id, r.requester_id);
}

export function incomingRequests(userId: string) {
  return q.all<{ id: string; requester_id: string; created_at: number }>(
    `SELECT id, requester_id, created_at FROM friend_requests
      WHERE recipient_id = ? AND status = 'pending' ORDER BY created_at DESC`, userId,
  ).map(r => ({ id: r.id, from: toPublicUser(getUserRow(r.requester_id)!), at: r.created_at }));
}

/** Users with a pending friend request to/from this user (either direction). */
function pendingRequestPeers(userId: string): Set<string> {
  const rows = q.all<{ requester_id: string; recipient_id: string }>(
    `SELECT requester_id, recipient_id FROM friend_requests
      WHERE status = 'pending' AND (requester_id = ? OR recipient_id = ?)`,
    userId, userId,
  );
  const peers = new Set<string>();
  for (const r of rows) peers.add(r.requester_id === userId ? r.recipient_id : r.requester_id);
  return peers;
}

/**
 * "People you may know" — friends-of-friends, ranked by mutual-friend count.
 * Excludes self, current friends, and anyone with a pending request. This is
 * the only place discovery surfaces people without an explicit search.
 */
export function suggestedUsers(userId: string): PublicUser[] {
  const mine = friendIds(userId);
  const exclude = new Set<string>([userId, ...mine, ...pendingRequestPeers(userId)]);
  const mutuals = new Map<string, number>();
  for (const friend of mine) {
    for (const fof of friendIds(friend)) {
      if (exclude.has(fof)) continue;
      mutuals.set(fof, (mutuals.get(fof) ?? 0) + 1);
    }
  }
  return [...mutuals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([id]) => getUserRow(id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(toPublicUser);
}

/**
 * Discovery for the Friends → Discover tab.
 *  - No (or 1-char) query → "people you may know" (friends-of-friends only).
 *  - A real query → search the whole directory by handle or name.
 * It never dumps every user: strangers are only reachable by searching.
 */
export function discoverUsers(userId: string, query: string): PublicUser[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return suggestedUsers(userId);

  const exclude = new Set<string>([userId, ...friendIds(userId)]);
  return q.all<{ id: string }>('SELECT id FROM users WHERE id != ?', userId)
    .filter(r => !exclude.has(r.id))
    .map(r => getUserRow(r.id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(toPublicUser)
    .filter(u => u.handle.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle))
    .slice(0, 20);
}

/* ===================== SQUADS ===================== */

interface SquadRow {
  id: string;
  name: string;
  emoji: string;
  host_id: string;
  created_at: number;
}

export function squadMemberIds(squadId: string): string[] {
  return q.all<{ user_id: string }>(
    'SELECT user_id FROM squad_members WHERE squad_id = ?', squadId,
  ).map(r => r.user_id);
}

/** Host + members. */
export function squadEveryoneIds(squadId: string): string[] {
  const row = q.get<{ host_id: string }>('SELECT host_id FROM squads WHERE id = ?', squadId);
  if (!row) return [];
  return [row.host_id, ...squadMemberIds(squadId)];
}

export function isInSquad(squadId: string, userId: string): boolean {
  return squadEveryoneIds(squadId).includes(userId);
}

export function isSquadHost(squadId: string, userId: string): boolean {
  const row = q.get<{ host_id: string }>('SELECT host_id FROM squads WHERE id = ?', squadId);
  return !!row && row.host_id === userId;
}

function toSquad(row: SquadRow): Squad {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    hostId: row.host_id,
    memberIds: squadMemberIds(row.id),
    chat: messagesForSquad(row.id),
    createdAt: row.created_at,
  };
}

export function getSquad(squadId: string): Squad {
  const row = q.get<SquadRow>('SELECT * FROM squads WHERE id = ?', squadId);
  if (!row) throw notFound('SQUAD_NOT_FOUND', 'Squad not found');
  return toSquad(row);
}

/** Squads the user hosts or is a member of. */
export function listSquadsForUser(userId: string): Squad[] {
  const rows = q.all<SquadRow>(
    `SELECT DISTINCT s.* FROM squads s
       LEFT JOIN squad_members m ON m.squad_id = s.id
      WHERE s.host_id = ? OR m.user_id = ?
      ORDER BY s.created_at DESC`,
    userId, userId,
  );
  return rows.map(toSquad);
}

export function createSquad(input: {
  hostId: string; name: string; emoji?: string; memberIds?: string[];
}): Squad {
  const name = input.name.trim();
  if (!name) throw badRequest('EMPTY_NAME', 'Squad needs a name', 'name');
  const id = shortId('s_');
  return tx(() => {
    q.run(
      'INSERT INTO squads (id, name, emoji, host_id, created_at) VALUES (?, ?, ?, ?, ?)',
      id, name.slice(0, 30), input.emoji?.trim() || '✨', input.hostId, now(),
    );
    const friends = new Set(friendIds(input.hostId));
    for (const memberId of new Set(input.memberIds ?? [])) {
      if (memberId !== input.hostId && friends.has(memberId)) {
        q.run(
          'INSERT OR IGNORE INTO squad_members (squad_id, user_id, joined_at) VALUES (?, ?, ?)',
          id, memberId, now(),
        );
      }
    }
    return getSquad(id);
  });
}

/** Host-only: edit name/emoji. */
export function updateSquad(
  squadId: string, actingUserId: string, patch: { name?: string; emoji?: string },
): Squad {
  if (!isSquadHost(squadId, actingUserId)) throw forbidden('Only the squad host can edit it');
  const cur = getSquad(squadId);
  q.run(
    'UPDATE squads SET name = ?, emoji = ? WHERE id = ?',
    (patch.name?.trim() || cur.name).slice(0, 30),
    patch.emoji?.trim() || cur.emoji,
    squadId,
  );
  return getSquad(squadId);
}

/** Host-only: delete the squad (cascades untag activities + remove chat). */
export function deleteSquad(squadId: string, actingUserId: string): void {
  if (!isSquadHost(squadId, actingUserId)) throw forbidden('Only the squad host can delete it');
  q.run('DELETE FROM squads WHERE id = ?', squadId); // FKs cascade members/messages/activity_squads
}

/** Host-only: add a friend as a member. */
export function addSquadMember(squadId: string, actingUserId: string, memberId: string): Squad {
  if (!isSquadHost(squadId, actingUserId)) throw forbidden('Only the squad host can add members');
  if (!areFriends(actingUserId, memberId)) {
    throw badRequest('NOT_A_FRIEND', 'You can only add your friends to a squad', 'memberId');
  }
  q.run(
    'INSERT OR IGNORE INTO squad_members (squad_id, user_id, joined_at) VALUES (?, ?, ?)',
    squadId, memberId, now(),
  );
  return getSquad(squadId);
}

/** Host-only: remove a member. */
export function removeSquadMember(squadId: string, actingUserId: string, memberId: string): Squad {
  if (!isSquadHost(squadId, actingUserId)) throw forbidden('Only the squad host can remove members');
  q.run('DELETE FROM squad_members WHERE squad_id = ? AND user_id = ?', squadId, memberId);
  return getSquad(squadId);
}

/** Member-only: leave a squad without deleting it. The host cannot "leave". */
export function leaveSquad(squadId: string, userId: string): void {
  if (isSquadHost(squadId, userId)) {
    throw forbidden('You host this squad — delete it instead of leaving');
  }
  q.run('DELETE FROM squad_members WHERE squad_id = ? AND user_id = ?', squadId, userId);
}
