import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Clock, Eye, EyeOff, Filter, Flame, Radio, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isLiveActivity, useApp } from '../store';
import type { CategoryKey } from '../types';

/**
 * Discovery filter bar above the Feed list. Three dropdown chips —
 *
 *   • Sort     (Soonest / Popular)
 *   • Time     (All time / Now / Today / Week)
 *   • Category (All / per-category)
 *
 * — preceded by a "Clear" chip that only appears when any non-default filter
 * is on. Active chips get a glowing pulse so an out-of-view active filter is
 * visually obvious from the rest of the page.
 *
 * Dropdowns close on outside-click and Escape. The popovers are absolutely
 * positioned (z-50) so they overlay the feed list below.
 */
interface Props {
  /** Number of plans currently rendered in the feed — surfaced as a small
   *  count chip alongside the "Plans" section heading so the user can see
   *  the total without scrolling up to a separate header. */
  count: number;
}

export function FeedFilters({ count }: Props) {
  const filters = useApp(s => s.feedFilters);
  const set = useApp(s => s.setFeedFilter);
  const clear = useApp(s => s.clearFeedFilters);
  const active = useApp(s => s.hasActiveFeedFilters());
  // includeLive lives on feedFilters too — the eye toggle below flips it.
  // Hidden entirely when there are no live activities to gate (no signal).
  const showLiveInFeed = !!filters.includeLive;

  // Category dropdown options come from the visible feed pool, so users can't
  // pick a category that would always return zero results. Memo deps cover
  // the bits the underlying selector reads — see SmartSuggestions for the
  // same pattern.
  const activities = useApp(s => s.activities);
  const scope = useApp(s => s.feedScope);
  const friendIds = useApp(s => s.friendIds);
  const available = useMemo(
    () => useApp.getState().availableCategories(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, scope, friendIds],
  );
  const liveCount = useMemo(
    () => activities.filter(isLiveActivity).length,
    [activities],
  );

  // The dropdown's value is encoded — custom labels use `custom:<label>` so
  // each user-defined category gets its own selectable entry.
  const currentCategoryValue =
    filters.category === 'custom' && filters.customLabel
      ? `custom:${filters.customLabel}`
      : (filters.category ?? '__all__');
  const activeCategoryEntry = active && filters.category
    ? available.find(c =>
        c.key === filters.category &&
        (filters.category !== 'custom' || c.customLabel === filters.customLabel),
      )
    : undefined;

  return (
    <div className="px-4 mt-1 mb-2">
      {/* Section header — matches the "For you" / "Suggestions" / "Trending"
          rails above so the bar reads as its own thing. Renamed from
          "Filter" to "Plans" since this is the primary heading for the
          feed list now that the count moved here from the top header. */}
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Filter size={12} className="text-sky-300" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
          Plans
        </span>
        <span className="text-[11px] tabular-nums text-zinc-500 font-semibold">
          · {count}
        </span>
      </div>

      {/* Icon-only chip row. Active dimensions tint rose/orange; tapping any
          chip opens its dropdown with the labelled options. Saves horizontal
          space and prevents the row from wrapping when active labels grow
          (e.g. a custom category name). Each chip carries an aria-label
          since the visual is icon-only. */}
      <div className="flex items-center gap-2">
        {/* Clear — X + "Clear" label. Compact pill on the left. Animates
            in/out so the row doesn't jump when the user toggles their
            first filter. */}
        <AnimatePresence initial={false}>
          {active && (
            <motion.button
              key="clear"
              // Drop the width animation — animating to "auto" forced a
              // measure-every-frame layout pass which read as jumpy on
              // iOS. Opacity + scale alone is smooth, and the flex row
              // reflows naturally when the chip appears.
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              onClick={clear}
              aria-label="Clear all filters"
              className="shrink-0 h-8 inline-flex items-center gap-1 px-2.5 rounded-xl text-[12px] font-semibold
                         text-rose-200 bg-rose-500/10 border border-rose-400/40 hover:bg-rose-500/20 transition
                         whitespace-nowrap"
            >
              <X size={13} strokeWidth={2.5} />
              Clear
            </motion.button>
          )}
        </AnimatePresence>

        <IconDropdown
          ariaLabel="Sort"
          icon={<Flame size={14} />}
          active={filters.sort !== 'soonest'}
          options={[
            { value: 'soonest', label: 'Soonest', icon: <Clock size={14} /> },
            { value: 'popular', label: 'Popular', icon: <Flame size={14} /> },
          ]}
          value={filters.sort}
          onChange={(v: 'soonest' | 'popular') => set({ sort: v })}
        />

        <IconDropdown
          ariaLabel="Time"
          icon={<Clock size={14} />}
          active={filters.timeWindow !== 'all'}
          options={[
            { value: 'all',   label: 'All time' },
            { value: 'now',   label: 'Starting now' },
            { value: 'today', label: 'Today' },
            { value: 'week',  label: 'This week' },
          ]}
          value={filters.timeWindow}
          onChange={(v: 'all' | 'now' | 'today' | 'week') => set({ timeWindow: v })}
        />

        <IconDropdown
          ariaLabel="Category"
          // When active, show the chosen category's emoji directly on the
          // chip so the user can still tell what's filtering at a glance —
          // the only place we make an exception to "icon only".
          icon={activeCategoryEntry
            ? <span className="text-sm leading-none">{activeCategoryEntry.emoji}</span>
            : <Tag size={14} />}
          active={!!filters.category}
          options={[
            { value: '__all__', label: 'All categories' },
            ...available.map(c => ({
              value: c.customLabel ? `custom:${c.customLabel}` : c.key,
              label: c.label,
              emoji: c.emoji,
            })),
          ]}
          value={currentCategoryValue}
          onChange={(v: string) => {
            if (v === '__all__') set({ category: undefined, customLabel: undefined });
            else if (v.startsWith('custom:')) set({ category: 'custom', customLabel: v.slice(7) });
            else set({ category: v as CategoryKey, customLabel: undefined });
          }}
        />

        {/* Show-live toggle — only meaningful when there are live activities.
            Eye (on) = live plans visible in the feed; EyeOff (off / line
            through) = hidden. The little radio + count to the right is the
            live-events badge so the user still sees "how many are live"
            even when they've chosen to hide them from the feed. */}
        {liveCount > 0 && (
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => set({ includeLive: !showLiveInFeed })}
            aria-pressed={showLiveInFeed}
            aria-label={showLiveInFeed ? 'Hide live plans from feed' : 'Show live plans in feed'}
            title={showLiveInFeed ? 'Hide live plans' : 'Show live plans'}
            className={`shrink-0 h-8 inline-flex items-center gap-1 pl-2 pr-2 rounded-xl border transition
                        ${showLiveInFeed
                          ? 'bg-rose-500/15 text-rose-100 border-rose-400/40'
                          : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'}`}
          >
            {showLiveInFeed ? <Eye size={14} /> : <EyeOff size={14} />}
            <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums
                              ${showLiveInFeed ? 'text-white/90' : 'text-rose-300'}`}>
              <Radio size={10} />
              {liveCount}
            </span>
          </motion.button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Generic dropdown ─────────────────────────── */

interface DropdownOption<V extends string> {
  value: V;
  label: string;
  emoji?: string;
  icon?: ReactNode;
}

interface IconDropdownProps<V extends string> {
  /** Accessible name for the chip (screen readers + tooltip). */
  ariaLabel: string;
  /** Icon shown on the chip. */
  icon: ReactNode;
  /** True when the current value differs from the dimension's default. */
  active: boolean;
  options: DropdownOption<V>[];
  value: V;
  onChange: (v: V) => void;
}

/** Icon-only filter chip — square-ish 32px button. The dropdown still
 *  shows the full labelled option list, so the user can read what each
 *  value means once they tap in. Active chips fill with the brand gradient
 *  and pulse so it's obvious which dimensions are in play. */
function IconDropdown<V extends string>({
  ariaLabel, icon, active, options, value, onChange,
}: IconDropdownProps<V>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={`relative h-8 inline-flex items-center gap-1 pl-2 pr-1.5 rounded-xl border transition
                    ${active
                      ? 'bg-rose-500/15 text-rose-100 border-rose-400/40'
                      : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
      >
        {/* Pulse ring used to live here on active chips — it was double
            duty with the rose→orange gradient and read as "demanding tap"
            even when the user had just set the filter. Now the solid
            tint alone says "selected" and the row stays quiet. */}
        {icon}
        <ChevronDown
          size={11}
          // Explicit short duration so the chevron flip stays in sync with
          // the dropdown's open animation; the default Tailwind transition
          // (~150ms) was lagging behind.
          style={{ transition: 'transform 110ms ease-out' }}
          className={`${open ? 'rotate-180' : ''} ${active ? 'text-rose-200' : 'text-zinc-400'}`}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            // Simpler entry — opacity + tiny scale only. Removing the
            // simultaneous Y translate avoids the compositor stutter that
            // showed up when y, scale and opacity were all interpolating.
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.11, ease: 'easeOut' }}
            style={{ transformOrigin: 'top left' }}
            // max-h keeps long lists (categories) compact and scrollable.
            className="absolute z-50 mt-1.5 left-0 min-w-[170px] max-h-72 overflow-y-auto no-scrollbar
                       rounded-2xl bg-[#15121b] border border-white/10 shadow-2xl shadow-black/60 p-1"
          >
            {options.map(o => {
              const isCurrent = o.value === value;
              return (
                <button
                  key={o.value}
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={`w-full px-2.5 py-2 rounded-xl text-left text-[13px] font-medium flex items-center gap-2 transition
                              ${isCurrent
                                ? 'bg-gradient-to-r from-rose-500/20 to-orange-500/15 text-white'
                                : 'text-zinc-200 hover:bg-white/5'}`}
                >
                  {o.icon}
                  {o.emoji && <span className="text-base leading-none">{o.emoji}</span>}
                  <span className="flex-1 truncate">{o.label}</span>
                  {isCurrent && <Check size={14} className="text-rose-300 shrink-0" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
