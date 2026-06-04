import { Router } from 'express';
import { uid } from '../auth/middleware.js';
import { handler, optionalString, requireString } from '../lib/http.js';
import {
  acceptFriendRequest, addSquadMember, createSquad, declineFriendRequest, deleteSquad,
  discoverUsers, getSquad, incomingRequests, leaveSquad, listFriends, listSquadsForUser,
  matchContacts, outgoingRequests, removeFriend, removeSquadMember, sendFriendRequest, updateSquad,
} from '../services/social.js';
import { blockUser, listBlockedByMe, unblockUser } from '../services/safety.js';
import { collectUserIds, hydrateUsers } from '../services/hydrate.js';
import type { Squad } from '../types.js';

/** Side-load the users referenced by a set of squads. */
const squadUsers = (squads: Squad[]) => ({ users: hydrateUsers(collectUserIds({ squads })) });

export const socialRouter = Router();

/* ---- friends ---- */

socialRouter.get('/friends', handler((req, res) => {
  res.json({ friends: listFriends(uid(req)) });
}));

socialRouter.get('/friends/discover', handler((req, res) => {
  res.json({ users: discoverUsers(uid(req), String(req.query.q ?? '')) });
}));

/** POST /v1/friends/contact-match
 *  Body: { emails?: string[]; phones?: string[] } — raw contact entries
 *  read from the device. Both fields are optional; provide either or both.
 *  Response: { users: (PublicUser & { isFriend: boolean })[] } — matched
 *  WUD users, minus the caller and blocked-either-side pairs. Existing
 *  friends ARE included with isFriend=true so the client can render an
 *  "already friends" badge instead of an Add button. */
socialRouter.post('/friends/contact-match', handler((req, res) => {
  const body = req.body ?? {};
  const emails = Array.isArray(body.emails)
    ? body.emails.filter((x: unknown): x is string => typeof x === 'string')
    : [];
  const phones = Array.isArray(body.phones)
    ? body.phones.filter((x: unknown): x is string => typeof x === 'string')
    : [];
  const matches = matchContacts(uid(req), { emails, phones });
  res.json({ users: matches.map(m => ({ ...m.user, isFriend: m.isFriend })) });
}));

socialRouter.delete('/friends/:userId', handler((req, res) => {
  removeFriend(uid(req), req.params.userId);
  res.json({ ok: true });
}));

/* ---- blocks (Apple Guideline 1.2) ---- */

socialRouter.get('/me/blocks', handler((req, res) => {
  res.json({ blocked: listBlockedByMe(uid(req)) });
}));

socialRouter.post('/me/blocks', handler((req, res) => {
  blockUser(uid(req), requireString(req.body, 'userId'));
  res.status(201).json({ ok: true });
}));

socialRouter.delete('/me/blocks/:userId', handler((req, res) => {
  unblockUser(uid(req), req.params.userId);
  res.json({ ok: true });
}));

socialRouter.get('/friend-requests', handler((req, res) => {
  res.json({ requests: incomingRequests(uid(req)) });
}));

/** Requests this user has sent and is still waiting on. */
socialRouter.get('/friend-requests/outgoing', handler((req, res) => {
  res.json({ requests: outgoingRequests(uid(req)) });
}));

socialRouter.post('/friend-requests', handler((req, res) => {
  const id = sendFriendRequest(uid(req), requireString(req.body, 'recipientId'));
  res.status(201).json({ requestId: id });
}));

socialRouter.post('/friend-requests/:id/accept', handler((req, res) => {
  acceptFriendRequest(req.params.id, uid(req));
  res.json({ ok: true });
}));

socialRouter.post('/friend-requests/:id/decline', handler((req, res) => {
  declineFriendRequest(req.params.id, uid(req));
  res.json({ ok: true });
}));

/* ---- squads ---- */

socialRouter.get('/squads', handler((req, res) => {
  const squads = listSquadsForUser(uid(req));
  res.json({ squads, ...squadUsers(squads) });
}));

socialRouter.post('/squads', handler((req, res) => {
  const squad = createSquad({
    hostId: uid(req),
    name: requireString(req.body, 'name'),
    emoji: optionalString(req.body, 'emoji'),
    memberIds: Array.isArray(req.body?.memberIds) ? req.body.memberIds : [],
  });
  res.status(201).json({ squad });
}));

socialRouter.get('/squads/:id', handler((req, res) => {
  const squad = getSquad(req.params.id);
  res.json({ squad, ...squadUsers([squad]) });
}));

socialRouter.patch('/squads/:id', handler((req, res) => {
  const squad = updateSquad(req.params.id, uid(req), {
    name: optionalString(req.body, 'name'),
    emoji: optionalString(req.body, 'emoji'),
  });
  res.json({ squad });
}));

socialRouter.delete('/squads/:id', handler((req, res) => {
  deleteSquad(req.params.id, uid(req));
  res.json({ ok: true });
}));

socialRouter.post('/squads/:id/members', handler((req, res) => {
  const squad = addSquadMember(req.params.id, uid(req), requireString(req.body, 'userId'));
  res.json({ squad });
}));

socialRouter.delete('/squads/:id/members/:userId', handler((req, res) => {
  const squad = removeSquadMember(req.params.id, uid(req), req.params.userId);
  res.json({ squad });
}));

socialRouter.post('/squads/:id/leave', handler((req, res) => {
  leaveSquad(req.params.id, uid(req));
  res.json({ ok: true });
}));
