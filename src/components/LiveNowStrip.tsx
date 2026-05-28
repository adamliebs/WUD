import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { isLiveActivity, useApp } from '../store';
import type { Activity } from '../types';
import { categoryFor } from '../data/categories';
import { Avatar } from './Avatar';

/**
 * Horizontal strip at the top of the Feed showing what's happening RIGHT NOW.
 *
 * After the live/activities merge, "live" no longer belongs to users — it
 * belongs to activities whose [startsAt, endsAt] window covers `now`. So this
 * surfaces those activities directly:
 *
 *   1. A "You" card — Go live shortcut (always present, primary CTA).
 *   2. One card per live activity I can see, newest first. No bundling —
 *      identical-looking events stay distinct because each is its own plan
 *      with its own host + joiners + chat.
 *
 * Tap the You card → GoLiveSheet.
 * Tap an activity card → ActivityDetailSheet (where the user can RSVP / chat /
 * ask "still happening?").
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
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-rose-400 text-rose-400 live-dot" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
          Live now
          {liveActivities.length > 0 && (
            <span className="text-rose-300 normal-case tracking-normal font-bold ml-1">
              · {liveActivities.length}
            </span>
          )}
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-2 px-2 pb-1">
        <YouCard onTap={() => setShowGoLive(true)} />

        {liveActivities.map(a => (
          <LiveActivityCard
            key={a.id}
            activity={a}
            onTap={() => openActivity(a.id)}
          />
        ))}

        {liveActivities.length === 0 && (
          <div className="self-center pl-1 text-[11px] text-zinc-500">
            Nothing live right now — be the spark.
          </div>
        )}
      </div>
    </div>
  );
}

function YouCard({ onTap }: { onTap: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className="shrink-0 w-[148px] rounded-2xl p-3 text-left
                 bg-white/5 border border-dashed border-white/20 hover:bg-white/10 transition"
    >
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-full grid place-items-center bg-gradient-to-br from-rose-500 to-orange-500 text-white">
          <Radio size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">You</div>
          <div className="text-sm font-bold text-white truncate">Go live</div>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-zinc-400 truncate">
        Tell friends what you're up to right now.
      </div>
    </motion.button>
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
  return `Started ${fmt(sinceStart)} ago · ${fmt(untilEnd)} left`;
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
  // Host + going RSVPs minus host (host never appears in joinerIds).
  const partySize = 1 + activity.joinerIds.length;
  const extra = partySize - 1; // "+N more" beyond the host

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className="shrink-0 w-[200px] rounded-2xl p-3 text-left relative overflow-hidden
                 bg-gradient-to-br from-rose-500/15 to-orange-500/10
                 border border-rose-400/30 hover:border-rose-400/50 transition"
    >
      {/* faint category tint behind content */}
      <div className={`absolute -inset-1 opacity-30 bg-gradient-to-br ${cat.gradient}`} />
      <div className="relative">
        <div className="flex items-center gap-2">
          <Avatar user={host} size={32} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-rose-200 font-bold flex items-center gap-1">
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-rose-400 live-dot" />
              Live
            </div>
            <div className="text-sm font-bold text-white truncate">
              {host.name}
            </div>
          </div>
        </div>

        <div className="mt-2 text-xs text-zinc-100 line-clamp-2 leading-snug">
          <span className="mr-1">{cat.emoji}</span>
          {activity.title}
        </div>

        <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-300">
          <span className="truncate">{liveTimingLabel(activity)}</span>
          {extra > 0 && (
            <span className="ml-2 shrink-0 bg-white/10 text-white px-1.5 py-0.5 rounded-full font-bold">
              +{extra}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}
