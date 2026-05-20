import { Router } from 'express';
import { badRequest } from '../lib/errors.js';
import { handler, requireString, optionalString } from '../lib/http.js';
import {
  loginEmail, oauthUpsert, refreshSession, registerEmail, revokeRefreshToken,
} from '../services/auth.js';
import { handleAvailable, normalizeHandle } from '../services/users.js';

export const authRouter = Router();

/** GET /v1/auth/handle-available?handle= — public handle check. */
authRouter.get('/handle-available', handler((req, res) => {
  const handle = normalizeHandle(String(req.query.handle ?? ''));
  res.json({ handle, available: handle.length >= 2 && handleAvailable(handle) });
}));

/** POST /v1/auth/email/register */
authRouter.post('/email/register', handler((req, res) => {
  const result = registerEmail({
    email: requireString(req.body, 'email'),
    password: requireString(req.body, 'password'),
    name: requireString(req.body, 'name'),
    handle: requireString(req.body, 'handle'),
    avatar: optionalString(req.body, 'avatar'),
    color: optionalString(req.body, 'color'),
  });
  res.status(201).json(result);
}));

/** POST /v1/auth/email/login */
authRouter.post('/email/login', handler((req, res) => {
  res.json(loginEmail(
    requireString(req.body, 'email'),
    requireString(req.body, 'password'),
  ));
}));

/**
 * POST /v1/auth/oauth/:provider
 * PRODUCTION: the request would carry the provider authorization code; the
 * server verifies it with the provider and extracts `(subject, email, name)`.
 * Here the client supplies an already-trusted `subject` for the mockup.
 */
authRouter.post('/oauth/:provider', handler((req, res) => {
  const provider = req.params.provider;
  if (provider !== 'google' && provider !== 'apple' && provider !== 'facebook') {
    throw badRequest('UNKNOWN_PROVIDER', 'Unsupported OAuth provider', 'provider');
  }
  const result = oauthUpsert({
    provider,
    subject: requireString(req.body, 'subject'),
    email: optionalString(req.body, 'email'),
    name: optionalString(req.body, 'name'),
    handleSuggestion: optionalString(req.body, 'handle'),
  });
  res.json(result);
}));

/** POST /v1/auth/token/refresh */
authRouter.post('/token/refresh', handler((req, res) => {
  res.json(refreshSession(requireString(req.body, 'refreshToken')));
}));

/** POST /v1/auth/logout */
authRouter.post('/logout', handler((req, res) => {
  const token = optionalString(req.body, 'refreshToken');
  if (token) revokeRefreshToken(token);
  res.json({ ok: true });
}));
