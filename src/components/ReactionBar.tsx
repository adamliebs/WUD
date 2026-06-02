import { AnimatePresence, motion } from 'framer-motion';
import { SmilePlus } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../store';
import type { Reaction } from '../types';

// All chip enter/exit + tap scale animations were removed — reactions
// re-render on every realtime tick, and the springy bounce made the feed
// feel jittery (every chip on every card animated when anything changed).
// Picker popover keeps its fade so the menu still feels intentional.

const PICKER_EMOJIS = ['👍', '🔥', '❤️', '😂', '🎉', '🙌', '🍻', '🤝', '✨', '💯'];

interface Props {
  activityId: string;
  reactions: Reaction[];
  /** "compact" = small chips for the card; "full" = bigger chips for the detail sheet. */
  size?: 'compact' | 'full';
  /** If true, tapping the picker stops propagation (useful inside a clickable card). */
  stopPropagation?: boolean;
}

/**
 * Renders a tappable strip of reaction counts. Each chip toggles your reaction
 * for that emoji. The "+" button reveals a small popover with quick options.
 *
 * Reactions are merged across users — one chip per emoji, count = users.
 */
export function ReactionBar({ activityId, reactions, size = 'compact', stopPropagation }: Props) {
  const meId = useApp(s => s.meId);
  const toggle = useApp(s => s.toggleReaction);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Aggregate { emoji -> { count, mine } } preserving first-seen order.
  const order: string[] = [];
  const agg: Record<string, { count: number; mine: boolean }> = {};
  for (const r of reactions) {
    if (!agg[r.emoji]) { agg[r.emoji] = { count: 0, mine: false }; order.push(r.emoji); }
    agg[r.emoji].count += 1;
    if (r.userId === meId) agg[r.emoji].mine = true;
  }

  const chipBase = size === 'compact'
    ? 'h-7 px-2 text-[12px] gap-1'
    : 'h-9 px-3 text-sm gap-1.5';

  const handle = (e: React.MouseEvent, fn: () => void) => {
    if (stopPropagation) e.stopPropagation();
    fn();
  };

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {order.map(emoji => {
        const { count, mine } = agg[emoji];
        return (
          <button
            key={emoji}
            onClick={e => handle(e, () => toggle(activityId, emoji))}
            className={`inline-flex items-center rounded-full border font-semibold transition ${chipBase}
                        ${mine
                          ? 'bg-rose-500/20 border-rose-400/50 text-rose-100'
                          : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'}`}
            aria-pressed={mine}
            aria-label={`${emoji} ${count}${mine ? ', remove your reaction' : ', add your reaction'}`}
          >
            <span>{emoji}</span>
            <span className="tabular-nums">{count}</span>
          </button>
        );
      })}

      <button
        onClick={e => handle(e, () => setPickerOpen(v => !v))}
        className={`inline-flex items-center justify-center rounded-full border text-zinc-300
                    bg-white/5 border-white/10 hover:bg-white/10 transition
                    ${size === 'compact' ? 'h-7 w-7' : 'h-9 w-9'}`}
        aria-label="Add a reaction"
      >
        <SmilePlus size={size === 'compact' ? 13 : 16} />
      </button>

      <AnimatePresence>
        {pickerOpen && (
          <>
            {/* Click-away catcher (transparent, full screen relative to nearest positioned ancestor). */}
            <div
              className="fixed inset-0 z-40"
              onClick={e => handle(e, () => setPickerOpen(false))}
            />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.14 }}
              // Pin to the right edge of the bar (so it can't push past the card)
              // and wrap into 2 rows so all 10 emojis fit on a narrow phone width.
              className="absolute right-0 z-50 glass-strong rounded-2xl p-2 shadow-xl
                         grid grid-cols-5 gap-1 w-[220px]"
              style={{ bottom: 'calc(100% + 6px)' }}
              onClick={e => stopPropagation && e.stopPropagation()}
            >
              {PICKER_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={e => handle(e, () => {
                    toggle(activityId, emoji);
                    setPickerOpen(false);
                  })}
                  className={`h-9 w-9 grid place-items-center rounded-xl text-xl transition
                              ${agg[emoji]?.mine ? 'bg-rose-500/20 ring-1 ring-rose-400/50' : 'hover:bg-white/10'}`}
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
