import { Router } from 'express';
import { badRequest } from '../lib/errors.js';
import { handler, requireString, optionalString } from '../lib/http.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  emailIsRegistered, firebaseSignIn, loginEmail, refreshSession, registerEmail, revokeRefreshToken,
} from '../services/auth.js';
import { handleAvailable, normalizeHandle } from '../services/users.js';

export const authRouter = Router();

/** GET /v1/auth/handle-available?handle= — public handle check. */
authRouter.get('/handle-available', handler((req, res) => {
  const handle = normalizeHandle(String(req.query.handle ?? ''));
  res.json({ handle, available: handle.length >= 2 && handleAvailable(handle) });
}));

/** POST /v1/auth/email/register */
authRouter.post('/email/register', authLimiter, handler((req, res) => {
  // dateOfBirth is required for new signups (Apple Guideline 1.3, COPPA) and
  // arrives as epoch ms. registerEmail / createUser enforce the ≥13 floor.
  const dob = (req.body as { dateOfBirth?: unknown })?.dateOfBirth;
  if (typeof dob !== 'number') {
    throw badRequest('MISSING_DOB', 'dateOfBirth is required', 'dateOfBirth');
  }
  const result = registerEmail({
    email: requireString(req.body, 'email'),
    password: requireString(req.body, 'password'),
    name: requireString(req.body, 'name'),
    handle: requireString(req.body, 'handle'),
    avatar: optionalString(req.body, 'avatar'),
    color: optionalString(req.body, 'color'),
    dateOfBirth: dob,
  });
  res.status(201).json(result);
}));

/** POST /v1/auth/email/login */
authRouter.post('/email/login', authLimiter, handler((req, res) => {
  res.json(loginEmail(
    requireString(req.body, 'email'),
    requireString(req.body, 'password'),
  ));
}));

/**
 * POST /v1/auth/firebase — sign in with a verified Firebase ID token.
 *
 * Two-call flow for new users:
 *   1. Client calls with just { idToken } after a successful native
 *      Apple/Google/Email signin via Firebase. Server verifies the token.
 *   2a. Existing user → returns the session immediately.
 *   2b. New user → responds with { needsOnboarding: true, ... }, and the
 *       client routes to the onboarding screen to collect DOB + handle.
 *       Onboarding then re-calls this endpoint with the same idToken + the
 *       onboarding fields populated, and we create the account.
 *
 * The dateOfBirth ≥13 floor is enforced inside createUser (COPPA — Apple
 * Guideline 1.3). The idToken stays valid for an hour, so the round-trip
 * through onboarding is well within window.
 */
authRouter.post('/firebase', authLimiter, handler(async (req, res) => {
  const idToken = requireString(req.body, 'idToken');
  const body = (req.body ?? {}) as Record<string, unknown>;
  const dob = typeof body.dateOfBirth === 'number' ? body.dateOfBirth : undefined;
  const handle = typeof body.handle === 'string' ? body.handle : undefined;
  const result = await firebaseSignIn({
    idToken,
    dateOfBirth: dob,
    handle,
    name: optionalString(req.body, 'name'),
    avatar: optionalString(req.body, 'avatar'),
    color: optionalString(req.body, 'color'),
  });
  if (result.kind === 'needsOnboarding') {
    // 422 (Unprocessable Entity) — request was valid but more info is needed
    // before we can create the account. Distinguishable from 200/login.
    res.status(422).json({
      needsOnboarding: true,
      firebaseUid: result.firebaseUid,
      provider: result.provider,
      suggestedName: result.suggestedName,
      email: result.email,
    });
    return;
  }
  res.json(result.result);
}));

/**
 * POST /v1/auth/email/reset — kick off a Firebase password reset email.
 *
 * We respond 200 regardless of whether the email is registered (so attackers
 * can't enumerate accounts), but only actually trigger the Firebase send when
 * the email matches a known account. Firebase handles the email delivery +
 * the reset link landing page.
 */
authRouter.post('/email/reset', authLimiter, handler(async (req, res) => {
  const email = requireString(req.body, 'email').trim().toLowerCase();
  if (emailIsRegistered(email)) {
    // Firebase's generatePasswordResetLink sends the email via Firebase Auth
    // templates. Import lazy so the route works even without Firebase configured.
    try {
      const { getAuth } = await import('firebase-admin/auth');
      const { getFirebaseApp } = await import('../lib/firebase.js');
      const app = getFirebaseApp();
      if (app) {
        // Generates the link AND sends the email when the user exists in
        // Firebase Auth. For users who only exist in our local DB (signed up
        // via /email/register without going through Firebase), this throws —
        // we swallow and respond 200 so the response is uniform.
        await getAuth(app).generatePasswordResetLink(email).catch(() => undefined);
      }
    } catch { /* swallowed — uniform 200 response */ }
  }
  res.json({ ok: true });
}));

/** POST /v1/auth/token/refresh */
authRouter.post('/token/refresh', authLimiter, handler((req, res) => {
  res.json(refreshSession(requireString(req.body, 'refreshToken')));
}));

/** POST /v1/auth/logout */
authRouter.post('/logout', handler((req, res) => {
  const token = optionalString(req.body, 'refreshToken');
  if (token) revokeRefreshToken(token);
  res.json({ ok: true });
}));
