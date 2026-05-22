import { motion } from 'framer-motion';
import { Search, Sparkles, Users, UsersRound } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useApp } from '../store';
import { ActivityCard } from '../components/ActivityCard';
import { FeedFilters } from '../components/FeedFilters';
import { LiveNowStrip } from '../components/LiveNowStrip';
import { SmartSuggestions } from '../components/SmartSuggestions';
import { TrendingStrip } from '../components/TrendingStrip';

export function FeedScreen() {
  const me = useApp(s => s.me());
  const activities = useApp(useShallow(s => s.visibleActivities()));
  const feedScope = useApp(s => s.feedScope);
  const setFeedScope = useApp(s => s.setFeedScope);
  const hasFoF = useApp(s => s.hasFoFAvailable());
  const filtersActive = useApp(s => s.hasActiveFeedFilters());
  const clearFilters = useApp(s => s.clearFeedFilters);
  const openOverlay = useApp(s => s.openOverlay);

  return (
    <div className="h-full w-full flex flex-col">
      {/* Header */}
      <div className="pt-status-lg pb-3 px-5">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-end justify-between"
        >
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">
              Hey {me.name}, what's up?
            </div>
            <h1 className="text-[34px] font-black leading-none mt-1">
              <span className="text-grad">WUD?</span>
              <span className="text-white/80 text-base font-medium ml-2">today</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <Sparkles size={12} className="text-rose-300" />
              {activities.length} plans
            </div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => openOverlay('search')}
              aria-label="Search"
              className="h-9 w-9 grid place-items-center rounded-full bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10 transition"
            >
              <Search size={16} />
            </motion.button>
          </div>
        </motion.div>

        {/* Scope toggle — only shown when there's a friend-of-friend plan available */}
        {hasFoF && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 relative grid grid-cols-2 bg-white/5 border border-white/10 rounded-2xl p-1"
          >
            <ScopeButton
              active={feedScope === 'friends'}
              onClick={() => setFeedScope('friends')}
              icon={<Users size={14} />}
              label="Friends only"
            />
            <ScopeButton
              active={feedScope === 'fof'}
              onClick={() => setFeedScope('fof')}
              icon={<UsersRound size={14} />}
              label="+ Friends of friends"
            />
          </motion.div>
        )}
      </div>

      {/* Scroll list */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-32 pt-2">
        <LiveNowStrip />
        <SmartSuggestions />
        <TrendingStrip />
        <FeedFilters />
        <motion.div
          className="flex flex-col gap-3 px-4"
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
          }}
        >
          {activities.map(a => (
            <motion.div
              key={a.id}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show:   { opacity: 1, y: 0 },
              }}
              transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            >
              <ActivityCard activity={a} />
            </motion.div>
          ))}

          {activities.length === 0 && (
            <div className="text-center mt-20">
              {filtersActive ? (
                <>
                  <div className="text-5xl mb-2">🪄</div>
                  <div className="text-white font-semibold">Nothing matches those filters</div>
                  <button
                    onClick={clearFilters}
                    className="mt-3 px-4 py-2 rounded-full text-xs font-bold text-white bg-gradient-to-br from-rose-500 to-orange-500"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <div className="text-zinc-400">No plans yet — be the first 👀</div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function ScopeButton({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="relative py-2 rounded-xl text-xs font-semibold"
    >
      {active && (
        <motion.div
          layoutId="scopepill"
          className="absolute inset-0 bg-white rounded-xl"
          transition={{ type: 'spring', stiffness: 480, damping: 32 }}
        />
      )}
      <span className={`relative inline-flex items-center gap-1.5 ${active ? 'text-zinc-900' : 'text-zinc-300'}`}>
        {icon}
        {label}
      </span>
    </button>
  );
}
