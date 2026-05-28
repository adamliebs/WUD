import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Users, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { categoryFor } from '../data/categories';
import { clockTime, relDayLabel, useApp, type Suggestion, type SuggestionTap } from '../store';
import { mediaUrl } from '../api/client';
import { AvatarStack } from './Avatar';
import type { Activity } from '../types';

/**
 * Collapsible "For you" rail above the Feed.
 *
 * Collapsed by default: one teaser line ("✨ N picks for you ›") so the rail
 * doesn't push the real feed below the fold. Tap to expand and reveal up to
 * three items — digests + ranked picks merged into one list, hard-capped at 3.
 *
 * Why useMemo + getState() instead of useApp(useShallow(selector))?
 * Selectors here return freshly-constructed arrays each call, so shallow
 * equality still treats every snapshot as new and trips zustand's infinite-
 * loop guard. Memoizing by the primitive deps gives us a stable ref.
 */

/** A single position on the unified For You rail — either a digest card or a
 *  ranked event pick. Three slots max. */
type Pick =
  | { kind: 'digest'; suggestion: Suggestion }
  | { kind: 'event';  activity: Activity };

export function SmartSuggestions() {
  const activities = useApp(s => s.activities);
  const squads = useApp(s => s.squads);
  const friendIds = useApp(s => s.friendIds);
  const filters = useApp(s => s.feedFilters);
  // Re-run both selectors when the user flips Friends ↔ Friends+FoF so the
  // strip matches the feed below.
  const scope = useApp(s => s.feedScope);

  const suggestions = useMemo(
    () => useApp.getState().smartSuggestions(),
    // deps are subscription triggers, not values the closure reads — see header comment
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, squads, friendIds, filters, scope],
  );
  const ranked = useMemo(
    () => useApp.getState().rankedForYouEvents(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activities, squads, friendIds, scope],
  );

  // Merge digests + picks into one rail, capped at 3. Digests take priority —
  // they're higher-level signal ("big night tonight") than a single event row.
  // Drop any pick that's already pointed at by an `open` digest so we don't
  // surface the same activity twice with different framings.
  const picks: Pick[] = useMemo(() => {
    const openedByDigest = new Set(
      suggestions
        .filter(s => s.tap.action === 'open')
        .map(s => (s.tap as Extract<SuggestionTap, { action: 'open' }>).activityId),
    );
    const out: Pick[] = suggestions.map(s => ({ kind: 'digest', suggestion: s }));
    for (const a of ranked) {
      if (out.length >= 3) break;
      if (openedByDigest.has(a.id)) continue;
      out.push({ kind: 'event', activity: a });
    }
    return out.slice(0, 3);
  }, [suggestions, ranked]);

  const setFilter = useApp(s => s.setFeedFilter);
  const openActivity = useApp(s => s.openActivity);

  const [expanded, setExpanded] = useState(true);

  // Each digest carries a `tap` describing what should happen — either apply
  // a filter (and scroll the user to the filtered results) or open one
  // specific activity directly. Filter taps also flip includeLive on so a
  // shortcut like "3 coffee plans today" surfaces every matching plan,
  // including any that are mid-window (which the feed otherwise hides).
  const handleTap = (tap: SuggestionTap) => {
    if (tap.action === 'open') {
      openActivity(tap.activityId);
      return;
    }
    setFilter({ ...tap.apply, includeLive: true });
    requestAnimationFrame(() => {
      document.getElementById('feed-results-anchor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (picks.length === 0) return null;

  return (
    <div className="px-4 mt-1 mb-3">
      {/* Teaser row — always rendered. Tap toggles the expanded list. */}
      <motion.button
        whileTap={{ scale: 0.985 }}
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full inline-flex items-center justify-between gap-2 px-3 py-2 rounded-2xl
                   bg-gradient-to-r from-fuchsia-500/10 via-rose-500/10 to-orange-500/10
                   border border-fuchsia-400/20 hover:border-fuchsia-400/35 transition"
      >
        <span className="inline-flex items-center gap-2 min-w-0">
          <Wand2 size={13} className="text-fuchsia-300 shrink-0" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-fuchsia-100 font-bold">
            For you
          </span>
          <span className="text-[11px] text-fuchsia-200/80 font-semibold normal-case tracking-normal">
            · {picks.length} pick{picks.length === 1 ? '' : 's'}
          </span>
        </span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="text-fuchsia-200/80"
        >
          <ChevronDown size={14} />
        </motion.span>
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-2">
              {picks.map((p, i) => p.kind === 'digest' ? (
                <DigestRow key={`d-${i}`} suggestion={p.suggestion} onTap={handleTap} />
              ) : (
                <SuggestedEventRow key={p.activity.id} activity={p.activity} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DigestRow({
  suggestion: sg, onTap,
}: {
  suggestion: Suggestion;
  onTap: (tap: SuggestionTap) => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={() => onTap(sg.tap)}
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
        {/* Sub-label tells the user what tapping will do, so an "open"
            card doesn't masquerade as a filter shortcut. */}
        <div className="text-[11px] text-fuchsia-200/90 mt-0.5">
          {sg.tap.action === 'open' ? 'Tap to open' : 'Tap to filter'}
        </div>
      </div>
    </motion.button>
  );
}

/**
 * Compact one-line event row used for ranked picks. Smaller than ActivityCard
 * so several can sit in the rail without dominating the feed.
 */
function SuggestedEventRow({ activity }: { activity: Activity }) {
  const cat = categoryFor(activity);
  const openActivity = useApp(s => s.openActivity);
  // Friends-going (excluding the host slot, since the host already shows up
  // implicitly via the title context — keeps the avatar stack short).
  const friendGoers = useApp(useShallow(s =>
    activity.joinerIds.filter(id => s.isFriend(id)).map(id => s.userById(id))
  ));
  const isHostFriend = useApp(s => s.isFriend(activity.hostId));
  const host = useApp(s => s.userById(activity.hostId));
  const total = 1 + activity.joinerIds.length;
  const stack = isHostFriend ? [host, ...friendGoers] : friendGoers;

  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={() => openActivity(activity.id)}
      className="w-full text-left flex items-center gap-3 p-2.5 rounded-2xl bg-white/[0.04]
                 border border-white/10 hover:bg-white/[0.08] transition"
    >
      <div className={`relative h-10 w-10 rounded-xl overflow-hidden grid place-items-center text-xl shrink-0
                       ${activity.bannerUrl ? '' : `bg-gradient-to-br ${cat.gradient}`}`}>
        {activity.bannerUrl ? (
          <img src={mediaUrl(activity.bannerUrl)} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
            <span className="relative drop-shadow">{cat.emoji}</span>
          </>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{activity.title}</div>
        <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5">
          <span>{relDayLabel(activity.startsAt)} · {clockTime(activity.startsAt)}</span>
          <span aria-hidden>·</span>
          <Users size={10} className="text-zinc-500" />
          <span>{total}</span>
        </div>
      </div>
      {stack.length > 0 && <AvatarStack users={stack} size={20} max={3} />}
    </motion.button>
  );
}
