import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Lock, Search, Sparkles, UserPlus, Users, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { isLiveActivity, useApp } from '../store';
import { ActivityCard } from '../components/ActivityCard';
import { FeedFilters } from '../components/FeedFilters';
import { LiveNowStrip } from '../components/LiveNowStrip';
import { SquadsRail } from '../components/SquadsRail';
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
  const meId = useApp(s => s.meId);
  // Split full plans out of the main feed. A plan is full once
  // maxSize is set and the going head-count has hit it. Plans I'm
  // already in stay in the main feed so I don't lose sight of my own
  // commitments. The full ones live in a collapsible rail at the
  // bottom so the user can still see + tap "Joined" on something they
  // missed, but they no longer compete with discoverable plans up
  // top.
  const { openPlans, fullPlans } = useMemo(() => {
    const open: typeof activities = [];
    const full: typeof activities = [];
    for (const a of activities) {
      const headcount = 1 + a.joinerIds.length;
      const isFull = a.maxSize != null && headcount >= a.maxSize;
      const mine = a.hostId === meId || a.joinerIds.includes(meId);
      if (isFull && !mine) full.push(a);
      else open.push(a);
    }
    return { openPlans: open, fullPlans: full };
  }, [activities, meId]);
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
            <RefreshButton onRefresh={refreshAll} ariaLabel="Refresh feed" />
            <FriendsQuickButton onClick={() => openOverlay('friends')} />
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

        {/* Scope toggle — only shown when there's a friend-of-friend plan
            available. No entrance animation, no spring sliding pill —
            both fired on every tab swipe back to Feed and read as jank.
            The active option just paints solid; the inactive one stays
            transparent. */}
        {hasFoF && (
          <div className="mt-4 relative grid grid-cols-2 bg-white/5 border border-white/10 rounded-2xl p-1">
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
          </div>
        )}
      </div>

      {/* Scroll list — plain scroll container. Pull-to-refresh was removed
          because it was too sensitive on iOS; refresh now lives as an
          explicit button in the header above. `overscroll-none` kills
          the iOS rubber-band overscroll bounce at top + bottom — the
          bounce was the main source of perceived lag during fast scrolls
          (each bounce settles via a system spring that competes with our
          own scroll-driven renders). */}
      <div className="relative flex-1 overflow-y-auto overscroll-none no-scrollbar pb-32 pt-2">
        <LiveNowStrip />
        <SquadsRail />
        <FeedFilters count={activities.length} />
        {/* For You sits below the filters now and starts collapsed — the
            real feed is the headline experience; suggestions are an
            opt-in nudge. */}
        <SmartSuggestions />
        {/* Anchor target for For You "tap to filter" jumps — sits below
            SmartSuggestions so an expand-then-tap lands the user at the
            filtered results, past the suggestion rail. */}
        <div id="feed-results-anchor" />
        {/* Plain list, no entrance animation. The stagger-in cascade was
            cute on first load but added perceptible lag every time the
            user came back to the Feed tab — and the cards themselves
            don't need it to read as fresh. Each card mounts immediately,
            no spring math, no compositing per-card. */}
        <div className="flex flex-col gap-3 px-4">
          {openPlans.map(a => (
            <ActivityCard key={a.id} activity={a} />
          ))}

          {fullPlans.length > 0 && <FullPlansSection plans={fullPlans} />}

          {openPlans.length === 0 && fullPlans.length === 0 && (
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
        </div>
      </div>
    </div>
  );
}

/** Drifting blurred orbs behind the feed. Same idea as Floats' BackgroundOrbs
 *  but a different palette (rose · sky · violet) so each tab carries its own
 *  mood without feeling reskinned. */
/** Collapsible rail of plans that have hit their max party size. Sits at
 *  the bottom of the feed so full plans don't compete with the ones the
 *  user can still join, but stay accessible — handy when someone wants
 *  to see what they missed or check who's going. */
function FullPlansSection({ plans }: { plans: import('../types').Activity[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full inline-flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl
                   bg-white/5 border border-white/10 hover:bg-white/10 transition"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Lock size={13} className="text-zinc-400 shrink-0" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-300 font-bold">
            Full plans
          </span>
          <span className="text-[11px] text-zinc-400 font-semibold normal-case tracking-normal">
            · {plans.length}
          </span>
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="text-zinc-400"
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 pt-3">
              {plans.map(a => (
                <ActivityCard key={a.id} activity={a} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Quick-tap shortcut to the Friends overlay — same visual weight as
 *  Search / Refresh so it reads as a peer in the header. Decorates with a
 *  rose dot badge when there's at least one pending incoming friend request,
 *  so the user knows there's something to action without opening the
 *  overlay. */
function FriendsQuickButton({ onClick }: { onClick: () => void }) {
  const pendingCount = useApp(s => s.friendRequests.length);
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      aria-label={pendingCount > 0 ? `Friends · ${pendingCount} pending request${pendingCount === 1 ? '' : 's'}` : 'Friends'}
      className="relative h-9 w-9 grid place-items-center rounded-full
                 bg-white/5 border border-white/10 text-zinc-200
                 hover:bg-white/10 transition"
    >
      <UserPlus size={16} />
      {pendingCount > 0 && (
        // Small rose dot with the count — caps at 9+ so it never breaks
        // the circle frame even on a noisy account.
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1
                         grid place-items-center rounded-full
                         text-[10px] font-bold text-white
                         bg-gradient-to-br from-rose-500 to-orange-500
                         ring-2 ring-[#0a070f]">
          {pendingCount > 9 ? '9+' : pendingCount}
        </span>
      )}
    </motion.button>
  );
}

function FeedBackgroundOrbs() {
  // Rendered as radial gradients rather than blur-filtered circles. The
  // previous blur(64px) pass was re-rasterised every time the pager swiped
  // this pane into view, producing a brief un-blurred bright flash before
  // the GPU re-applied the filter — exactly the "gets brighter then dims"
  // jitter users noticed when flicking back to Feed. A gradient is drawn
  // directly to the compositor layer, so no per-paint filter pass and no
  // flash.
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        background: [
          'radial-gradient(280px 280px at 8% -4%, rgba(244, 63, 94, 0.18), transparent 70%)',
          'radial-gradient(320px 320px at 105% 28%, rgba(56, 189, 248, 0.14), transparent 70%)',
          'radial-gradient(260px 260px at 22% 78%, rgba(139, 92, 246, 0.18), transparent 70%)',
        ].join(', '),
      }}
    />
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
      className={`relative py-2 rounded-xl text-xs font-semibold transition
                  ${active ? 'bg-white text-zinc-900' : 'text-zinc-300'}`}
    >
      <span className="relative inline-flex items-center gap-1.5">
        {icon}
        {label}
      </span>
    </button>
  );
}
