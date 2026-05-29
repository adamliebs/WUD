import { Router } from 'express';
import { uid } from '../auth/middleware.js';
import { handler } from '../lib/http.js';
import { feedFor, hasFoFAvailable, historyFor } from '../services/activities.js';
import { floatsFor } from '../services/floats.js';
import { collectUserIds, hydrateUsers } from '../services/hydrate.js';
import { listNotifications, unreadCount } from '../services/notifications.js';
import { friendIds, listFriends, listSquadsForUser } from '../services/social.js';
import { getPublicUser, getSettings } from '../services/users.js';

export const bootstrapRouter = Router();

/**
 * GET /v1/bootstrap — a single complete snapshot the client loads on sign-in.
 * Returns everything the app needs plus a fully-hydrated `users` cache, so the
 * client never has to resolve a dangling user id (SRS §10 / FR-FEED-02).
 */
bootstrapRouter.get('/bootstrap', handler((req, res) => {
  const me = uid(req);

  const feed = feedFor(me);            // upcoming, visible (no discovery filters — client slices)
  const history = historyFor(me);      // past activities I hosted/joined
  const squads = listSquadsForUser(me);
  const notifications = listNotifications(me);
  const friends = listFriends(me);
  const floats = floatsFor(me);

  // Everyone referenced anywhere, hydrated into a flat cache.
  const userIds = collectUserIds({
    activities: [...feed, ...history],
    squads,
    notifications,
    people: friends,
    extra: [me, ...floats.flatMap(f => [f.senderId, ...f.responses.map(r => r.userId)])],
  });

  res.json({
    user: getPublicUser(me),
    settings: getSettings(me),
    friendIds: friendIds(me),
    squads,
    activities: [...feed, ...history],
    floats,
    notifications,
    unread: unreadCount(me),
    hasFoF: hasFoFAvailable(me),
    users: hydrateUsers(userIds),
  });
}));
