import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { CATEGORIES } from '../data/categories';
import { useApp } from '../store';
import type { CategoryKey } from '../types';

/**
 * Discovery filter strip rendered above the Feed activity list.
 * Single horizontal scroll with two filter dimensions:
 *   • Time window (radio: All / Now / Today / Week)
 *   • Category (radio across CATEGORIES; tap an active one to clear)
 *
 * Active chips are rose-gradient. A "Clear" chip appears when any filter is on.
 */
export function FeedFilters() {
  const filters = useApp(s => s.feedFilters);
  const set = useApp(s => s.setFeedFilter);
  const clear = useApp(s => s.clearFeedFilters);
  const active = useApp(s => s.hasActiveFeedFilters());

  return (
    <div className="px-4 mt-1 mb-2">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {/* Time chips (radio) */}
        <TimeChip current={filters.timeWindow} value="all"   label="All time" onPick={(v) => set({ timeWindow: v })} />
        <TimeChip current={filters.timeWindow} value="now"   label="Now"      onPick={(v) => set({ timeWindow: v })} />
        <TimeChip current={filters.timeWindow} value="today" label="Today"    onPick={(v) => set({ timeWindow: v })} />
        <TimeChip current={filters.timeWindow} value="week"  label="Week"     onPick={(v) => set({ timeWindow: v })} />

        {/* Divider */}
        <div aria-hidden className="self-stretch w-px bg-white/10 mx-0.5" />

        {/* Category chips — tap to select; tap same to clear */}
        {CATEGORIES.map(c => {
          const isActive = filters.category === c.key;
          return (
            <Chip
              key={c.key}
              active={isActive}
              onClick={() => set({ category: isActive ? undefined : (c.key as CategoryKey) })}
            >
              <span className="leading-none">{c.emoji}</span>
              {c.label}
            </Chip>
          );
        })}

        {/* Clear-all chip (only when something is filtering) */}
        {active && (
          <Chip onClick={clear} active={false} className="text-rose-300 border-rose-400/30">
            <X size={12} />
            Clear
          </Chip>
        )}
      </div>
    </div>
  );
}

function TimeChip({
  current, value, label, onPick,
}: {
  current: 'now' | 'today' | 'week' | 'all';
  value: 'now' | 'today' | 'week' | 'all';
  label: string;
  onPick: (v: 'now' | 'today' | 'week' | 'all') => void;
}) {
  return (
    <Chip active={current === value} onClick={() => onPick(value)}>
      {label}
    </Chip>
  );
}

function Chip({
  active, onClick, children, className = '',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition
                  ${active
                    ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400 shadow-[0_6px_18px_-8px_rgba(244,63,94,0.6)]'
                    : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}
                  ${className}`}
    >
      {children}
    </motion.button>
  );
}
