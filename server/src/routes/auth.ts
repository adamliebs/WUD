import { Router } from 'express';
import { q } from '../db/index.js';
import { badRequest } from '../lib/errors.js';
import { handler, requireString, optionalString } from '../lib/http.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';
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
 * POST /v1/auth/email/reset — kick off a password reset email.
 *
 * Always responds 200 regardless of whether the email is registered (so
 * attackers can't enumerate accounts). When the email IS registered we ask
 * Firebase Admin to GENERATE the reset link (so Firebase still owns the
 * verification of the resulting click) but deliver it ourselves via SendGrid
 * — that way the message comes from noreply@whatudoing.app with our HTML,
 * which dramatically improves deliverability vs Firebase's default sender.
 */
authRouter.post('/email/reset', authLimiter, handler(async (req, res) => {
  const email = requireString(req.body, 'email').trim().toLowerCase();
  if (emailIsRegistered(email)) {
    try {
      const { getAuth } = await import('firebase-admin/auth');
      const { getFirebaseApp } = await import('../lib/firebase.js');
      const app = getFirebaseApp();
      if (app) {
        const link = await getAuth(app).generatePasswordResetLink(email).catch(() => null);
        if (link) {
          // Best-effort name lookup so the email greeting can be personal.
          const row = q.get<{ name: string }>(
            `SELECT u.name FROM users u
               JOIN auth_identities ai ON ai.user_id = u.id
              WHERE ai.provider = 'email' AND ai.email = ?`,
            email,
          );
          await sendPasswordResetEmail(email, link, row?.name).catch(err =>
            logger.warn({ err }, '[auth/reset] sendgrid send failed (non-fatal)'),
          );
        }
      }
    } catch (err) {
      // Uniform 200 — never reveal whether the address exists.
      logger.warn({ err }, '[auth/reset] generate-link failed (non-fatal)');
    }
  }
  res.json({ ok: true });
}));

/**
 * POST /v1/auth/email/send-verification — body: { idToken }
 *
 * Used by the client after signup AND for the "Resend verification" button
 * on the verify-email screen. We verify the Firebase ID token to pin down
 * who's asking, ask Firebase to generate the action link (`mode=verifyEmail`),
 * and send it ourselves via SendGrid. The link is still a real Firebase
 * action URL — when the user clicks it, Firebase verifies the email and
 * marks the user as emailVerified.
 *
 * No-ops cleanly if the email is already verified (avoids a redundant send
 * if the user keeps tapping resend after they've already confirmed).
 */
authRouter.post('/email/send-verification', authLimiter, handler(async (req, res) => {
  const idToken = requireString(req.body, 'idToken');
  try {
    const { getAuth } = await import('firebase-admin/auth');
    const { getFirebaseApp } = await import('../lib/firebase.js');
    const app = getFirebaseApp();
    if (!app) throw badRequest('FIREBASE_UNCONFIGURED', 'Firebase Auth not configured');
    const auth = getAuth(app);
    const decoded = await auth.verifyIdToken(idToken).catch(() => null);
    if (!decoded?.email) {
      throw badRequest('INVALID_TOKEN', 'Could not verify your sign-in token');
    }
    if (decoded.email_verified) {
      // Already verified — pretend we sent so the client's "check your inbox"
      // toast stays consistent (and we save the user a confusing no-op email).
      res.json({ ok: true, alreadyVerified: true });
      return;
    }
    const link = await auth.generateEmailVerificationLink(decoded.email);
    // Best-effort name lookup keyed by Firebase UID so the greeting is
    // personal even for users mid-signup who already have a WUD user row.
    const row = q.get<{ name: string }>(
      `SELECT u.name FROM users u
         JOIN auth_identities ai ON ai.user_id = u.id
        WHERE ai.provider_subject = ? OR (ai.provider = 'email' AND ai.email = ?)
        LIMIT 1`,
      decoded.uid, decoded.email,
    );
    const sent = await sendVerificationEmail(decoded.email, link, row?.name);
    res.json({ ok: sent });
  } catch (err) {
    logger.warn({ err }, '[auth/send-verification] failed');
    throw badRequest('SEND_FAILED', 'Could not send verification email');
  }
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
