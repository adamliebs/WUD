import { Router } from 'express';
import { uid } from '../auth/middleware.js';
import { badRequest } from '../lib/errors.js';
import { handler, optionalString, requireString } from '../lib/http.js';
import { revokeAllForUser } from '../services/auth.js';
import { db } from '../db/index.js';
import {
  getPublicUser, getSettings, registerDevice, removeDevice, updateSettings, updateUser,
} from '../services/users.js';
import type { AppSettings } from '../types.js';

export const usersRouter = Router();

/** GET /v1/me — current profile + settings. */
usersRouter.get('/me', handler((req, res) => {
  const id = uid(req);
  res.json({ user: getPublicUser(id), settings: getSettings(id) });
}));

/** PATCH /v1/me — update profile fields. */
usersRouter.patch('/me', handler((req, res) => {
  const b = req.body ?? {};
  const user = updateUser(uid(req), {
    name: optionalString(b, 'name'),
    handle: optionalString(b, 'handle'),
    avatar: optionalString(b, 'avatar'),
    color: optionalString(b, 'color'),
    photoUrl: 'photoUrl' in b ? (b.photoUrl ?? null) : undefined,
  });
  res.json({ user });
}));

/** PATCH /v1/me/settings */
usersRouter.patch('/me/settings', handler((req, res) => {
  const b = (req.body ?? {}) as Partial<AppSettings>;
  res.json({ settings: updateSettings(uid(req), b) });
}));

/** POST /v1/me/devices — register a push token. */
usersRouter.post('/me/devices', handler((req, res) => {
  const platform = requireString(req.body, 'platform');
  if (platform !== 'ios' && platform !== 'android' && platform !== 'web') {
    throw badRequest('BAD_PLATFORM', 'platform must be ios/android/web', 'platform');
  }
  const id = registerDevice(uid(req), platform, requireString(req.body, 'pushToken'));
  res.status(201).json({ deviceId: id });
}));

/** DELETE /v1/me/devices/:id */
usersRouter.delete('/me/devices/:id', handler((req, res) => {
  removeDevice(uid(req), req.params.id);
  res.json({ ok: true });
}));

/** DELETE /v1/account — erase the account and all owned data (SRS SEC-10). */
usersRouter.delete('/account', handler((req, res) => {
  const id = uid(req);
  revokeAllForUser(id);
  // FK cascades remove the user's activities, rsvps, messages, squads, etc.
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
}));

/** GET /v1/users/:id — public-safe profile of another user. */
usersRouter.get('/users/:id', handler((req, res) => {
  res.json({ user: getPublicUser(req.params.id) });
}));
