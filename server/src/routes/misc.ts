import { Router } from 'express';
import { uid } from '../auth/middleware.js';
import { badRequest } from '../lib/errors.js';
import { handler, requireString } from '../lib/http.js';
import { search, suggestions, trending } from '../services/discovery.js';
import { collectUserIds, hydrateUsers } from '../services/hydrate.js';
import { listNotifications, markAllRead, sendPing, unreadCount } from '../services/notifications.js';
import { clearLiveStatus, setLiveStatus } from '../services/presence.js';
import { friendIds } from '../services/social.js';
import { getUserRow, toPublicUser } from '../services/users.js';

export const miscRouter = Router();

/* ---- notifications ---- */

miscRouter.get('/notifications', handler((req, res) => {
  const id = uid(req);
  res.json({ notifications: listNotifications(id), unread: unreadCount(id) });
}));

miscRouter.post('/notifications/read', handler((req, res) => {
  markAllRead(uid(req));
  res.json({ ok: true });
}));

/* ---- presence / live status ---- */

miscRouter.get('/live', handler((req, res) => {
  // Live statuses of the caller's friends (+ themselves).
  const id = uid(req);
  const ids = [id, ...friendIds(id)];
  const live = ids
    .map(getUserRow)
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(toPublicUser)
    .filter(u => u.liveStatus);
  res.json({ live });
}));

miscRouter.put('/me/live-status', handler((req, res) => {
  const b = req.body ?? {};
  if (typeof b.durationMins !== 'number') {
    throw badRequest('VALIDATION', 'durationMins is required', 'durationMins');
  }
  const status = setLiveStatus(uid(req), {
    emoji: requireString(b, 'emoji'),
    text: requireString(b, 'text'),
    place: typeof b.place === 'string' ? b.place : undefined,
    openToJoin: !!b.openToJoin,
    durationMins: b.durationMins,
  });
  res.json({ liveStatus: status });
}));

miscRouter.delete('/me/live-status', handler((req, res) => {
  clearLiveStatus(uid(req));
  res.json({ ok: true });
}));

/* ---- pings ---- */

miscRouter.post('/pings', handler((req, res) => {
  const id = uid(req);
  const text = requireString(req.body, 'text');
  const friends = new Set(friendIds(id));

  // Recipients: an explicit list, else all friends. Always intersected with friends.
  const requested: string[] = Array.isArray(req.body?.recipientIds)
    ? req.body.recipientIds
    : [...friends];
  const recipients = requested.filter(r => friends.has(r));
  if (recipients.length === 0) {
    throw badRequest('NO_RECIPIENTS', 'Pick at least one friend to ping');
  }
  const delivered = sendPing(id, text, recipients);
  res.json({ delivered });
}));

/* ---- discovery ---- */

miscRouter.get('/search', handler((req, res) => {
  const results = search(uid(req), String(req.query.q ?? ''));
  // Side-load users for the matched plans' hosts/joiners (people are full users already).
  const users = hydrateUsers(collectUserIds({ activities: results.plans, people: results.people }));
  res.json({ ...results, users });
}));

miscRouter.get('/trending', handler((req, res) => {
  res.json({ trending: trending(uid(req)) });
}));

miscRouter.get('/suggestions', handler((req, res) => {
  res.json({ suggestions: suggestions(uid(req)) });
}));
