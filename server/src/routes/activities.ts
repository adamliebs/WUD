import { Router } from 'express';
import { uid } from '../auth/middleware.js';
import { q } from '../db/index.js';
import { badRequest, conflict } from '../lib/errors.js';
import { handler, optionalString, requireString } from '../lib/http.js';
import { createNotification } from '../services/notifications.js';
import { getUserRow } from '../services/users.js';
import {
  createActivity, feedFor, getActivity, getActivityRow, hasFoFAvailable, historyFor,
  leaveActivity, setRsvp, toggleReaction, updateActivity,
} from '../services/activities.js';
import { resolveHostOffers } from '../services/notifications.js';
import { collectUserIds, hydrateUsers } from '../services/hydrate.js';
import type { Activity, CategoryKey, RsvpState } from '../types.js';

/** Attach the `users` cache for a set of activities (side-loaded resources). */
function withUsers(activities: Activity[]) {
  return { users: hydrateUsers(collectUserIds({ activities })) };
}

export const activitiesRouter = Router();

const RSVP_STATES = new Set<RsvpState | 'none'>(['going', 'maybe', 'cant', 'none']);

/** GET /v1/feed?scope=&category=&timeWindow= */
activitiesRouter.get('/feed', handler((req, res) => {
  const id = uid(req);
  const activities = feedFor(id, {
    scope: req.query.scope === 'friends' ? 'friends' : 'fof',
    category: req.query.category ? (String(req.query.category) as CategoryKey) : undefined,
    timeWindow: ['now', 'today', 'week', 'all'].includes(String(req.query.timeWindow))
      ? (String(req.query.timeWindow) as 'now' | 'today' | 'week' | 'all') : undefined,
  });
  res.json({ activities, hasFoF: hasFoFAvailable(id), ...withUsers(activities) });
}));

/** GET /v1/history */
activitiesRouter.get('/history', handler((req, res) => {
  const activities = historyFor(uid(req));
  res.json({ activities, ...withUsers(activities) });
}));

/** POST /v1/activities */
activitiesRouter.post('/activities', handler((req, res) => {
  const b = req.body ?? {};
  if (typeof b.startsAt !== 'number') {
    throw badRequest('VALIDATION', 'startsAt (epoch ms) is required', 'startsAt');
  }
  if (typeof b.endsAt !== 'number') {
    throw badRequest('VALIDATION', 'endsAt (epoch ms) is required', 'endsAt');
  }
  const activity = createActivity(uid(req), {
    category: requireString(b, 'category') as CategoryKey,
    customEmoji: optionalString(b, 'customEmoji'),
    customLabel: optionalString(b, 'customLabel'),
    title: requireString(b, 'title'),
    place: optionalString(b, 'place'),
    description: optionalString(b, 'description'),
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    maxSize: typeof b.maxSize === 'number' ? b.maxSize : undefined,
    isPrivate: !!b.isPrivate,
    isOpenInvite: b.isOpenInvite !== false,
    bannerUrl: optionalString(b, 'bannerUrl'),
    recurrence: b.recurrence ?? undefined,
    reminderMins: b.reminderMins === undefined ? undefined : b.reminderMins,
    squadIds: Array.isArray(b.squadIds) ? b.squadIds : [],
  });
  res.status(201).json({ activity, ...withUsers([activity]) });
}));

/** GET /v1/activities/:id */
activitiesRouter.get('/activities/:id', handler((req, res) => {
  const activity = getActivity(req.params.id);
  res.json({ activity, ...withUsers([activity]) });
}));

