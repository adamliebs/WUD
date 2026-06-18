import { q, tx } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { newId, now, shortId } from '../lib/ids.js';
import { publish } from '../realtime/bus.js';
import type { PublicUser, Squad } from '../types.js';
import { BUDDY_ID } from './buddy.js';
import { messagesForSquad } from './chat.js';
import { createNotification } from './notifications.js';
import { hashPhoneRaw } from '../lib/phone.js';
import { getSettings, getUserRow, getUserRowByHandle, toPublicUser } from './users.js';

/* ===================== BLOCKS (helper) =====================
 * Inlined here (not imported from safety.ts) to avoid a circular import —
 * safety.ts needs removeFriend from social.ts. Single-purpose helper; the
 * full block API lives in services/safety.ts.
 */
function blockedUserIds(userId: string): string[] {
  return q.all<{ other: string }>(
    `SELECT blocked_id AS other FROM user_blocks WHERE blocker_id = ?
     UNION
     SELECT blocker_id AS other FROM user_blocks WHERE blocked_id = ?`,
    userId, userId,
  ).map(r => r.other);
}

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
  // Recipient opted out of friend requests — refuse without revealing whether
  // they exist or not beyond what the previous lookups already disclosed.
  if (!getSettings(recipientId).allowFriendRequests) {
    throw forbidden('This user is not accepting friend requests');
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

/**
 * Invite-link friendship — "tap my link, we're friends."
 *
 * The normal request/accept handshake exists to guard against unsolicited
 * adds. A personal invite link is the opposite case: the inviter chose to
 * share it AND the invitee chose to open it, so consent is mutual by
 * construction and we create the friendship instantly (this is also why the
 * `allowFriendRequests` setting deliberately doesn't apply here). Blocks
 * still win — a blocked-either-way pair reports the link as invalid rather
 * than revealing the block.
 */
export function acceptFriendLink(
  inviteeId: string, handle: string,
): { friend: PublicUser; already: boolean } {
  const inviter = getUserRowByHandle(handle);
  // Buddy's link would be meaningless (everyone is already his friend).
  if (!inviter || inviter.id === BUDDY_ID) {
    throw notFound('USER_NOT_FOUND', 'That invite link is no longer valid');
  }
  if (inviter.id === inviteeId) {
    throw badRequest('SELF_FRIEND', "That's your own invite link");
  }
  if (blockedUserIds(inviteeId).includes(inviter.id)) {
    throw notFound('USER_NOT_FOUND', 'That invite link is no longer valid');
  }
  if (areFriends(inviteeId, inviter.id)) {
    return { friend: toPublicUser(inviter), already: true };
  }
  const invitee = getUserRow(inviteeId);
  tx(() => {
    addFriendship(inviteeId, inviter.id);
    // Fold any pending request between the two (either direction) into the
    // new friendship so a stale "pending" row doesn't linger in either UI.
    q.run(
      `UPDATE friend_requests SET status = 'accepted', resolved_at = ?
        WHERE status = 'pending'
          AND ((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))`,
      now(), inviteeId, inviter.id, inviter.id, inviteeId,
    );
    resolveFriendInviteNotification(inviteeId, inviter.id);
  });
  createNotification({
    userId: inviter.id,
    type: 'friend_accepted',
    fromId: inviteeId,
    body: `${invitee?.name ?? 'Someone'} joined from your invite — you're now friends 🎉`,
  });
  return { friend: toPublicUser(inviter), already: false };
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
  // Tell the requester their request was accepted. Outside the TX so a
  // notification-insert hiccup doesn't roll back the friendship itself.
  const recipient = getUserRow(r.recipient_id);
  createNotification({
    userId: r.requester_id,
    type: 'friend_accepted',
    fromId: r.recipient_id,
    body: `${recipient?.name ?? 'Someone'} accepted your friend request`,
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

/**
 * Pending requests this user has SENT and not yet had answered. Used by the
 * Friends overlay so the sender can see who they're waiting on and cancel
 * if they change their mind. Cancellation reuses declineFriendRequest()
 * which already supports either-party-acts semantics — when the acting
 * user is the requester, the request's status flips to 'cancelled'.
 */
export function outgoingRequests(userId: string) {
  return q.all<{ id: string; recipient_id: string; created_at: number }>(
    `SELECT id, recipient_id, created_at FROM friend_requests
      WHERE requester_id = ? AND status = 'pending' ORDER BY created_at DESC`, userId,
  ).map(r => ({ id: r.id, to: toPublicUser(getUserRow(r.recipient_id)!), at: r.created_at }));
}

/** Friendship-request state between the viewer and another user — drives the
 *  Add / Requested / Respond button on a profile. */
export function friendRequestState(viewerId: string, otherId: string): 'none' | 'outgoing' | 'incoming' {
  const r = q.get<{ requester_id: string }>(
    `SELECT requester_id FROM friend_requests
      WHERE status = 'pending'
        AND ((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?))`,
    viewerId, otherId, otherId, viewerId,
  );
  if (!r) return 'none';
  return r.requester_id === viewerId ? 'outgoing' : 'incoming';
}

export interface UserProfile {
  user: PublicUser;
  /** Their total friends (WUD Buddy excluded — he's everyone's friend). */
  friendCount: number;
  /** Friends in common with the viewer (Buddy + the viewer excluded). */
  mutualCount: number;
  /** A handful of mutual-friend objects, for an avatar stack. */
  mutuals: PublicUser[];
  /** Their friends (capped), each flagged with whether the VIEWER is already
   *  friends with them — drives the friend-their-friends Add buttons. */
  friends: (PublicUser & { isFriend: boolean })[];
  isFriend: boolean;
  isMe: boolean;
  requestState: 'none' | 'outgoing' | 'incoming';
}

/**
 * A viewer-relative profile for another user: public identity plus social
 * stats (friend count, mutual friends) and the viewer's relationship to them
 * (friend / pending request). Blocked-either-way pairs 404 so a block hides
 * the profile, not just the feed.
 */
export function getUserProfile(viewerId: string, targetId: string): UserProfile {
  const row = getUserRow(targetId);
  if (!row) throw notFound('USER_NOT_FOUND', 'User not found');
  if (viewerId !== targetId && blockedUserIds(viewerId).includes(targetId)) {
    throw notFound('USER_NOT_FOUND', 'User not found');
  }
  // WUD Buddy is friends with everyone — showing that as a stat is nonsense,
  // so the bot's profile reports no friends / no mutuals.
  if (targetId === BUDDY_ID) {
    return {
      user: toPublicUser(row),
      friendCount: 0, mutualCount: 0, mutuals: [], friends: [],
      isFriend: areFriends(viewerId, targetId), isMe: false,
      requestState: 'none',
    };
  }
  // Exclude WUD Buddy + the viewer + blocked-either-way from stats/lists.
  const blocked = new Set(blockedUserIds(viewerId));
  const theirFriends = friendIds(targetId)
    .filter(id => id !== BUDDY_ID && id !== viewerId && !blocked.has(id));
  const mine = new Set(friendIds(viewerId).filter(id => id !== BUDDY_ID));
  const mutualIds = theirFriends.filter(id => mine.has(id));
  return {
    user: toPublicUser(row),
    friendCount: theirFriends.length,
    mutualCount: mutualIds.length,
    mutuals: mutualIds.slice(0, 8)
      .map(getUserRow)
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map(toPublicUser),
    // Mutuals first (most relevant), then the rest. Each flagged so the UI can
    // show an Add button on the ones the viewer isn't connected to.
    friends: [...mutualIds, ...theirFriends.filter(id => !mine.has(id))]
      .slice(0, 30)
      .map(getUserRow)
      .filter((r): r is NonNullable<typeof r> => !!r)
      .map(r => ({ ...toPublicUser(r), isFriend: mine.has(r.id) })),
    isFriend: areFriends(viewerId, targetId),
    isMe: viewerId === targetId,
    requestState: friendRequestState(viewerId, targetId),
  };
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
  // Blocked-in-either-direction users are silently excluded from any people-
  // suggestion surface (Apple Guideline 1.2 — block must hide the user from
  // discovery, not just RSVPs).
  const blocked = blockedUserIds(userId);
  const exclude = new Set<string>([userId, ...mine, ...pendingRequestPeers(userId), ...blocked]);
  const mutuals = new Map<string, number>();
  for (const friend of mine) {
    // WUD Buddy is friends with literally everyone — traversing through him
    // would surface every user on the platform as a "friend of friend."
    if (friend === BUDDY_ID) continue;
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

  const exclude = new Set<string>([userId, BUDDY_ID, ...friendIds(userId), ...blockedUserIds(userId)]);
  return q.all<{ id: string }>('SELECT id FROM users WHERE id != ?', userId)
    .filter(r => !exclude.has(r.id))
    .map(r => getUserRow(r.id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(toPublicUser)
    .filter(u => u.handle.toLowerCase().includes(needle) || u.name.toLowerCase().includes(needle))
    .slice(0, 20);
}

/**
 * Match raw contact emails and/or raw phone numbers against registered users.
 * Returns matches PLUS a flag indicating which are already friends — the
 * client renders existing friends as "Already friends" instead of with an
 * Add button. Excludes only the caller and blocked-either-side pairs.
 *
 * Including friends in the result was an explicit user request: seeing
 * "Mike is also on WUD" alongside "Sarah · already a friend" makes the
 * contacts panel feel like a real address-book mirror, not just a
 * friend-suggestion list.
 *
 * Emails: matched against `auth_identities.email`.
 * Phones: client sends raw numbers; server normalizes + HMAC-hashes and
 * looks up `users.phone_hash`. Raw phone numbers from the user's contacts
 * are never persisted.
 *
 * Both lists are capped at 800 entries (SQLite IN-clause limit ~999).
 */
export function matchContacts(
  viewerId: string,
  input: { emails?: string[]; phones?: string[] },
): { user: PublicUser; isFriend: boolean }[] {
  const matched = new Set<string>();
  const exclude = new Set<string>([
    viewerId,
    ...blockedUserIds(viewerId),
  ]);
  const friendSet = new Set<string>(friendIds(viewerId));

  // -- email lookup ----------------------------------------------------------
  const emails = input.emails ?? [];
  if (emails.length > 0) {
    const normalized = Array.from(new Set(
      emails.map(e => e.trim().toLowerCase()).filter(e => e.length > 0 && e.length <= 320),
    )).slice(0, 800);
    if (normalized.length > 0) {
      const placeholders = normalized.map(() => '?').join(',');
      const rows = q.all<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM auth_identities
           WHERE email IS NOT NULL AND email IN (${placeholders})`,
        ...normalized,
      );
      for (const r of rows) if (!exclude.has(r.user_id)) matched.add(r.user_id);
    }
  }

  // -- phone lookup ----------------------------------------------------------
  const phones = input.phones ?? [];
  if (phones.length > 0) {
    const hashes = Array.from(new Set(
      phones.map(p => hashPhoneRaw(p)).filter((h): h is string => h !== null),
    )).slice(0, 800);
    if (hashes.length > 0) {
      const placeholders = hashes.map(() => '?').join(',');
      const rows = q.all<{ id: string }>(
        `SELECT id FROM users
           WHERE phone_hash IS NOT NULL AND phone_hash IN (${placeholders})`,
        ...hashes,
      );
      for (const r of rows) if (!exclude.has(r.id)) matched.add(r.id);
    }
  }

  return Array.from(matched)
    .map(id => {
      const row = getUserRow(id);
      return row ? { user: toPublicUser(row), isFriend: friendSet.has(id) } : null;
    })
    .filter((r): r is NonNullable<typeof r> => !!r);
}

/** @deprecated Kept as a thin alias for any old callers — prefer matchContacts. */
export function matchContactEmails(viewerId: string, emails: string[]): { user: PublicUser; isFriend: boolean }[] {
  return matchContacts(viewerId, { emails });
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

/** Users with an outstanding (pending) invite to this squad. */
export function pendingInviteeIds(squadId: string): string[] {
  return q.all<{ invitee_id: string }>(
    "SELECT invitee_id FROM squad_invites WHERE squad_id = ? AND status = 'pending'",
    squadId,
  ).map(r => r.invitee_id);
}

function toSquad(row: SquadRow): Squad {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    hostId: row.host_id,
    memberIds: squadMemberIds(row.id),
    invitedIds: pendingInviteeIds(row.id),
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
    // Friends join directly; non-friends get a squad invite instead — they
    // become a member (and a friend) only when they accept.
    const friends = new Set(friendIds(input.hostId));
    for (const memberId of new Set(input.memberIds ?? [])) {
      if (memberId === input.hostId) continue;
      if (friends.has(memberId)) {
        q.run(
          'INSERT OR IGNORE INTO squad_members (squad_id, user_id, joined_at) VALUES (?, ?, ?)',
          id, memberId, now(),
        );
      } else {
        createSquadInvite(id, input.hostId, memberId);
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

/** Push feed.changed to each user so they refetch — squad membership swings
 *  visibility on every plan tagged to that squad. */
function fanFeedChanged(userIds: Iterable<string>, reason: string): void {
  for (const userId of userIds) {
    publish({ channel: `user:${userId}`, type: 'feed.changed', data: { reason } });
  }
}

/** Host-only: delete the squad (cascades untag activities + remove chat). */
export function deleteSquad(squadId: string, actingUserId: string): void {
  if (!isSquadHost(squadId, actingUserId)) throw forbidden('Only the squad host can delete it');
  // Snapshot members before the cascade so we can tell them their feed shifted.
  const affected = squadEveryoneIds(squadId);
  q.run('DELETE FROM squads WHERE id = ?', squadId); // FKs cascade members/messages/activity_squads
  fanFeedChanged(affected, 'squad.deleted');
}

/** Host-only: add a friend directly, or send a squad invite to a non-friend.
 *  Friends join immediately (existing behavior); anyone else gets a
 *  'squad_invite' notification and joins — becoming a friend at the same
 *  time — only when they accept. */
export function addSquadMember(squadId: string, actingUserId: string, memberId: string): Squad {
  if (!isSquadHost(squadId, actingUserId)) throw forbidden('Only the squad host can add members');
  if (!areFriends(actingUserId, memberId)) {
    createSquadInvite(squadId, actingUserId, memberId, { throwOnRefusal: true });
    return getSquad(squadId);
  }
  q.run(
    'INSERT OR IGNORE INTO squad_members (squad_id, user_id, joined_at) VALUES (?, ?, ?)',
    squadId, memberId, now(),
  );
  fanFeedChanged([memberId], 'squad.member.added');
  return getSquad(squadId);
}

/* --- squad invites (non-friend additions) ----------------------------------
 *
 * Adding someone who ISN'T a friend can't be a silent membership insert — the
 * invitee never consented to share their plans/chat with this group. Instead
 * the host's add becomes an invite; accepting it creates the friendship
 * (host ↔ invitee) and the membership together, mirroring the invite-link
 * flow's "consent on both sides" rule.
 */

/**
 * Create (or revive) a pending invite. Silently skips cases where inviting
 * makes no sense — already a member, already pending, blocked either way —
 * unless `throwOnRefusal` is set (the single-add endpoint wants a real error
 * to show the host; squad creation wants best-effort fan-out).
 */
export function createSquadInvite(
  squadId: string,
  inviterId: string,
  inviteeId: string,
  opts: { throwOnRefusal?: boolean } = {},
): boolean {
  const refuse = (code: string, message: string): false => {
    if (opts.throwOnRefusal) throw conflict(code, message);
    return false;
  };
  const invitee = getUserRow(inviteeId);
  if (!invitee) return refuse('USER_NOT_FOUND', 'User not found');
  if (inviteeId === inviterId) return false;
  if (inviteeId === BUDDY_ID) return false; // the test friend is added directly, never invited
  if (isInSquad(squadId, inviteeId)) return refuse('ALREADY_MEMBER', 'They are already in this squad');
  if (blockedUserIds(inviterId).includes(inviteeId)) {
    return refuse('USER_NOT_FOUND', 'User not found'); // don't reveal the block
  }
  // A squad invite implies a friendship on accept, so the recipient's
  // "allow friend requests" opt-out applies here too.
  if (!getSettings(inviteeId).allowFriendRequests) {
    return refuse('NOT_ACCEPTING', 'This user is not accepting invites');
  }
  const existing = q.get<{ id: string; status: string }>(
    'SELECT id, status FROM squad_invites WHERE squad_id = ? AND invitee_id = ?',
    squadId, inviteeId,
  );
  if (existing?.status === 'pending') {
    return refuse('ALREADY_INVITED', 'They already have a pending invite');
  }
  // Fresh insert, or revive a previously declined/accepted-then-left row.
  q.run(
    `INSERT INTO squad_invites (id, squad_id, inviter_id, invitee_id, status, created_at, resolved_at)
     VALUES (?, ?, ?, ?, 'pending', ?, NULL)
     ON CONFLICT (squad_id, invitee_id) DO UPDATE SET
       status = 'pending', inviter_id = excluded.inviter_id,
       created_at = excluded.created_at, resolved_at = NULL`,
    newId(), squadId, inviterId, inviteeId, now(),
  );
  const inviter = getUserRow(inviterId);
  const squad = q.get<{ name: string; emoji: string }>(
    'SELECT name, emoji FROM squads WHERE id = ?', squadId,
  );
  createNotification({
    userId: inviteeId,
    type: 'squad_invite',
    fromId: inviterId,
    squadId,
    body: `${inviter?.name ?? 'Someone'} invited you to join ${squad?.emoji ?? '✨'} ${squad?.name ?? 'their squad'}`,
  });
  return true;
}

/** Invitee accepts: friendship with the inviter + membership, atomically. */
export function acceptSquadInvite(squadId: string, userId: string): Squad {
  const inv = q.get<{ id: string; inviter_id: string }>(
    "SELECT id, inviter_id FROM squad_invites WHERE squad_id = ? AND invitee_id = ? AND status = 'pending'",
    squadId, userId,
  );
  if (!inv) throw notFound('INVITE_NOT_FOUND', 'Squad invite not found');
  const squad = getSquad(squadId); // throws if the squad is gone
  tx(() => {
    q.run("UPDATE squad_invites SET status = 'accepted', resolved_at = ? WHERE id = ?", now(), inv.id);
    addFriendship(inv.inviter_id, userId);
    q.run(
      'INSERT OR IGNORE INTO squad_members (squad_id, user_id, joined_at) VALUES (?, ?, ?)',
      squadId, userId, now(),
    );
    q.run(
      "UPDATE notifications SET read = 1, resolved = 1 WHERE user_id = ? AND type = 'squad_invite' AND squad_id = ?",
      userId, squadId,
    );
  });
  const accepter = getUserRow(userId);
  createNotification({
    userId: inv.inviter_id,
    type: 'friend_accepted',
    fromId: userId,
    squadId,
    body: `${accepter?.name ?? 'Someone'} joined ${squad.emoji} ${squad.name} — you're now friends 🎉`,
  });
  publish({ channel: `squad:${squadId}`, type: 'squad.updated', data: { squadId } });
  fanFeedChanged([userId], 'squad.member.added');
  return getSquad(squadId);
}

/** Invitee declines: mark the row + resolve the notification. No friendship. */
export function declineSquadInvite(squadId: string, userId: string): void {
  const inv = q.get<{ id: string }>(
    "SELECT id FROM squad_invites WHERE squad_id = ? AND invitee_id = ? AND status = 'pending'",
    squadId, userId,
  );
  if (!inv) throw notFound('INVITE_NOT_FOUND', 'Squad invite not found');
  q.run("UPDATE squad_invites SET status = 'declined', resolved_at = ? WHERE id = ?", now(), inv.id);
  q.run(
    "UPDATE notifications SET read = 1, resolved = 1 WHERE user_id = ? AND type = 'squad_invite' AND squad_id = ?",
    userId, squadId,
  );
}

/** Host-only: remove a member. */
export function removeSquadMember(squadId: string, actingUserId: string, memberId: string): Squad {
  if (!isSquadHost(squadId, actingUserId)) throw forbidden('Only the squad host can remove members');
  q.run('DELETE FROM squad_members WHERE squad_id = ? AND user_id = ?', squadId, memberId);
  fanFeedChanged([memberId], 'squad.member.removed');
  return getSquad(squadId);
}

/** Member-only: leave a squad without deleting it. The host cannot "leave". */
export function leaveSquad(squadId: string, userId: string): void {
  if (isSquadHost(squadId, userId)) {
    throw forbidden('You host this squad — delete it instead of leaving');
  }
  q.run('DELETE FROM squad_members WHERE squad_id = ? AND user_id = ?', squadId, userId);
  fanFeedChanged([userId], 'squad.left');
}
