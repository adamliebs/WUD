import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useMemo } from 'react';
import { useApp } from '../store';
import type { CategoryKey } from '../types';

/**
 * Renders trending category chips above the Feed. Tapping a chip applies that
 * category as a feed filter. Hidden when nothing is trending (count ≥ 2 needed).
 *
 * Memoizes by primitive state because the underlying selector returns freshly
 * constructed objects (see SmartSuggestions for the same rationale).
 */
export function TrendingStrip() {
  const activities = useApp(s => s.activities);
  const squads = useApp(s => s.squads);
  const friendIds = useApp(s => s.friendIds);

  const items = useMemo(
    () => useApp.getState().trendingCategories(),
    [activities, squads, friendIds],
  );
  const setFilter = useApp(s => s.setFeedFilter);
  const activeCategory = useApp(s => s.feedFilters.category);

  if (items.length === 0) return null;

  const apply = (k: CategoryKey) => setFilter({ category: activeCategory === k ? undefined : k });

  return (
    <div className="px-4 mt-1 mb-2">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Flame size={12} className="text-orange-300" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
          Trending this week
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {items.map(item => {
          const active = activeCategory === item.key;
          return (
            <motion.button
              key={item.key}
              whileTap={{ scale: 0.94 }}
              onClick={() => apply(item.key)}
              className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-2xl border transition
                          ${active
                            ? 'bg-gradient-to-br from-orange-500 to-rose-500 text-white border-orange-400 shadow-[0_8px_24px_-10px_rgba(251,146,60,0.55)]'
                            : 'bg-white/5 text-zinc-100 border-white/10 hover:bg-white/10'}`}
            >
              <span className="text-xl leading-none">{item.emoji}</span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-sm font-bold">{item.label}</span>
                <span className={`text-[10.5px] tabular-nums ${active ? 'text-white/85' : 'text-zinc-400'}`}>
                  {item.count} plan{item.count === 1 ? '' : 's'}
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
