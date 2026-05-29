import { Router } from 'express';
import { uid } from '../auth/middleware.js';
import { badRequest } from '../lib/errors.js';
import { handler, optionalString, requireString } from '../lib/http.js';
import {
  createFloat, deleteFloat, floatsFor, getFloat, lockFloat, respondToFloat,
} from '../services/floats.js';
import { collectUserIds, hydrateUsers } from '../services/hydrate.js';
import type { CategoryKey, FloatResponseState, FloatTiming } from '../types.js';

export const floatsRouter = Router();

const RESPONSE_STATES = new Set<FloatResponseState>(['keen', 'maybe', 'nah']);
const TIMINGS = new Set<FloatTiming>(['today', 'tomorrow', 'weekend', 'whenever']);

/** GET /v1/floats — active + recently-expired floats I can see. */
floatsRouter.get('/floats', handler((req, res) => {
  const me = uid(req);
  const floats = floatsFor(me);
  // Hydrate sender + responders so the client never has to chase a dangling
  // user id. Same pattern as the feed/bootstrap endpoints.
  const users = hydrateUsers(collectUserIds({
    extra: floats.flatMap(f => [f.senderId, ...f.responses.map(r => r.userId)]),
  }));
  res.json({ floats, users });
}));

/** GET /v1/floats/:id — single float (for deep-link / refresh after an event). */
floatsRouter.get('/floats/:id', handler((req, res) => {
  const f = getFloat(req.params.id);
  const users = hydrateUsers(collectUserIds({
    extra: [f.senderId, ...f.responses.map(r => r.userId)],
  }));
  res.json({ float: f, users });
}));

/** POST /v1/floats — float a soft proposal. */
floatsRouter.post('/floats', handler((req, res) => {
  const b = req.body ?? {};
  const timing = optionalString(b, 'timing');
  if (timing !== undefined && !TIMINGS.has(timing as FloatTiming)) {
    throw badRequest('BAD_TIMING', 'Invalid timing', 'timing');
  }
  const f = createFloat(uid(req), {
    question: requireString(b, 'question'),
    emoji: optionalString(b, 'emoji'),
    place: optionalString(b, 'place'),
    timing: timing as FloatTiming | undefined,
    isOpenInvite: typeof b.isOpenInvite === 'boolean' ? b.isOpenInvite : undefined,
    isPrivate: typeof b.isPrivate === 'boolean' ? b.isPrivate : undefined,
    squadIds: Array.isArray(b.squadIds)
      ? b.squadIds.filter((x: unknown): x is string => typeof x === 'string')
      : undefined,
    lifetimeMs: typeof b.lifetimeMs === 'number' ? b.lifetimeMs : undefined,
  });
  const users = hydrateUsers(collectUserIds({ extra: [f.senderId] }));
  res.json({ float: f, users });
}));

/** PUT /v1/floats/:id/respond  body: { state } */
floatsRouter.put('/floats/:id/respond', handler((req, res) => {
  const state = requireString(req.body, 'state') as FloatResponseState;
  if (!RESPONSE_STATES.has(state)) {
    throw badRequest('BAD_RESPONSE', "state must be 'keen' | 'maybe' | 'nah'", 'state');
  }
  const f = respondToFloat(uid(req), req.params.id, state);
  const users = hydrateUsers(collectUserIds({
    extra: [f.senderId, ...f.responses.map(r => r.userId)],
  }));
  res.json({ float: f, users });
}));

/** POST /v1/floats/:id/lock — sender-only; promotes the float into an activity.
 *  Body shape matches POST /v1/activities (minus category which defaults to
 *  'custom' if omitted, since most floats won't pick one up front). */
floatsRouter.post('/floats/:id/lock', handler((req, res) => {
  const b = req.body ?? {};
  if (typeof b.startsAt !== 'number' || typeof b.endsAt !== 'number') {
    throw badRequest('VALIDATION', 'startsAt and endsAt are required', 'startsAt');
  }
  const result = lockFloat(uid(req), req.params.id, {
    title: optionalString(b, 'title'),
    category: (optionalString(b, 'category') as CategoryKey | undefined) ?? 'custom',
    customEmoji: optionalString(b, 'customEmoji'),
    customLabel: optionalString(b, 'customLabel'),
    place: optionalString(b, 'place'),
    description: optionalString(b, 'description'),
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    maxSize: typeof b.maxSize === 'number' ? b.maxSize : undefined,
    bannerUrl: optionalString(b, 'bannerUrl'),
    isPrivate: typeof b.isPrivate === 'boolean' ? b.isPrivate : undefined,
    isOpenInvite: typeof b.isOpenInvite === 'boolean' ? b.isOpenInvite : undefined,
    squadIds: Array.isArray(b.squadIds)
      ? b.squadIds.filter((x: unknown): x is string => typeof x === 'string')
      : undefined,
    reminderMins: b.reminderMins === null ? null
      : typeof b.reminderMins === 'number' ? b.reminderMins
      : undefined,
  });
  res.json(result);
}));

/** DELETE /v1/floats/:id — sender-only soft delete. */
floatsRouter.delete('/floats/:id', handler((req, res) => {
  deleteFloat(uid(req), req.params.id);
  res.json({ ok: true });
}));
