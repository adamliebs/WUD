import { motion } from 'framer-motion';
import { Wand2 } from 'lucide-react';
import { useMemo } from 'react';
import { useApp } from '../store';

/**
 * "For you" banner shown above the Feed list. Renders up to two suggestions —
 * tapping one applies the relevant filter to the feed.
 *
 * Why useMemo + getState() instead of `useApp(useShallow(s => s.smartSuggestions()))`?
 * The selector returns an array of FRESHLY CONSTRUCTED objects each call, so
 * even shallow equality treats every snapshot as "new" — that triggers zustand's
 * infinite-loop guard. Memoizing by the primitive deps gives us a stable ref.
 */
export function SmartSuggestions() {
  // Subscribe to the underlying state pieces the selector reads from.
  const activities = useApp(s => s.activities);
  const squads = useApp(s => s.squads);
  const friendIds = useApp(s => s.friendIds);
  const filters = useApp(s => s.feedFilters);

  const suggestions = useMemo(
    () => useApp.getState().smartSuggestions(),
    [activities, squads, friendIds, filters],
  );
  const setFilter = useApp(s => s.setFeedFilter);

  if (suggestions.length === 0) return null;

  return (
    <div className="px-4 mt-1 mb-3">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Wand2 size={12} className="text-fuchsia-300" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
          For you
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {suggestions.map((sg, i) => (
          <motion.button
            key={`${sg.kind}-${i}`}
            whileTap={{ scale: 0.985 }}
            onClick={() => setFilter(sg.apply)}
            className="w-full text-left flex items-center gap-3 p-3 rounded-2xl border transition
                       bg-gradient-to-r from-fuchsia-500/15 via-rose-500/10 to-orange-500/10
                       border-fuchsia-400/25 hover:from-fuchsia-500/20 hover:via-rose-500/15 hover:to-orange-500/15"
          >
            <div className="h-10 w-10 rounded-xl grid place-items-center text-xl bg-gradient-to-br from-fuchsia-500/30 to-rose-500/30 border border-white/10">
              {sg.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white leading-snug">
                {sg.text}
              </div>
              <div className="text-[11px] text-fuchsia-200/90 mt-0.5">
                Tap to filter
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
