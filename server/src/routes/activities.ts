import { Router } from 'express';
import { uid } from '../auth/middleware.js';
import { badRequest, conflict } from '../lib/errors.js';
import { handler, optionalString, requireString } from '../lib/http.js';
import {
  createActivity, feedFor, getActivity, getActivityRow, hasFoFAvailable, historyFor,
  leaveActivity, setRsvp, toggleReaction, updateActivity,
} from '../services/activities.js';
import { resolveHostOffers } from '../services/notifications.js';
import type { CategoryKey, RsvpState } from '../types.js';

export const activitiesRouter = Router();

const RSVP_STATES = new Set<RsvpState | 'none'>(['going', 'maybe', 'cant', 'none']);

/** GET /v1/feed?scope=&category=&timeWindow=&nearMe= */
activitiesRouter.get('/feed', handler((req, res) => {
  const id = uid(req);
  const activities = feedFor(id, {
    scope: req.query.scope === 'friends' ? 'friends' : 'fof',
    category: req.query.category ? (String(req.query.category) as CategoryKey) : undefined,
    timeWindow: ['now', 'today', 'week', 'all'].includes(String(req.query.timeWindow))
      ? (String(req.query.timeWindow) as 'now' | 'today' | 'week' | 'all') : undefined,
    nearMe: req.query.nearMe === 'true',
  });
  res.json({ activities, hasFoF: hasFoFAvailable(id) });
}));

/** GET /v1/history */
activitiesRouter.get('/history', handler((req, res) => {
  res.json({ activities: historyFor(uid(req)) });
}));

/** POST /v1/activities */
activitiesRouter.post('/activities', handler((req, res) => {
  const b = req.body ?? {};
  if (typeof b.startsAt !== 'number') {
    throw badRequest('VALIDATION', 'startsAt (epoch ms) is required', 'startsAt');
  }
  const activity = createActivity(uid(req), {
    category: requireString(b, 'category') as CategoryKey,
    customEmoji: optionalString(b, 'customEmoji'),
    customLabel: optionalString(b, 'customLabel'),
    title: requireString(b, 'title'),
    place: optionalString(b, 'place'),
    description: optionalString(b, 'description'),
    startsAt: b.startsAt,
    maxSize: typeof b.maxSize === 'number' ? b.maxSize : undefined,
    isPrivate: !!b.isPrivate,
    isOpenInvite: b.isOpenInvite !== false,
    bannerUrl: optionalString(b, 'bannerUrl'),
    recurrence: b.recurrence ?? undefined,
    reminderMins: b.reminderMins === undefined ? undefined : b.reminderMins,
    squadIds: Array.isArray(b.squadIds) ? b.squadIds : [],
    mapX: typeof b.mapX === 'number' ? b.mapX : undefined,
    mapY: typeof b.mapY === 'number' ? b.mapY : undefined,
  });
  res.status(201).json({ activity });
}));

/** GET /v1/activities/:id */
activitiesRouter.get('/activities/:id', handler((req, res) => {
  res.json({ activity: getActivity(req.params.id) });
}));

/** PATCH /v1/activities/:id — host-only edit. */
activitiesRouter.patch('/activities/:id', handler((req, res) => {
  const b = req.body ?? {};
  const activity = updateActivity(uid(req), req.params.id, {
    title: optionalString(b, 'title'),
    description: optionalString(b, 'description'),
    place: optionalString(b, 'place'),
    startsAt: typeof b.startsAt === 'number' ? b.startsAt : undefined,
    maxSize: 'maxSize' in b ? (b.maxSize ?? null) : undefined,
    bannerUrl: 'bannerUrl' in b ? (b.bannerUrl ?? null) : undefined,
  });
  res.json({ activity });
}));

/** PUT /v1/activities/:id/rsvp  body: { state } */
activitiesRouter.put('/activities/:id/rsvp', handler((req, res) => {
  const state = requireString(req.body, 'state') as RsvpState | 'none';
  if (!RSVP_STATES.has(state)) {
    throw badRequest('BAD_RSVP', 'state must be going/maybe/cant/none', 'state');
  }
  res.json({ activity: setRsvp(uid(req), req.params.id, state) });
}));

/** POST /v1/activities/:id/leave — leave; triggers host transfer if host. */
activitiesRouter.post('/activities/:id/leave', handler((req, res) => {
  const result = leaveActivity(uid(req), req.params.id);
  res.json(result);
}));

/** POST /v1/activities/:id/host/accept — confirm you'll keep the host role. */
activitiesRouter.post('/activities/:id/host/accept', handler((req, res) => {
  const id = uid(req);
  const row = getActivityRow(req.params.id);
  if (!row) throw badRequest('ACTIVITY_NOT_FOUND', 'Plan not found');
  if (row.host_id !== id) throw conflict('NOT_HOST', 'You are not the host of this plan');
  resolveHostOffers(id, req.params.id);
  res.json({ activity: getActivity(req.params.id) });
}));

/** POST /v1/activities/:id/host/decline — pass the host role on (or dissolve). */
activitiesRouter.post('/activities/:id/host/decline', handler((req, res) => {
  const id = uid(req);
  resolveHostOffers(id, req.params.id);
  const result = leaveActivity(id, req.params.id);
  res.json(result);
}));

/** PUT /v1/activities/:id/reaction  body: { emoji }  — toggles. */
activitiesRouter.put('/activities/:id/reaction', handler((req, res) => {
  res.json({ activity: toggleReaction(uid(req), req.params.id, requireString(req.body, 'emoji')) });
}));
