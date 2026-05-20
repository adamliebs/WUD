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

/** Create a user + default settings row. Throws on handle conflict. */
export function createUser(input: {
  id?: string;
  name: string;
  handle: string;
  avatar?: string;
  color?: string;
}): PublicUser {
  const handle = normalizeHandle(input.handle) || 'user' + shortId().slice(0, 4);
  if (!HANDLE_RE.test(handle)) {
    throw badRequest('INVALID_HANDLE', 'Handle must be 2–20 chars: a–z, 0–9, _', 'handle');
  }
  if (!handleAvailable(handle)) {
    throw conflict('HANDLE_TAKEN', 'That handle is already taken', 'handle');
  }
  const id = input.id ?? newId();
  const ts = now();
  q.run(
    `INSERT INTO users (id, name, handle, avatar_emoji, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.name.trim() || 'You',
    handle,
    input.avatar ?? '✨',
    input.color ?? 'from-rose-400 to-orange-500',
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
  host_transfer_enabled: number;
  show_me_to_fof: number;
  default_private: number;
  appearance: string;
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
    hostTransferEnabled: !!r.host_transfer_enabled,
    showMeToFoF: !!r.show_me_to_fof,
    defaultPrivate: !!r.default_private,
    appearance: r.appearance as AppSettings['appearance'],
    defaultReminderMins: r.default_reminder_minutes,
  };
}

export function updateSettings(userId: string, patch: Partial<AppSettings>): AppSettings {
  const cur = getSettings(userId);
  const next = { ...cur, ...patch };
  q.run(
    `UPDATE user_settings SET
       push_enabled = ?, pings_enabled = ?, host_transfer_enabled = ?,
       show_me_to_fof = ?, default_private = ?, appearance = ?, default_reminder_minutes = ?
     WHERE user_id = ?`,
    next.pushEnabled ? 1 : 0,
    next.pingsEnabled ? 1 : 0,
    next.hostTransferEnabled ? 1 : 0,
    next.showMeToFoF ? 1 : 0,
    next.defaultPrivate ? 1 : 0,
    next.appearance,
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
