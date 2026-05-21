import type { Activity, AppNotification, PublicUser, Squad } from '../types.js';
import { getUserRow, toPublicUser } from './users.js';

/**
 * Collects every user id referenced by a set of activities / squads /
 * notifications so the client can be handed a complete `users` cache alongside
 * the entities (the "side-loaded resources" pattern — SRS §10.4).
 */
export function collectUserIds(opts: {
  activities?: Activity[];
  squads?: Squad[];
  notifications?: AppNotification[];
  people?: PublicUser[];
  extra?: string[];
}): string[] {
  const ids = new Set<string>(opts.extra ?? []);

  for (const a of opts.activities ?? []) {
    ids.add(a.hostId);
    a.joinerIds.forEach(i => ids.add(i));
    a.maybeIds.forEach(i => ids.add(i));
    a.cantIds.forEach(i => ids.add(i));
    a.reactions.forEach(r => ids.add(r.userId));
    a.chat.forEach(m => { if (m.authorId && m.authorId !== 'system') ids.add(m.authorId); });
  }
  for (const s of opts.squads ?? []) {
    ids.add(s.hostId);
    s.memberIds.forEach(i => ids.add(i));
    s.chat.forEach(m => { if (m.authorId && m.authorId !== 'system') ids.add(m.authorId); });
  }
  for (const n of opts.notifications ?? []) {
    if (n.fromId && n.fromId !== 'system') ids.add(n.fromId);
  }
  for (const p of opts.people ?? []) ids.add(p.id);

  return [...ids];
}

/** Resolve user ids → PublicUser[], silently dropping any that no longer exist. */
export function hydrateUsers(ids: string[]): PublicUser[] {
  return ids
    .map(getUserRow)
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map(toPublicUser);
}
