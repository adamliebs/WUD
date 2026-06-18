import { q, tx } from '../db/index.js';
import { now } from '../lib/ids.js';
import { logger } from '../lib/logger.js';

/**
 * WUD Buddy — the built-in "test friend" 🤖.
 *
 * A brand-new account has zero friends, which makes half the app
 * undemonstrable: you can't ping anyone, can't fill a squad, and the
 * Getting Started checklist would dead-end. Buddy fixes that: every new
 * account is auto-friended with this fixed bot user so pings and squads
 * work from minute one. Buddy never posts, never RSVPs, and is excluded
 * from discovery surfaces (suggestions / search / contact match) so it
 * can't leak the social graph — everyone being friends with Buddy must
 * not make everyone friends-of-friends with each other.
 *
 * This file deliberately uses raw SQL only (no users/social service
 * imports) — users.ts calls into it from createUser, so importing those
 * services back would be a cycle.
 */

export const BUDDY_ID = 'u_wud_buddy';
export const BUDDY_HANDLE = 'wudbuddy';

/** Ordered pair for the friendships table's (user_a < user_b) constraint. */
const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** Insert the buddy ↔ user friendship row (idempotent, no realtime fan-out —
 *  used at signup time, before the user has a live socket). */
export function befriendBuddy(userId: string): void {
  if (userId === BUDDY_ID) return;
  if (!q.get('SELECT 1 FROM users WHERE id = ?', BUDDY_ID)) return; // buddy missing — skip
  const [a, b] = pair(userId, BUDDY_ID);
  q.run(
    'INSERT OR IGNORE INTO friendships (user_a, user_b, created_at) VALUES (?, ?, ?)',
    a, b, now(),
  );
}

/**
 * Create the buddy user (+ settings row) if missing, then befriend every
 * existing account. Called once at boot, after migrations — so it self-heals
 * after `npm run seed` wipes the users table, and existing pre-buddy accounts
 * pick him up on the next deploy.
 */
export function ensureBuddyUser(): void {
  const exists = !!q.get('SELECT 1 FROM users WHERE id = ?', BUDDY_ID);
  if (exists) return;
  const ts = now();
  tx(() => {
    q.run(
      `INSERT OR IGNORE INTO users (id, name, handle, avatar_emoji, color, created_at, updated_at)
       VALUES (?, 'WUD Buddy', ?, '🤖', 'from-sky-500/25 via-indigo-500/15 to-violet-500/10', ?, ?)`,
      BUDDY_ID, BUDDY_HANDLE, ts, ts,
    );
    q.run(
      'INSERT OR IGNORE INTO user_settings (user_id, default_reminder_minutes) VALUES (?, 30)',
      BUDDY_ID,
    );
    // Befriend everyone who already has an account (new accounts are handled
    // by createUser → befriendBuddy). CASE keeps the (user_a < user_b) CHECK.
    q.run(
      `INSERT OR IGNORE INTO friendships (user_a, user_b, created_at)
       SELECT CASE WHEN id < ? THEN id ELSE ? END,
              CASE WHEN id < ? THEN ? ELSE id END,
              ?
         FROM users WHERE id != ?`,
      BUDDY_ID, BUDDY_ID, BUDDY_ID, BUDDY_ID, ts, BUDDY_ID,
    );
  });
  logger.info('[buddy] created WUD Buddy test friend');
}
