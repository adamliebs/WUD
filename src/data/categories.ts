import type { Activity, Category } from '../types';

// Glassy/transparent palette — three-stop 500-level gradients at low opacity
// (/25, /15, /10) so the banner reads as a soft tint over the dark card
// instead of a saturated block. Matches the Floats card palette so the whole
// app shares one visual language.
export const CATEGORIES: Category[] = [
  { key: 'surf',     label: 'Surf',     emoji: '🏄',  gradient: 'from-cyan-500/25 via-sky-500/15 to-blue-500/10' },
  { key: 'gym',      label: 'Gym',      emoji: '🏋️', gradient: 'from-rose-500/25 via-pink-500/15 to-rose-500/10' },
  { key: 'padel',    label: 'Padel',    emoji: '🎾',  gradient: 'from-lime-400/25 via-yellow-500/15 to-amber-500/10' },
  { key: 'run',      label: 'Run',      emoji: '🏃',  gradient: 'from-lime-500/25 via-emerald-500/15 to-teal-500/10' },
  { key: 'gaming',   label: 'Gaming',   emoji: '🎮',  gradient: 'from-violet-500/25 via-fuchsia-500/15 to-pink-500/10' },
  { key: 'food',     label: 'Food',     emoji: '🍔',  gradient: 'from-amber-500/25 via-orange-500/15 to-rose-500/10' },
  { key: 'drinks',   label: 'Drinks',   emoji: '🍹',  gradient: 'from-pink-500/25 via-rose-500/15 to-rose-500/10' },
  { key: 'coffee',   label: 'Coffee',   emoji: '☕',  gradient: 'from-amber-500/25 via-amber-700/15 to-stone-500/10' },
  { key: 'study',    label: 'Study',    emoji: '📚',  gradient: 'from-indigo-500/25 via-blue-500/15 to-blue-500/10' },
  { key: 'movie',    label: 'Movie',    emoji: '🎬',  gradient: 'from-zinc-400/25 via-zinc-500/15 to-zinc-600/10' },
  { key: 'outdoors', label: 'Outdoors', emoji: '🌲',  gradient: 'from-emerald-500/25 via-green-500/15 to-teal-500/10' },
  { key: 'party',    label: 'Party',    emoji: '🎉',  gradient: 'from-fuchsia-500/25 via-pink-500/15 to-purple-500/10' },
  { key: 'other',    label: 'Other',    emoji: '✨',  gradient: 'from-slate-400/25 via-slate-500/15 to-slate-600/10' },
];

/** Glassy default for user-defined "custom" categories. */
export const CUSTOM_GRADIENT = 'from-fuchsia-500/25 via-pink-500/15 to-rose-500/10';

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
