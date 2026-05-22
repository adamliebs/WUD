import { q } from '../db/index.js';
import { now } from '../lib/ids.js';
import type { Activity, CategoryKey, PublicUser } from '../types.js';
import { canSeeActivity, getActivityRow, toActivity } from './activities.js';
import { friendIds } from './social.js';
import { getUserRow, toPublicUser } from './users.js';

/* Category metadata — mirrors the client's CATEGORIES table. */
const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  surf: { label: 'Surf', emoji: '🏄' },      gym: { label: 'Gym', emoji: '🏋️' },
  run: { label: 'Run', emoji: '🏃' },        gaming: { label: 'Gaming', emoji: '🎮' },
  food: { label: 'Food', emoji: '🍔' },      drinks: { label: 'Drinks', emoji: '🍹' },
  coffee: { label: 'Coffee', emoji: '☕' },  study: { label: 'Study', emoji: '📚' },
  movie: { label: 'Movie', emoji: '🎬' },    outdoors: { label: 'Outdoors', emoji: '🌲' },
  party: { label: 'Party', emoji: '🎉' },    other: { label: 'Other', emoji: '✨' },
};

const YOU_XY: [number, number] = [0.5, 0.5];
const NEAR_RADIUS = 0.3;

/* ===================== search ===================== */

export interface SearchResults {
  plans: Activity[];
  people: PublicUser[];
  categories: { key: CategoryKey; label: string; emoji: string }[];
}

/** Fuzzy substring search across visible plans, people, and categories. */
export function search(userId: string, query: string): SearchResults {
  const needle = query.trim().toLowerCase();
  if (!needle) return { plans: [], people: [], categories: [] };

  // Plans the user can see, matched on title / place / description.
  const planRows = q.all<{ id: string }>('SELECT id FROM activities WHERE dissolved_at IS NULL');
  const plans = planRows
    .map(r => getActivityRow(r.id)!)
    .filter(r => canSeeActivity(userId, r))
    .filter(r =>
      r.title.toLowerCase().includes(needle) ||
      r.place.toLowerCase().includes(needle) ||
      r.description.toLowerCase().includes(needle) ||
      r.category.toLowerCase().includes(needle))
    .sort((a, b) => a.starts_at - b.starts_at)
    .slice(0, 8)
    .map(toActivity);

  // People — friends first, then everyone else.
  const friends = new Set(friendIds(userId));
  const userRows = q.all<{ id: string }>('SELECT id FROM users WHERE id != ?', userId);
  const matchedPeople = userRows
    .map(r => toPublicUser(getUserRow(r.id)!))
    .filter(u => u.name.toLowerCase().includes(needle) || u.handle.toLowerCase().includes(needle));
  const people = [
    ...matchedPeople.filter(u => friends.has(u.id)),
    ...matchedPeople.filter(u => !friends.has(u.id)),
  ].slice(0, 6);

  const categories = (Object.entries(CATEGORY_META) as [CategoryKey, { label: string; emoji: string }][])
    .filter(([, m]) => m.label.toLowerCase().includes(needle))
    .map(([key, m]) => ({ key, label: m.label, emoji: m.emoji }));

  return { plans, people, categories };
}

/* ===================== trending ===================== */

/** Top categories by visible-plan count in the ±7-day window (count ≥ 2). */
export function trending(userId: string): { key: CategoryKey; count: number; emoji: string; label: string }[] {
  const ts = now();
  const WEEK = 7 * 86_400_000;
  const rows = q.all<{ id: string }>('SELECT id FROM activities WHERE dissolved_at IS NULL');
  const tally = new Map<string, number>();
  for (const { id } of rows) {
    const row = getActivityRow(id)!;
    if (Math.abs(row.starts_at - ts) > WEEK) continue;
    if (!canSeeActivity(userId, row)) continue;
    tally.set(row.category, (tally.get(row.category) ?? 0) + 1);
  }
  return [...tally.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => {
      const meta = CATEGORY_META[key] ?? { label: 'Custom', emoji: '✨' };
      return { key: key as CategoryKey, count, emoji: meta.emoji, label: meta.label };
    });
}

/* ===================== smart suggestions ===================== */

export type Suggestion =
  | { kind: 'starting_soon'; count: number; emoji: string; text: string; apply: { timeWindow: 'now' } }
  | { kind: 'category_cluster'; category: CategoryKey; count: number; emoji: string; text: string;
      apply: { category: CategoryKey; timeWindow: 'today' } }
  | { kind: 'near_me'; count: number; emoji: string; text: string; apply: { nearMe: true } };

/** Up to two heuristic "For you" suggestions. */
export function suggestions(userId: string): Suggestion[] {
  const ts = now();
  const HOUR = 3_600_000, DAY = 86_400_000;
  const out: Suggestion[] = [];

  const visibleUpcoming = q.all<{ id: string }>(
    'SELECT id FROM activities WHERE starts_at >= ? AND dissolved_at IS NULL', ts,
  ).map(r => getActivityRow(r.id)!).filter(r => canSeeActivity(userId, r));

  const soon = visibleUpcoming.filter(r => r.starts_at - ts <= HOUR);
  if (soon.length >= 1) {
    out.push({
      kind: 'starting_soon', count: soon.length, emoji: '⏰',
      text: soon.length === 1
        ? '1 plan starting in the next hour'
        : `${soon.length} plans starting in the next hour`,
      apply: { timeWindow: 'now' },
    });
  }

  const today = visibleUpcoming.filter(r => r.starts_at - ts <= DAY);
  const tally = new Map<string, number>();
  for (const r of today) tally.set(r.category, (tally.get(r.category) ?? 0) + 1);
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    const meta = CATEGORY_META[top[0]] ?? { label: 'Custom', emoji: '✨' };
    out.push({
      kind: 'category_cluster', category: top[0] as CategoryKey, count: top[1], emoji: meta.emoji,
      text: `${top[1]} ${meta.label.toLowerCase()} plans today — tap to see them all`,
      apply: { category: top[0] as CategoryKey, timeWindow: 'today' },
    });
  }

  const near = today.filter(r => {
    if (r.map_x == null || r.map_y == null) return false;
    return Math.hypot(r.map_x - YOU_XY[0], r.map_y - YOU_XY[1]) <= NEAR_RADIUS;
  });
  if (near.length >= 2) {
    out.push({
      kind: 'near_me', count: near.length, emoji: '📍',
      text: `${near.length} plans near you today`, apply: { nearMe: true },
    });
  }

  return out.slice(0, 2);
}
