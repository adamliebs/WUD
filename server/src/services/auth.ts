import { createHash, randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { q, tx } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { getFirebaseApp } from '../lib/firebase.js';
import { newId, now } from '../lib/ids.js';
import { issueAccessToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createUser, getPublicUser, setEmailVerified } from './users.js';
import type { PublicUser } from '../types.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

/* --- refresh tokens ------------------------------------------------------- */

/** Issue a rotating refresh token; returns the opaque token string `<id>.<secret>`. */
function issueRefreshToken(userId: string): string {
  const id = newId();
  const secret = randomBytes(32).toString('base64url');
  q.run(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at)
     VALUES (?, ?, ?, ?, 0, ?)`,
    id, userId, sha256(secret), now() + config.refreshTtlSec * 1000, now(),
  );
  return `${id}.${secret}`;
}

function issueSession(userId: string): AuthResult {
  return {
    user: getPublicUser(userId),
    accessToken: issueAccessToken(userId),
    refreshToken: issueRefreshToken(userId),
  };
}

/**
 * Exchange a refresh token for a fresh access + refresh pair (rotation:
 * the presented token is revoked, SRS SEC-02).
 */
export function refreshSession(refreshToken: string): AuthResult {
  const [id, secret] = refreshToken.split('.');
  const row = q.get<{ user_id: string; token_hash: string; expires_at: number; revoked: number }>(
    'SELECT user_id, token_hash, expires_at, revoked FROM refresh_tokens WHERE id = ?', id,
  );
  if (!row || row.revoked || row.expires_at < now() || !secret || row.token_hash !== sha256(secret)) {
    throw unauthorized('Invalid or expired refresh token');
  }
  return tx(() => {
    q.run('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', id);  // rotate
    return issueSession(row.user_id);
  });
}

/** Revoke a refresh token (logout). */
export function revokeRefreshToken(refreshToken: string): void {
  const [id] = refreshToken.split('.');
  if (id) q.run('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', id);
}

/** Revoke every refresh token for a user (e.g. account deletion / "log out everywhere"). */
export function revokeAllForUser(userId: string): void {
  q.run('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', userId);
}

/* --- email auth ----------------------------------------------------------- */

export function registerEmail(input: {
  email: string;
  password: string;
  name: string;
  handle: string;
  avatar?: string;
  color?: string;
  /** Epoch ms — required for new signups (Apple Guideline 1.3 / COPPA). */
  dateOfBirth?: number;
}): AuthResult {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@')) throw badRequest('INVALID_EMAIL', 'Enter a valid email', 'email');
  if (input.password.length < 6) {
    throw badRequest('WEAK_PASSWORD', 'Password must be at least 6 characters', 'password');
  }
  if (q.get('SELECT 1 FROM auth_identities WHERE provider = ? AND email = ?', 'email', email)) {
    throw conflict('EMAIL_TAKEN', 'An account already exists for that email', 'email');
  }
  return tx(() => {
    const user = createUser({
      name: input.name, handle: input.handle,
      avatar: input.avatar, color: input.color,
      dateOfBirth: input.dateOfBirth,
    });
    q.run(
      `INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, password_hash, created_at)
       VALUES (?, ?, 'email', ?, ?, ?, ?)`,
      newId(), user.id, email, email, hashPassword(input.password), now(),
    );
    return issueSession(user.id);
  });
}

export function loginEmail(email: string, password: string): AuthResult {
  const norm = email.trim().toLowerCase();
  const row = q.get<{ user_id: string; password_hash: string | null }>(
    'SELECT user_id, password_hash FROM auth_identities WHERE provider = ? AND email = ?',
    'email', norm,
  );
  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
    // Same error whether the email or password is wrong — no user enumeration.
    throw unauthorized('Incorrect email or password');
  }
  return issueSession(row.user_id);
}

/* --- OAuth (provider verification is a documented stub) ------------------- */

/**
 * Upsert an account from a social provider.
 *
 * PRODUCTION: the caller must first verify the provider's ID token / auth code
 * server-side (signature, `iss`, `aud`, `exp`) — SRS FR-AUTH-12. That requires
 * real provider client IDs/secrets, so it is intentionally not done here. This
 * function takes an already-verified `(provider, subject, …)` claim set.
 */
export function oauthUpsert(input: {
  provider: 'google' | 'apple' | 'facebook';
  subject: string;            // provider's stable user id (verified upstream)
  email?: string;
  name?: string;
  handleSuggestion?: string;
}): AuthResult {
  const existing = q.get<{ user_id: string }>(
    'SELECT user_id FROM auth_identities WHERE provider = ? AND provider_subject = ?',
    input.provider, input.subject,
  );
  if (existing) return issueSession(existing.user_id);

  return tx(() => {
    const handle = input.handleSuggestion ?? input.email?.split('@')[0] ?? 'user';
    const user = createUser({
      name: input.name ?? 'New user',
      // createUser sanitizes + de-dupes; append randomness if the base collides.
      handle: handle + Math.random().toString(36).slice(2, 5),
    });
    q.run(
      `INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      newId(), user.id, input.provider, input.subject, input.email ?? null, now(),
    );
    return issueSession(user.id);
  });
}

