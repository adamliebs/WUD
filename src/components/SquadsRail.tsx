import { motion } from 'framer-motion';
import { Plus, Users } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useApp } from '../store';

/**
 * Horizontal pill rail of the user's squads — sits near the top of the
 * Feed so squads stop hiding two clicks deep in Profile. Tapping a chip
 * opens the Squads overlay; the leading "+" chip jumps to the create
 * flow. When the user has no squads yet, the rail collapses to a single
 * tinted helper card nudging them to make one.
 *
 * Visual tone uses the rose→orange brand gradient on hover/active so the
 * rail feels like part of the warm header strip, not a separate UI.
 */
export function SquadsRail() {
  const squads = useApp(useShallow(s =>
    s.squads.filter(sq => sq.hostId === s.meId || sq.memberIds.includes(s.meId)),
  ));
  const openOverlay = useApp(s => s.openOverlay);
  const openSquad = useApp(s => s.openSquad);

  // Empty state — single nudge card. Discoverable but not pushy.
  if (squads.length === 0) {
    return (
      <div className="px-4 mt-1 mb-3">
        <motion.button
          whileTap={{ scale: 0.985 }}
          onClick={() => openOverlay('squads')}
          className="w-full inline-flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl text-left
                     bg-gradient-to-br from-rose-500/12 via-orange-500/8 to-amber-500/8
                     border border-rose-400/25 hover:border-rose-400/40 transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-full grid place-items-center
                            bg-gradient-to-br from-rose-500 to-orange-500 text-white shrink-0">
              <Users size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">Make a squad</div>
              <div className="text-[11px] text-zinc-300 truncate">
                Group friends so plans land with the right crew.
              </div>
            </div>
          </div>
          <div className="shrink-0 h-7 w-7 grid place-items-center rounded-full
                          bg-white text-zinc-900">
            <Plus size={14} strokeWidth={3} />
          </div>
        </motion.button>
      </div>
    );
  }

  return (
    <div className="px-4 mt-1 mb-3">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Users size={12} className="text-rose-300" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
          Squads
          <span className="text-zinc-500 normal-case tracking-normal"> · {squads.length}</span>
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
        {/* Leading "+" chip — always present so creating another squad
            takes the same tap whether you have 0 or 20. */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => openOverlay('squads')}
          aria-label="Create a squad"
          className="shrink-0 h-9 inline-flex items-center gap-1.5 pl-2.5 pr-3 rounded-xl
                     bg-white/5 border border-white/10 border-dashed text-zinc-200 text-[12px] font-semibold
                     hover:bg-white/10 transition"
        >
          <span className="h-5 w-5 grid place-items-center rounded-full
                           bg-gradient-to-br from-rose-500 to-orange-500 text-white">
            <Plus size={12} strokeWidth={3} />
          </span>
          New
        </motion.button>
        {squads.map(sq => {
          // Count = host + members. Host never appears in memberIds.
          const total = 1 + sq.memberIds.length;
          return (
            <motion.button
              key={sq.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => openSquad(sq.id)}
              className="shrink-0 h-9 inline-flex items-center gap-1.5 px-3 rounded-xl
                         bg-white/5 border border-white/10 text-white text-[12px] font-semibold
                         hover:bg-white/10 transition"
            >
              <span className="text-base leading-none">{sq.emoji}</span>
              <span className="truncate max-w-[120px]">{sq.name}</span>
              <span className="ml-0.5 text-[10px] tabular-nums text-zinc-400 font-bold">
                {total}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
