import { motion } from 'framer-motion';
import { Search, Sparkles, Users, UsersRound } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { isLiveActivity, useApp } from '../store';
import { ActivityCard } from '../components/ActivityCard';
import { FeedFilters } from '../components/FeedFilters';
import { LiveNowStrip } from '../components/LiveNowStrip';
import { RefreshButton } from '../components/RefreshButton';
import { SmartSuggestions } from '../components/SmartSuggestions';

export function FeedScreen() {
  const me = useApp(s => s.me());
  const refreshAll = useApp(s => s.refreshAll);
  const allActivities = useApp(useShallow(s => s.visibleActivities()));
  // Live activities are surfaced in the LiveNowStrip above, so hide them from
  // the main scrolling feed by default to avoid showing the same plan twice.
  // The toggle is a feed filter so Clear filters resets it, and so a For You
  // filter shortcut can flip it on automatically.
  const showLiveInFeed = useApp(s => !!s.feedFilters.includeLive);
  const activities = showLiveInFeed
    ? allActivities
    : allActivities.filter(a => !isLiveActivity(a));
  const feedScope = useApp(s => s.feedScope);
  const setFeedScope = useApp(s => s.setFeedScope);
  const hasFoF = useApp(s => s.hasFoFAvailable());
  const filtersActive = useApp(s => s.hasActiveFeedFilters());
  const clearFilters = useApp(s => s.clearFeedFilters);
  const openOverlay = useApp(s => s.openOverlay);

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      {/* Drifting orbs — same atmospheric trick the Floats page uses, but a
          cooler palette (rose / sky / violet) so the two tabs feel related
          without looking identical. Pointer-events disabled so they never
          intercept taps. */}
      <FeedBackgroundOrbs />

      {/* Header */}
      <div className="relative pt-status-lg pb-3 px-5">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-end justify-between"
        >
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400 inline-flex items-center gap-1.5">
              <Sparkles size={12} className="text-rose-300" />
              Hey {me.name}
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
            <RefreshButton onRefresh={refreshAll} ariaLabel="Refresh feed" />
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

      {/* Scroll list — plain scroll container. Pull-to-refresh was removed
          because it was too sensitive on iOS; refresh now lives as an
          explicit button in the header above. */}
      <div className="relative flex-1 overflow-y-auto no-scrollbar pb-32 pt-2">
        <LiveNowStrip />
        <SmartSuggestions />
        {/* Anchor target for For You "tap to filter" jumps — when the For You
            rail fills the viewport, tapping a digest scrolls past it to this
            point so the filtered results are immediately visible. */}
        <div id="feed-results-anchor" />
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
          {activities.map((a, i) => (
            <motion.div
              key={a.id}
              // Cap the stagger after the first 8 cards. The cascade reads
              // as energy when there are a handful of cards on screen, but
              // turns into "the feed is loading for 3 seconds" on a busy
              // feed of 50+. Beyond the cap we just snap-fade in so the
              // page settles immediately.
              variants={i < 8
                ? {
                    hidden: { opacity: 0, y: 20 },
                    show:   { opacity: 1, y: 0 },
                  }
                : {
                    hidden: { opacity: 0 },
                    show:   { opacity: 1, transition: { duration: 0.15 } },
                  }}
              transition={i < 8
                ? { type: 'spring', stiffness: 220, damping: 22 }
                : undefined}
            >
              <ActivityCard activity={a} />
            </motion.div>
          ))}

          {activities.length === 0 && (
            <div className="text-center mt-16 pb-6">
              {filtersActive ? (
                <>
                  <motion.div
                    animate={{ rotate: [0, 10, 0, -10, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-6xl"
                  >
                    🪄
                  </motion.div>
                  <div className="text-white font-semibold mt-3">Nothing matches those filters</div>
                  <div className="text-sm text-zinc-400 mt-1 max-w-[260px] mx-auto">
                    Loosen up and the right plan might surface.
                  </div>
                  <button
                    onClick={clearFilters}
                    className="mt-4 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest text-white
                               bg-gradient-to-br from-rose-500 to-orange-500
                               shadow-[0_12px_30px_-12px_rgba(244,63,94,0.55)]"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <motion.div
                    animate={{ y: [0, -8, 0], rotate: [0, 6, 0, -6, 0] }}
                    transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                    className="text-6xl"
                  >
                    ✨
                  </motion.div>
                  <div className="text-white font-semibold mt-3">Quiet feed</div>
                  <div className="text-sm text-zinc-400 mt-1 max-w-[280px] mx-auto">
                    Nothing on the books right now. Drop a plan or float an idea — your crew is one tap away.
                  </div>
                </>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/** Drifting blurred orbs behind the feed. Same idea as Floats' BackgroundOrbs
 *  but a different palette (rose · sky · violet) so each tab carries its own
 *  mood without feeling reskinned. */
function FeedBackgroundOrbs() {
  // willChange + opacity fade-in: keeps the orbs from flashing as solid
  // bright dots before the browser applies the blur filter (see FloatsScreen
  // BackgroundOrbs for the same fix).
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute -top-24 -left-10 h-72 w-72 rounded-full bg-rose-500/12 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 24, 0], x: [0, 14, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut' },
          y: { duration: 20, repeat: Infinity, ease: 'easeInOut' },
          x: { duration: 20, repeat: Infinity, ease: 'easeInOut' },
        }}
      />
      <motion.div
        className="absolute top-1/4 -right-20 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -30, 0], x: [0, -18, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut', delay: 0.05 },
          y: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 3 },
          x: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 3 },
        }}
      />
      <motion.div
        className="absolute bottom-20 left-1/5 h-64 w-64 rounded-full bg-violet-500/12 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -18, 0], x: [0, 12, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut', delay: 0.1 },
          y: { duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 5 },
          x: { duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 5 },
        }}
      />
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
