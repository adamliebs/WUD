import { motion } from 'framer-motion';
import { Sparkles, Users, Wand2 } from 'lucide-react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { categoryFor } from '../data/categories';
import { clockTime, relDayLabel, useApp, type SuggestionTap } from '../store';
import { mediaUrl } from '../api/client';
import { AvatarStack } from './Avatar';
import type { Activity } from '../types';

/**
 * "For you" rail rendered above the Feed list. Two stacked sections, each
 * hard-capped at 3 so the rail can never push the actual feed below the fold:
 *
 *   1) Digest cards — morning pulse / big night / starting-soon / category
 *      cluster. Tap applies the matching filter so the user lands in the slice
 *      that backed the card. Same items also surface as notifications when the
 *      server scheduler wires them up.
 *   2) "Picked for you" — three specific events ranked by friend overlap ×
 *      time-proximity × category affinity. Tap opens the activity.
 *
 * Why useMemo + getState() instead of useApp(useShallow(selector))?
 * Selectors here return freshly-constructed arrays each call, so shallow
 * equality still treats every snapshot as new and trips zustand's infinite-
 * loop guard. Memoizing by the primitive deps gives us a stable ref.
 */
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

  const setFilter = useApp(s => s.setFeedFilter);
  const openActivity = useApp(s => s.openActivity);

  // Each digest carries a `tap` describing what should happen — either apply
  // a filter (and scroll the user to the filtered results) or open one
  // specific activity directly. Cards like big_night use 'open' so tapping
  // them lands you on the actual primary plan, not a vague week-wide filter.
  const handleTap = (tap: SuggestionTap) => {
    if (tap.action === 'open') {
      openActivity(tap.activityId);
      return;
    }
    setFilter(tap.apply);
    // RAF lets the filter re-render commit so we scroll to the new layout.
    requestAnimationFrame(() => {
      document.getElementById('feed-results-anchor')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (suggestions.length === 0 && ranked.length === 0) return null;

  return (
    <div className="px-4 mt-1 mb-3">
      {/* Section header — shared between digests and picks so the two
          sub-sections read as one For You rail rather than two strangers. */}
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Wand2 size={12} className="text-fuchsia-300" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
          For you
        </span>
      </div>

      {/* --- Digests ------------------------------------------------------- */}
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-2">
          {suggestions.map((sg, i) => (
            <motion.button
              key={`${sg.kind}-${i}`}
              whileTap={{ scale: 0.985 }}
              onClick={() => handleTap(sg.tap)}
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
          ))}
        </div>
      )}

      {/* --- Picked events ------------------------------------------------- */}
      {ranked.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 mt-3 mb-2 px-1">
            <Sparkles size={12} className="text-amber-300" />
            <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
              Suggestions
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {ranked.map(a => <SuggestedEventRow key={a.id} activity={a} />)}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Compact one-line event row used by the "Suggestions" sub-section.
 * Deliberately smaller than ActivityCard so three rows fit above the feed
 * without dominating it.
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
      {/* Category glyph — uses the banner if one's set, else the category gradient. */}
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
