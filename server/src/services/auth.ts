import { createHash, randomBytes } from 'node:crypto';
import { q, tx } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { newId, now } from '../lib/ids.js';
import { issueAccessToken } from '../lib/jwt.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { createUser, getPublicUser } from './users.js';
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
