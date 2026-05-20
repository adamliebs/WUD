import { motion } from 'framer-motion';
import { BarChart3, Check } from 'lucide-react';
import { useApp } from '../store';
import type { ChatMessage } from '../types';

interface Props {
  activityId: string;
  message: ChatMessage;     // must have type === 'poll'
  mine: boolean;
  canVote: boolean;
}

/** Render a poll chat message — question, vote bars, tappable options. */
export function PollBubble({ activityId, message, mine, canVote }: Props) {
  const meId = useApp(s => s.meId);
  const vote = useApp(s => s.voteInPoll);
  const poll = message.poll!;

  const totalVotes = poll.options.reduce((sum, o) => sum + o.voterIds.length, 0);

  const containerCls = mine
    ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-br-sm shadow-[0_8px_30px_-10px_rgba(244,63,94,0.6)]'
    : 'bg-white/8 text-zinc-100 rounded-bl-sm border border-white/5';

  // No inner width cap — the wrapper in ChatPane already constrains the bubble.
  // (Adding another max-w here was double-constraining and squishing labels.)
  return (
    <div className={`w-full px-3.5 pt-2.5 pb-2.5 rounded-2xl ${containerCls}`}>
      <div className={`flex items-center gap-1.5 text-[10.5px] uppercase tracking-widest font-bold
                       ${mine ? 'text-white/80' : 'text-zinc-400'}`}>
        <BarChart3 size={11} />
        Poll
      </div>
      <div className={`text-sm font-bold mt-1 leading-snug ${mine ? 'text-white' : 'text-zinc-100'}`}>
        {poll.question}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {poll.options.map(opt => {
          const count = opt.voterIds.length;
          const pct = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
          const minePicked = opt.voterIds.includes(meId);
          return (
            <motion.button
              key={opt.id}
              whileTap={canVote ? { scale: 0.985 } : undefined}
              disabled={!canVote}
              onClick={() => vote(activityId, message.id, opt.id)}
              className={`relative w-full text-left rounded-xl overflow-hidden border transition
                          ${minePicked
                            ? mine
                              ? 'bg-white/20 border-white/40'
                              : 'bg-rose-500/15 border-rose-400/40'
                            : mine
                              ? 'bg-white/10 border-white/15 hover:bg-white/15'
                              : 'bg-white/5 border-white/10 hover:bg-white/10'}
                          ${!canVote ? 'cursor-not-allowed opacity-90' : ''}`}
            >
              {/* Filled bar (sits behind the label). When totalVotes === 0 it's 0%. */}
              <motion.div
                aria-hidden
                initial={false}
                animate={{ width: `${pct}%` }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className={`absolute inset-y-0 left-0 ${
                  mine ? 'bg-white/15' : 'bg-rose-500/15'
                }`}
              />
              {/* min-h keeps the row consistent across vote / no-vote states */}
              <div className="relative flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[40px]">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {minePicked && (
                    <span className={`shrink-0 h-4 w-4 rounded-full grid place-items-center
                                     ${mine ? 'bg-white text-rose-600' : 'bg-rose-500 text-white'}`}>
                      <Check size={10} strokeWidth={3.5} />
                    </span>
                  )}
                  {/* No truncate — option text wraps to 2 lines if needed, so the
                      label is always readable even when the bubble is narrow. */}
                  <span className={`text-sm font-semibold leading-snug
                                    ${mine ? 'text-white' : 'text-zinc-100'}`}>
                    {opt.text}
                  </span>
                </div>
                {/* Cleaner zero state: hide the "· 0%" trailing noise when no votes yet */}
                <div className={`text-[11px] font-bold tabular-nums shrink-0
                                 ${mine ? 'text-white/90' : 'text-zinc-300'}`}>
                  {totalVotes === 0 ? '—' : `${count} · ${pct}%`}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className={`mt-2 text-[10.5px] ${mine ? 'text-white/75' : 'text-zinc-500'}`}>
        {totalVotes === 0
          ? 'No votes yet — be the first'
          : `${totalVotes} vote${totalVotes === 1 ? '' : 's'}`}
        {!canVote && ' · join to vote'}
      </div>
    </div>
  );
}
