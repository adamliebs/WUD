import { motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { PulseButton } from '../components/PulseButton';
import { useApp } from '../store';

/**
 * Abuse-report sheet — pops up whenever `reportSheet` state is set in the
 * store. Required by Apple Guideline 1.2 for UGC apps; the picker keeps the
 * reasons short and meaningful so reports are tractable to triage.
 *
 * Three targetable shapes: a user, a plan, or a single chat message — the
 * sheet's title and reason list adapt to which was opened.
 */
const REASONS_BY_KIND: Record<'user' | 'activity' | 'message', string[]> = {
  user: [
    'Pretending to be someone else',
    'Harassment or bullying',
    'Hate speech or threats',
    'Spam or scam',
    'Underage user',
    'Something else',
  ],
  activity: [
    'Inappropriate or unsafe content',
    'Spam or scam',
    'Misleading details',
    'Hate speech or threats',
    'Something else',
  ],
  message: [
    'Harassment or bullying',
    'Hate speech or threats',
    'Sexual or violent content',
    'Spam or scam',
    'Something else',
  ],
};

const TITLE_BY_KIND: Record<'user' | 'activity' | 'message', string> = {
  user: 'Report user',
  activity: 'Report plan',
  message: 'Report message',
};

export function ReportSheet() {
  const target = useApp(s => s.reportSheet);
  const close = useApp(s => s.openReportSheet);
  const submit = useApp(s => s.reportTarget);

  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever a new target is opened so old state doesn't bleed
  // across reports. setState inside the effect is intentional — `target` is
  // an external state change (store-driven) and we want the form to reflect
  // it, matching the GoLiveSheet pattern elsewhere in the codebase.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (target) { setReason(null); setNote(''); setSubmitting(false); }
  }, [target]);

  if (!target) {
    return <BottomSheet open={false} onClose={() => close(null)} size="tall">{null}</BottomSheet>;
  }

  const reasons = REASONS_BY_KIND[target.kind];
  const title = TITLE_BY_KIND[target.kind];

  const onSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    const ok = await submit({
      targetKind: target.kind,
      targetId: target.targetId,
      reason,
      note: note.trim() || undefined,
    });
    setSubmitting(false);
    if (ok) close(null);
  };

  return (
    <BottomSheet open onClose={() => close(null)} size="tall">
      <div className="h-full flex flex-col px-5 pb-6">
        <div className="flex items-center justify-between pt-2 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-300" />
            <div className="text-lg font-bold text-white">{title}</div>
          </div>
          <button
            onClick={() => close(null)}
            aria-label="Close"
            className="h-8 w-8 grid place-items-center rounded-full bg-white/5 hover:bg-white/10 text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>

        {target.label && (
          <div className="text-[12px] text-zinc-400 mb-3 truncate">
            <span className="text-zinc-500">Target: </span>
            <span className="text-zinc-200">{target.label}</span>
          </div>
        )}

        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 mt-1">
          Reason
        </div>
        <div className="flex flex-col gap-1.5 overflow-y-auto no-scrollbar">
          {reasons.map(r => (
            <motion.button
              key={r}
              whileTap={{ scale: 0.985 }}
              onClick={() => setReason(r)}
              className={`text-left text-sm px-3.5 py-2.5 rounded-2xl border transition
                          ${reason === r
                            ? 'bg-gradient-to-r from-rose-500/25 to-orange-500/15 border-rose-400/40 text-white'
                            : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'}`}
            >
              {r}
            </motion.button>
          ))}
        </div>

        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-4 mb-2">
          Anything else? (optional)
        </div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value.slice(0, 1000))}
          placeholder="Add context for the moderation team."
          rows={3}
          className="w-full bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5 text-sm
                     text-white placeholder:text-zinc-500
                     focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
        />

        {/* Footer — fixed CTA pinned to bottom. Disabled until a reason picked. */}
        <div className="mt-4">
          <PulseButton onClick={onSubmit} disabled={!reason || submitting}>
            {submitting ? 'Sending…' : 'Submit report'}
          </PulseButton>
          <div className="text-[10.5px] text-zinc-500 text-center mt-2">
            Reports are reviewed by a moderator. We act on policy violations and may notify you of the outcome.
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
