import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { isLiveActivity, useApp } from '../store';
import type { Activity } from '../types';
import { categoryFor } from '../data/categories';
import { Avatar, AvatarStack } from './Avatar';

/**
 * Horizontal strip at the top of the Feed showing what's happening RIGHT NOW.
 *
 * After the live/activities merge, "live" no longer belongs to users — it
 * belongs to activities whose [startsAt, endsAt] window covers `now`. The
 * strip surfaces those activities. The "Go live" affordance is a small pill
 * in the header row so it doesn't eat horizontal space the live cards need.
 *
 * Tap "Go live" → GoLiveSheet.
 * Tap an activity card → ActivityDetailSheet.
 */
export function LiveNowStrip() {
  const setShowGoLive = useApp(s => s.setShowGoLiveSheet);
  const openActivity = useApp(s => s.openActivity);

  // Activities currently in their live window AND visible to me. The store
  // filter (canSeeActivity) is already applied via visibleActivities(); we
  // re-filter to the live window here. Newest start first so the freshest
  // "just went live" reads at the head of the strip.
  const liveActivities = useApp(useShallow(s =>
    s.visibleActivities()
      .filter(isLiveActivity)
      .sort((a, b) => b.startsAt - a.startsAt)
  ));

  return (
    <div className="px-4 mt-1 mb-3">
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-rose-400 text-rose-400 live-dot" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
            Live now
            {liveActivities.length > 0 && (
              <span className="text-rose-300 normal-case tracking-normal font-bold ml-1">
                · {liveActivities.length}
              </span>
            )}
          </span>
        </span>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => setShowGoLive(true)}
          className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold
                     px-2.5 py-1 rounded-lg
                     bg-gradient-to-br from-rose-500 to-orange-500 text-white
                     shadow-[0_6px_18px_-8px_rgba(244,63,94,0.55)]"
          aria-label="Go live"
        >
          <Radio size={11} />
          Go live
        </motion.button>
      </div>

      {liveActivities.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          {liveActivities.map(a => (
            <LiveActivityCard
              key={a.id}
              activity={a}
              onTap={() => openActivity(a.id)}
            />
          ))}
        </div>
      ) : (
        <div className="px-1 text-[11px] text-zinc-500">
          Nothing live right now — be the spark.
        </div>
      )}
    </div>
  );
}

/** Format "Started Xm ago · Ym left" (or "Xh ago / Yh left" when long). */
function liveTimingLabel(a: Activity): string {
  const now = Date.now();
  const sinceStart = Math.max(0, now - a.startsAt);
  const untilEnd = Math.max(0, a.endsAt - now);
  const fmt = (ms: number) => {
    const m = Math.round(ms / 60_000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
  };
  return `${fmt(sinceStart)} ago · ${fmt(untilEnd)} left`;
}

function LiveActivityCard({
  activity, onTap,
}: {
  activity: Activity;
  onTap: () => void;
}) {
  const userById = useApp(s => s.userById);
  const host = userById(activity.hostId);
  const cat = categoryFor(activity);
  // Resolve joiner avatars so we can render a small stack. AvatarStack
  // caps the visible faces at `max` and renders a "+N" tile for the
  // overflow, which is exactly the requested behavior (first 2 faces,
  // then a +N chip).
  const joiners = activity.joinerIds.map(id => userById(id));

  // Cards used to be a 168px-wide rainbow strip: each one painted a
  // colored gradient (rose / sky / fuchsia / etc.) PLUS a second category
  // gradient overlay. Stacked side by side they read as a neon
  // advertisement bar above the actual plans. Now: a compact neutral
  // card with a soft rose halo + a rose-tinted border so the strip still
  // reads as "alive RIGHT NOW" without painting the whole card. The
  // halo is a static box-shadow (no animation) — the actual movement
  // comes from the small live-dot pulse on the label.
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className="shrink-0 w-[150px] rounded-2xl p-2.5 text-left relative
                 bg-white/[0.05] border border-rose-400/35
                 shadow-[0_0_22px_-6px_rgba(244,63,94,0.45),inset_0_0_0_1px_rgba(255,255,255,0.03)]
                 hover:bg-white/[0.08] transition"
    >
      {/* Title is the primary line — the section header already says
          "LIVE NOW", so repeating "Live" on every card was redundant
          chrome. Host's avatar + name moved down to a single secondary
          row alongside the timing. */}
      <div className="text-[13px] font-bold text-white line-clamp-2 leading-tight">
        <span className="mr-1">{cat.emoji}</span>
        {activity.title}
      </div>

      <div className="mt-2 flex items-center gap-1.5 min-w-0">
        <Avatar user={host} size={18} />
        <span className="text-[11px] text-zinc-300 truncate font-medium">{host.name}</span>
        {joiners.length > 0 && (
          <div className="ml-auto shrink-0">
            <AvatarStack users={joiners} size={18} max={2} />
          </div>
        )}
      </div>
      <div className="mt-1 text-[10px] text-zinc-500 truncate">
        {liveTimingLabel(activity)}
      </div>
    </motion.button>
  );
}
