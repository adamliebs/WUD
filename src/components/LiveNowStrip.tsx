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
                     px-2.5 py-1 rounded-full
                     bg-gradient-to-br from-rose-500 to-orange-500 text-white
                     shadow-[0_6px_18px_-8px_rgba(244,63,94,0.55)]"
          aria-label="Go live"
        >
          <Radio size={11} />
          Go live
        </motion.button>
      </div>

      {liveActivities.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-2 px-2 pb-1">
          {liveActivities.map((a, i) => (
            <LiveActivityCard
              key={a.id}
              activity={a}
              onTap={() => openActivity(a.id)}
              tint={CARD_TINTS[i % CARD_TINTS.length]}
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

/** Per-card tint palette — picked by index so adjacent cards never share
 *  a color. Five entries keeps the cycle long enough that even a busy
 *  feed doesn't repeat for ages. The Live pulse + label tint with the
 *  same hue so each card reads as cohesive. */
interface CardTint {
  bg: string;       // tailwind gradient classes for the card surface
  border: string;   // matching border color
  dot: string;      // pulsing live-dot fill
  label: string;    // "Live" text color
}

const CARD_TINTS: CardTint[] = [
  { bg: 'from-rose-500/15 to-orange-500/10',  border: 'border-rose-400/30',    dot: 'bg-rose-400',    label: 'text-rose-200' },
  { bg: 'from-sky-500/15 to-blue-500/10',     border: 'border-sky-400/30',     dot: 'bg-sky-400',     label: 'text-sky-200' },
  { bg: 'from-emerald-500/15 to-teal-500/10', border: 'border-emerald-400/30', dot: 'bg-emerald-400', label: 'text-emerald-200' },
  { bg: 'from-fuchsia-500/15 to-purple-500/10', border: 'border-fuchsia-400/30', dot: 'bg-fuchsia-400', label: 'text-fuchsia-200' },
  { bg: 'from-amber-500/15 to-orange-500/10', border: 'border-amber-400/30',   dot: 'bg-amber-300',   label: 'text-amber-200' },
];

function LiveActivityCard({
  activity, onTap, tint,
}: {
  activity: Activity;
  onTap: () => void;
  tint: CardTint;
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
      className={`shrink-0 w-[168px] rounded-2xl p-2.5 text-left relative overflow-hidden
                  bg-gradient-to-br ${tint.bg} ${tint.border} border hover:brightness-110 transition`}
    >
      {/* faint category tint behind content — still respects the activity's
          category color so two same-tint cards in the cycle still feel
          distinct when their categories differ. */}
      <div className={`absolute -inset-1 opacity-30 bg-gradient-to-br ${cat.gradient}`} />
      <div className="relative">
        <div className="flex items-center gap-2">
          <Avatar user={host} size={28} />
          <div className="min-w-0 flex-1">
            <div className={`text-[9px] uppercase tracking-widest font-bold flex items-center gap-1 ${tint.label}`}>
              <span className={`relative inline-block h-1 w-1 rounded-full live-dot ${tint.dot}`} />
              Live
            </div>
            <div className="text-[13px] font-bold text-white truncate leading-tight">
              {host.name}
            </div>
          </div>
        </div>

        <div className="mt-1.5 text-[12px] text-zinc-100 line-clamp-2 leading-snug">
          <span className="mr-1">{cat.emoji}</span>
          {activity.title}
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-zinc-300">
          <span className="truncate">{liveTimingLabel(activity)}</span>
          {extra > 0 && (
            <span className="ml-1.5 shrink-0 bg-white/10 text-white px-1.5 py-0.5 rounded-full font-bold">
              +{extra}
            </span>
          )}
        </div>
      </div>
    </motion.button>
  );
}
