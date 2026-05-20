import type { Activity, Category } from '../types';

export const CATEGORIES: Category[] = [
  { key: 'surf',     label: 'Surf',     emoji: '🏄',  gradient: 'from-cyan-400 to-blue-600' },
  { key: 'gym',      label: 'Gym',      emoji: '🏋️', gradient: 'from-red-400 to-rose-600' },
  { key: 'run',      label: 'Run',      emoji: '🏃',  gradient: 'from-lime-400 to-emerald-600' },
  { key: 'gaming',   label: 'Gaming',   emoji: '🎮',  gradient: 'from-violet-500 to-fuchsia-600' },
  { key: 'food',     label: 'Food',     emoji: '🍔',  gradient: 'from-amber-400 to-orange-600' },
  { key: 'drinks',   label: 'Drinks',   emoji: '🍹',  gradient: 'from-pink-400 to-rose-600' },
  { key: 'coffee',   label: 'Coffee',   emoji: '☕',  gradient: 'from-amber-700 to-stone-800' },
  { key: 'study',    label: 'Study',    emoji: '📚',  gradient: 'from-indigo-400 to-blue-700' },
  { key: 'movie',    label: 'Movie',    emoji: '🎬',  gradient: 'from-zinc-500 to-zinc-800' },
  { key: 'outdoors', label: 'Outdoors', emoji: '🌲',  gradient: 'from-green-500 to-teal-700' },
  { key: 'party',    label: 'Party',    emoji: '🎉',  gradient: 'from-fuchsia-500 to-purple-700' },
  { key: 'other',    label: 'Other',    emoji: '✨',  gradient: 'from-slate-400 to-slate-700' },
];

/** Distinct, vibrant gradient used for user-defined "custom" categories. */
export const CUSTOM_GRADIENT = 'from-fuchsia-500 via-pink-500 to-rose-600';

/** Look up a category by its key — falls back to "Other" for unknown keys. */
export const categoryOf = (k: string) =>
  CATEGORIES.find(c => c.key === k) ?? CATEGORIES[CATEGORIES.length - 1];

/**
 * Resolve the visual category for an activity. For 'custom' activities,
 * synthesize a Category using the activity's customEmoji/customLabel.
 */
export function categoryFor(
  a: Pick<Activity, 'category' | 'customEmoji' | 'customLabel'>,
): Category {
  if (a.category === 'custom') {
    return {
      key: 'custom',
      label: (a.customLabel?.trim() || 'Custom'),
      emoji: (a.customEmoji?.trim() || '✨'),
      gradient: CUSTOM_GRADIENT,
    };
  }
  return categoryOf(a.category);
}