/** Used by tests / demo to mint a session for an existing user id. */
export function sessionForUser(userId: string): AuthResult {
  return issueSession(userId);
}

/* --- Firebase Authentication (Apple / Google / Email via Firebase) -------- */

/**
 * Outcome of attempting to sign in with a Firebase ID token. Either a full
 * session (existing user) or a flag indicating onboarding is required (new
 * user — caller must collect DOB + handle and call again with the same token).
 */
export type FirebaseSignInResult =
  | { kind: 'session'; result: AuthResult }
  | { kind: 'needsOnboarding'; firebaseUid: string; provider: 'apple' | 'google' | 'email'; suggestedName?: string; email?: string };

/**
 * Map Firebase's sign_in_provider string ('apple.com', 'google.com',
 * 'password') to the values our auth_identities CHECK constraint allows.
 */
function mapProvider(signInProvider: string): 'apple' | 'google' | 'email' {
  if (signInProvider === 'apple.com') return 'apple';
  if (signInProvider === 'google.com') return 'google';
  // 'password' = Firebase email/password. Anonymous / phone / custom tokens
  // are not exposed by the welcome screen, so funnel them to 'email' if
  // somehow we ever see one.
  return 'email';
}

/**
 * Sign in with a verified Firebase ID token.
 *
 * Flow:
 *   1. Verify the token's signature + claims via firebase-admin (checks
 *      audience, issuer, expiry — equivalent to a fresh OAuth exchange).
 *   2. Look up the WUD user linked to the Firebase UID. If found, mint a
 *      session — we trust Firebase as the identity layer.
 *   3. If no user exists, return needsOnboarding so the client can collect
 *      DOB + handle (required for COPPA + our schema) before re-calling with
 *      the onboarding payload to actually create the account.
 */
export async function firebaseSignIn(input: {
  idToken: string;
  // Onboarding payload — required on the second call when needsOnboarding
  // was returned, omitted on the first probing call.
  dateOfBirth?: number;
  handle?: string;
  avatar?: string;
  color?: string;
  name?: string;
}): Promise<FirebaseSignInResult> {
  const app = getFirebaseApp();
  if (!app) throw badRequest('FIREBASE_NOT_CONFIGURED', 'Firebase authentication is not enabled on the server');

  let decoded;
  try {
    decoded = await getAuth(app).verifyIdToken(input.idToken);
  } catch {
    throw unauthorized('Invalid or expired sign-in token');
  }

  const firebaseUid = decoded.uid;
  const provider = mapProvider(decoded.firebase?.sign_in_provider ?? 'password');
  const email = typeof decoded.email === 'string' ? decoded.email : undefined;
  const name = typeof decoded.name === 'string' ? decoded.name : undefined;
  // OAuth providers (Apple, Google) flag the email verified at signin since
  // the user already authenticated through the provider. For password
  // signups, this stays false until the user clicks the verification link.
  const emailVerified = !!decoded.email_verified || provider !== 'email';

  // Existing user? Provider+subject is unique — Firebase UIDs are globally
  // unique per project, so no risk of collision across providers.
  const existing = q.get<{ user_id: string }>(
    'SELECT user_id FROM auth_identities WHERE provider = ? AND provider_subject = ?',
    provider, firebaseUid,
  );
  if (existing) {
    // Refresh the verified flag on every signin so the banner disappears the
    // first time the user signs in AFTER clicking the verification link.
    setEmailVerified(existing.user_id, emailVerified);
    return { kind: 'session', result: issueSession(existing.user_id) };
  }

  // No user yet — need handle + DOB before we can create one. If the client
  // hasn't gathered those yet, signal needsOnboarding so they show the
  // onboarding screen, then call back with the payload.
  if (input.dateOfBirth === undefined || !input.handle) {
    return {
      kind: 'needsOnboarding',
      firebaseUid,
      provider,
      suggestedName: name,
      email,
    };
  }

  // Create + link. createUser enforces the ≥13 age gate, handle format, and
  // handle uniqueness — errors propagate up so the client can re-prompt.
  return tx(() => {
    const user = createUser({
      name: input.name ?? name ?? 'New user',
      handle: input.handle!,
      avatar: input.avatar,
      color: input.color,
      dateOfBirth: input.dateOfBirth,
    });
    q.run(
      `INSERT INTO auth_identities (id, user_id, provider, provider_subject, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      newId(), user.id, provider, firebaseUid, email ?? null, now(),
    );
    setEmailVerified(user.id, emailVerified);
    return { kind: 'session' as const, result: issueSession(user.id) };
  });
}

/**
 * Find the most recent email login linked to a user — for "send password
 * reset" UX (we don't actually send the email here; that's Firebase's job,
 * we just confirm the address exists so we don't leak which addresses are
 * registered). Returns the email if registered, null otherwise.
 */
export function emailIsRegistered(email: string): boolean {
  const row = q.get(
    "SELECT 1 FROM auth_identities WHERE provider = 'email' AND email = ?",
    email.trim().toLowerCase(),
  );
  return !!row;
}
