import { q } from '../db/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { newId, now, shortId } from '../lib/ids.js';
import type { AppSettings, PublicUser } from '../types.js';
import { getLiveStatus } from './presence.js';

interface UserRow {
  id: string;
  name: string;
  handle: string;
  avatar_emoji: string;
  color: string;
  photo_url: string | null;
  created_at: number;
  updated_at: number;
}

const HANDLE_RE = /^[a-z0-9_]{2,20}$/;

/** Normalize a handle to the storage form. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

export function handleAvailable(handle: string): boolean {
  return !q.get('SELECT 1 FROM users WHERE handle = ? COLLATE NOCASE', handle);
}

/** Serialize a user row → API PublicUser, attaching live status if active. */
export function toPublicUser(row: UserRow): PublicUser {
  const live = getLiveStatus(row.id);
  return {
    id: row.id,
    name: row.name,
    handle: row.handle,
    avatar: row.avatar_emoji,
    color: row.color,
    photoUrl: row.photo_url ?? undefined,
    liveStatus: live ?? undefined,
  };
}

export function getUserRow(id: string): UserRow | undefined {
  return q.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
}

export function getPublicUser(id: string): PublicUser {
  const row = getUserRow(id);
  if (!row) throw notFound('USER_NOT_FOUND', 'User not found');
  return toPublicUser(row);
}

/** Minimum age (years) — Apple/COPPA gate on a social/UGC app. */
const MIN_AGE_YEARS = 13;

/** Returns the user's age in full years on a given reference date. */
function ageInYears(dobMs: number, refMs: number): number {
  const dob = new Date(dobMs);
  const ref = new Date(refMs);
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  // Hasn't had this year's birthday yet — drop a year.
  const monthDelta = ref.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && ref.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/** Create a user + default settings row. Throws on handle conflict. */
export function createUser(input: {
  id?: string;
  name: string;
  handle: string;
  avatar?: string;
  color?: string;
  /** Epoch ms. Required for new signups via auth; service-internal callers
   *  (seed, demo) may omit it. */
  dateOfBirth?: number;
}): PublicUser {
  const handle = normalizeHandle(input.handle) || 'user' + shortId().slice(0, 4);
  if (!HANDLE_RE.test(handle)) {
    throw badRequest('INVALID_HANDLE', 'Handle must be 2–20 chars: a–z, 0–9, _', 'handle');
  }
  if (!handleAvailable(handle)) {
    throw conflict('HANDLE_TAKEN', 'That handle is already taken', 'handle');
  }
  // Age gate — refuse accounts under 13 (COPPA). Apple won't accept a social
  // app without this on Guideline 1.3 / 5.1.4 review.
  if (input.dateOfBirth !== undefined) {
    if (!Number.isFinite(input.dateOfBirth) || input.dateOfBirth > Date.now()) {
      throw badRequest('INVALID_DOB', 'Enter a valid date of birth', 'dateOfBirth');
    }
    if (ageInYears(input.dateOfBirth, Date.now()) < MIN_AGE_YEARS) {
      throw badRequest('TOO_YOUNG', `You must be at least ${MIN_AGE_YEARS} to sign up`, 'dateOfBirth');
    }
  }
  const id = input.id ?? newId();
  const ts = now();
  q.run(
    `INSERT INTO users (id, name, handle, avatar_emoji, color, date_of_birth, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name.trim() || 'You',
    handle,
    input.avatar ?? '✨',
    input.color ?? 'from-rose-400 to-orange-500',
    input.dateOfBirth ?? null,
    ts,
    ts,
  );
  q.run('INSERT INTO user_settings (user_id) VALUES (?)', id);
  return getPublicUser(id);
}

/** Patch the current user's profile. */
export function updateUser(
  id: string,
  patch: Partial<{ name: string; handle: string; avatar: string; color: string; photoUrl: string | null }>,
): PublicUser {
  const row = getUserRow(id);
  if (!row) throw notFound('USER_NOT_FOUND', 'User not found');

  let handle = row.handle;
  if (patch.handle !== undefined) {
    handle = normalizeHandle(patch.handle);
    if (!HANDLE_RE.test(handle)) {
      throw badRequest('INVALID_HANDLE', 'Handle must be 2–20 chars: a–z, 0–9, _', 'handle');
    }
    if (handle !== row.handle && !handleAvailable(handle)) {
      throw conflict('HANDLE_TAKEN', 'That handle is already taken', 'handle');
    }
  }
  q.run(
    `UPDATE users SET name = ?, handle = ?, avatar_emoji = ?, color = ?, photo_url = ?, updated_at = ?
     WHERE id = ?`,
    patch.name?.trim() || row.name,
    handle,
    patch.avatar ?? row.avatar_emoji,
    patch.color ?? row.color,
    patch.photoUrl === undefined ? row.photo_url : patch.photoUrl,
    now(),
    id,
  );
  return getPublicUser(id);
}

/* --- settings ------------------------------------------------------------- */

interface SettingsRow {
  push_enabled: number;
  pings_enabled: number;
  default_reminder_minutes: number | null;
}

export function getSettings(userId: string): AppSettings {
  const r = q.get<SettingsRow>('SELECT * FROM user_settings WHERE user_id = ?', userId);
  if (!r) {
    // Self-heal: a user with no settings row gets defaults.
    q.run('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)', userId);
    return getSettings(userId);
  }
  return {
    pushEnabled: !!r.push_enabled,
    pingsEnabled: !!r.pings_enabled,
    defaultReminderMins: r.default_reminder_minutes,
  };
}

export function updateSettings(userId: string, patch: Partial<AppSettings>): AppSettings {
  const cur = getSettings(userId);
  const next = { ...cur, ...patch };
  q.run(
    `UPDATE user_settings SET
       push_enabled = ?, pings_enabled = ?, default_reminder_minutes = ?
     WHERE user_id = ?`,
    next.pushEnabled ? 1 : 0,
    next.pingsEnabled ? 1 : 0,
    next.defaultReminderMins,
    userId,
  );
  return next;
}

/* --- devices (push tokens) ------------------------------------------------ */

export function registerDevice(
  userId: string,
  platform: 'ios' | 'android' | 'web',
  pushToken: string,
): string {
  // Upsert by token so re-registering the same device doesn't duplicate.
  const existing = q.get<{ id: string }>(
    'SELECT id FROM devices WHERE user_id = ? AND push_token = ?', userId, pushToken,
  );
  if (existing) {
    q.run('UPDATE devices SET last_seen_at = ? WHERE id = ?', now(), existing.id);
    return existing.id;
  }
  const id = newId();
  q.run(
    'INSERT INTO devices (id, user_id, platform, push_token, last_seen_at) VALUES (?, ?, ?, ?, ?)',
    id, userId, platform, pushToken, now(),
  );
  return id;
}

export function removeDevice(userId: string, deviceId: string): void {
  q.run('DELETE FROM devices WHERE id = ? AND user_id = ?', deviceId, userId);
}
