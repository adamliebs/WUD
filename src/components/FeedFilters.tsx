import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Clock, Filter, Flame, Tag, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../store';
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
export function FeedFilters() {
  const filters = useApp(s => s.feedFilters);
  const set = useApp(s => s.setFeedFilter);
  const clear = useApp(s => s.clearFeedFilters);
  const active = useApp(s => s.hasActiveFeedFilters());

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
          rails above so the bar reads as its own thing. */}
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Filter size={12} className="text-sky-300" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
          Filter
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Clear at the front — animated in/out so it doesn't feel jumpy when
            it appears as soon as the user picks any non-default filter. */}
        <AnimatePresence initial={false}>
          {active && (
            <motion.button
              key="clear"
              initial={{ opacity: 0, scale: 0.85, width: 0 }}
              animate={{ opacity: 1, scale: 1, width: 'auto' }}
              exit={{ opacity: 0, scale: 0.85, width: 0 }}
              transition={{ duration: 0.16 }}
              onClick={clear}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold
                         text-rose-200 bg-rose-500/10 border border-rose-400/40 hover:bg-rose-500/20 transition
                         overflow-hidden whitespace-nowrap"
            >
              <X size={12} />
              Clear
            </motion.button>
          )}
        </AnimatePresence>

        <Dropdown
          dimension="Sort"
          icon={<Flame size={12} />}
          active={filters.sort !== 'soonest'}
          activeLabel={filters.sort === 'popular' ? 'Popular' : 'Soonest'}
          options={[
            { value: 'soonest', label: 'Soonest', icon: <Clock size={14} /> },
            { value: 'popular', label: 'Popular', icon: <Flame size={14} /> },
          ]}
          value={filters.sort}
          onChange={(v: 'soonest' | 'popular') => set({ sort: v })}
        />

        <Dropdown
          dimension="Time"
          icon={<Clock size={12} />}
          active={filters.timeWindow !== 'all'}
          activeLabel={
            filters.timeWindow === 'now' ? 'Now'
            : filters.timeWindow === 'today' ? 'Today'
            : filters.timeWindow === 'week' ? 'This week'
            : 'All time'
          }
          options={[
            { value: 'all',   label: 'All time' },
            { value: 'now',   label: 'Starting now' },
            { value: 'today', label: 'Today' },
            { value: 'week',  label: 'This week' },
          ]}
          value={filters.timeWindow}
          onChange={(v: 'all' | 'now' | 'today' | 'week') => set({ timeWindow: v })}
        />

        <Dropdown
          dimension="Category"
          icon={<Tag size={12} />}
          active={!!filters.category}
          // When active, show the category emoji INSIDE the chip so the
          // current pick is recognizable at a glance, not just by colour.
          activeLabel={activeCategoryEntry ? `${activeCategoryEntry.emoji} ${activeCategoryEntry.label}` : 'All'}
          options={[
            { value: '__all__', label: 'All categories' },
            ...available.map(c => ({
              // Standard categories carry their stable key as the value;
              // custom entries get a `custom:<label>` prefix so each is a
              // distinct option even though they share the 'custom' key.
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

interface DropdownProps<V extends string> {
  /** Name of the dimension — shown on the chip when no filter is applied. */
  dimension: string;
  /** Small icon shown next to the dimension name when inactive. */
  icon?: ReactNode;
  /** True when the current value differs from the dimension's default. */
  active: boolean;
  /** Text shown on the chip when active (instead of the dimension name). */
  activeLabel: string;
  options: DropdownOption<V>[];
  value: V;
  onChange: (v: V) => void;
}

function Dropdown<V extends string>({
  dimension, icon, active, activeLabel, options, value, onChange,
}: DropdownProps<V>) {
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
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition
                    ${active
                      ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-300 shadow-[0_8px_22px_-8px_rgba(244,63,94,0.7)]'
                      : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
      >
        {/* Glowing pulse ring — only renders for active chips. The infinite
            spring on the box-shadow does the "shine" so an active filter
            keeps drawing the eye even after scrolling past the bar. */}
        {active && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full pointer-events-none"
            initial={{ boxShadow: '0 0 0 0 rgba(251, 113, 133, 0.55)' }}
            animate={{ boxShadow: [
              '0 0 0 0 rgba(251, 113, 133, 0.55)',
              '0 0 0 6px rgba(251, 113, 133, 0)',
              '0 0 0 0 rgba(251, 113, 133, 0)',
            ] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        {icon}
        <span className="whitespace-nowrap">{active ? activeLabel : dimension}</span>
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? 'rotate-180' : ''} ${active ? 'text-white/85' : 'text-zinc-400'}`}
        />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.14 }}
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