/** PATCH /v1/activities/:id — host-only edit. */
activitiesRouter.patch('/activities/:id', handler((req, res) => {
  const b = req.body ?? {};
  const activity = updateActivity(uid(req), req.params.id, {
    title: optionalString(b, 'title'),
    description: optionalString(b, 'description'),
    place: optionalString(b, 'place'),
    startsAt: typeof b.startsAt === 'number' ? b.startsAt : undefined,
    endsAt:   typeof b.endsAt   === 'number' ? b.endsAt   : undefined,
    maxSize: 'maxSize' in b ? (b.maxSize ?? null) : undefined,
    bannerUrl: 'bannerUrl' in b ? (b.bannerUrl ?? null) : undefined,
    isPrivate: typeof b.isPrivate === 'boolean' ? b.isPrivate : undefined,
    isOpenInvite: typeof b.isOpenInvite === 'boolean' ? b.isOpenInvite : undefined,
    squadIds: Array.isArray(b.squadIds)
      ? b.squadIds.filter((x: unknown): x is string => typeof x === 'string')
      : undefined,
    // Wire encoding: 'default' clears the override, 'off' disables, number = lead.
    reminderMins: b.reminderMins === 'default' ? 'default'
      : b.reminderMins === 'off' ? 'off'
      : typeof b.reminderMins === 'number' ? b.reminderMins
      : undefined,
    category: typeof b.category === 'string' ? b.category as CategoryKey : undefined,
    customEmoji: optionalString(b, 'customEmoji'),
    customLabel: optionalString(b, 'customLabel'),
  });
  res.json({ activity, ...withUsers([activity]) });
}));

/** PUT /v1/activities/:id/rsvp  body: { state } */
activitiesRouter.put('/activities/:id/rsvp', handler((req, res) => {
  const state = requireString(req.body, 'state') as RsvpState | 'none';
  if (!RSVP_STATES.has(state)) {
    throw badRequest('BAD_RSVP', 'state must be going/maybe/cant/none', 'state');
  }
  const activity = setRsvp(uid(req), req.params.id, state);
  res.json({ activity, ...withUsers([activity]) });
}));

/** POST /v1/activities/:id/leave — leave; triggers host transfer if host. */
activitiesRouter.post('/activities/:id/leave', handler((req, res) => {
  const result = leaveActivity(uid(req), req.params.id);
  res.json({ ...result, ...withUsers(result.activity ? [result.activity] : []) });
}));

/** POST /v1/activities/:id/host/accept — confirm you'll keep the host role.
 *  Also notifies the other participants that hosting changed hands so the
 *  going crew knows who's now running point on the plan. */
activitiesRouter.post('/activities/:id/host/accept', handler((req, res) => {
  const id = uid(req);
  const row = getActivityRow(req.params.id);
  if (!row) throw badRequest('ACTIVITY_NOT_FOUND', 'Plan not found');
  if (row.host_id !== id) throw conflict('NOT_HOST', 'You are not the host of this plan');
  resolveHostOffers(id, req.params.id);
  // Tell the other going participants the host role is now held — the
  // system message already lives in chat; this is the push/inbox surface.
  const newHost = getUserRow(id);
  const newHostName = newHost?.name ?? 'A new host';
  const participants = q.all<{ user_id: string }>(
    "SELECT user_id FROM rsvps WHERE activity_id = ? AND state = 'going'",
    req.params.id,
  );
  for (const p of participants) {
    if (p.user_id === id) continue;
    createNotification({
      userId: p.user_id,
      type: 'host_taken',
      fromId: id,
      activityId: req.params.id,
      body: `${newHostName} is now hosting "${row.title}"`,
    });
  }
  const activity = getActivity(req.params.id);
  res.json({ activity, ...withUsers([activity]) });
}));

/** POST /v1/activities/:id/host/decline — pass the host role on (or dissolve). */
activitiesRouter.post('/activities/:id/host/decline', handler((req, res) => {
  const id = uid(req);
  resolveHostOffers(id, req.params.id);
  const result = leaveActivity(id, req.params.id);
  res.json({ ...result, ...withUsers(result.activity ? [result.activity] : []) });
}));

/** PUT /v1/activities/:id/reaction  body: { emoji }  — toggles. */
activitiesRouter.put('/activities/:id/reaction', handler((req, res) => {
  const activity = toggleReaction(uid(req), req.params.id, requireString(req.body, 'emoji'));
  res.json({ activity, ...withUsers([activity]) });
}));
