import { AnimatePresence, motion } from 'framer-motion';
import { BarChart3, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { PulseButton } from '../components/PulseButton';
import { useApp } from '../store';

const MAX_OPTIONS = 6;

/** Bottom sheet to create a poll in an activity chat. Opened from ChatPane. */
export function PollComposerSheet() {
  const activityId = useApp(s => s.pollComposerActivityId);
  const close = useApp(s => s.setPollComposerActivityId);
  const sendPoll = useApp(s => s.sendPoll);

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  // Reset when sheet (re-)opens for a new activity.
  useEffect(() => {
    if (activityId) {
      setQuestion('');
      setOptions(['', '']);
    }
  }, [activityId]);

  const updateOption = (i: number, v: string) =>
    setOptions(prev => prev.map((o, idx) => (idx === i ? v : o)));
  const addOption = () =>
    setOptions(prev => (prev.length < MAX_OPTIONS ? [...prev, ''] : prev));
  const removeOption = (i: number) =>
    setOptions(prev => prev.filter((_, idx) => idx !== i));

  const validOptionCount = options.filter(o => o.trim()).length;
  const canSubmit = question.trim().length > 0 && validOptionCount >= 2;

  const submit = () => {
    if (!canSubmit || !activityId) return;
    sendPoll(activityId, question, options);
  };

  return (
    <BottomSheet open={!!activityId} onClose={() => close(null)} size="tall">
      <div className="h-full flex flex-col">
        {/* Hero */}
        <div className="relative mx-4 mt-2 overflow-hidden rounded-2xl h-24
                        bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
          <div className="absolute inset-0 px-5 flex items-center justify-between">
            <div>
              <div className="text-white/85 text-xs uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <BarChart3 size={12} />
                New poll
              </div>
              <div className="text-white text-2xl font-black leading-tight mt-0.5">
                Ask the squad
              </div>
            </div>
            <BarChart3 size={48} className="text-white/85 drop-shadow" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-32">
          {/* Question */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-1">
            Question
          </div>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value.slice(0, 120))}
            placeholder="e.g. Where for dinner after?"
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60 focus:border-fuchsia-400/30"
          />

          {/* Options */}
          <div className="flex items-center justify-between mt-5 mb-2 px-1">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
              Options
            </div>
            <div className="text-[11px] text-zinc-500">
              {validOptionCount}/{MAX_OPTIONS} · need ≥2
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <AnimatePresence initial={false}>
              {options.map((opt, i) => (
                <motion.div
                  key={i}
                  layout
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.16 }}
                  className="flex items-center gap-2"
                >
                  <div className="h-9 w-9 rounded-xl grid place-items-center bg-white/5 border border-white/10 text-zinc-300 text-sm font-bold tabular-nums">
                    {i + 1}
                  </div>
                  <input
                    value={opt}
                    onChange={e => updateOption(i, e.target.value.slice(0, 60))}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-white placeholder:text-zinc-500
                               focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60 focus:border-fuchsia-400/30"
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(i)}
                      aria-label={`Remove option ${i + 1}`}
                      className="h-9 w-9 rounded-xl grid place-items-center bg-white/5 border border-white/10 text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10"
                    >
                      <X size={14} />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {options.length < MAX_OPTIONS && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={addOption}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-white/5 border border-dashed border-white/15 text-zinc-300 text-sm font-semibold hover:bg-white/10 transition"
              >
                <Plus size={14} />
                Add option
              </motion.button>
            )}
          </div>

          <div className="text-[11px] text-zinc-500 mt-3 px-1">
            One vote per person — tapping a chosen option clears your vote.
          </div>
        </div>

        {/* Sticky submit */}
        <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-4
                        bg-[#0a070f]/95 backdrop-blur-md border-t border-white/10">
          <PulseButton onClick={submit} disabled={!canSubmit}>
            Post poll to chat
          </PulseButton>
        </div>
      </div>
    </BottomSheet>
  );
}
