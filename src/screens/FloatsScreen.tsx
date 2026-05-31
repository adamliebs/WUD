import { burst as confetti } from '../lib/confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, MapPin, Send, Sparkles, Timer, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar, AvatarStack } from '../components/Avatar';
import { FriendsRail } from '../components/FriendsRail';
import { RefreshButton } from '../components/RefreshButton';
import { useApp } from '../store';
import type { Float, FloatResponseState, FloatTiming } from '../types';

/**
 * Floats — soft proposals before plans.
 *
 * The page is a balloon park: each float card bobs gently, new floats rise in
 * from below, and locking one in triggers a confetti pop as it dissolves into
 * a real activity. The visual metaphor is helium balloons; the data primitive
 * is a 24h-expiring interest probe.
 *
 * Three sections, all in one scroll:
 *   1. Compose — small composer pinned at the top
 *   2. Active — every float I can see, sender-first
 *   3. Recently expired — fade-out tier so users can re-float ideas
 */
export function FloatsScreen() {
  const me = useApp(s => s.me());
  const floats = useApp(useShallow(s => s.floats));
  const myId = useApp(s => s.meId);
  const refreshAll = useApp(s => s.refreshAll);

  const now = Date.now();
  const active = useMemo(
    () => floats
      .filter(f => f.expiresAt > now && !f.lockedIntoActivityId)
      .sort((a, b) => b.createdAt - a.createdAt),
    [floats, now],
  );
  const expired = useMemo(
    () => floats
      .filter(f => f.expiresAt <= now || f.lockedIntoActivityId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 4),
    [floats, now],
  );

  return (
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      {/* Floating bokeh background — gentle drifting orbs to sell the
          "balloon park" vibe. Pointer-events disabled so they don't
          interfere with taps. */}
      <BackgroundOrbs />

      <div className="relative pt-status-lg pb-3 px-5">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-end justify-between"
        >
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400 inline-flex items-center gap-1">
              <Sparkles size={12} className="text-fuchsia-300" />
              Soft proposals
            </div>
            <h1 className="text-[34px] font-black leading-none mt-1">
              <span className="text-grad">Floats</span>
              <span className="text-white/80 text-base font-medium ml-2">trial balloons</span>
            </h1>
          </div>
          <RefreshButton onRefresh={refreshAll} ariaLabel="Refresh floats" />
        </motion.div>
      </div>

      <div className="relative flex-1 overflow-y-auto no-scrollbar px-4 pb-36">
        {/* Friends rail — personal-nudge surface. Tap an avatar to Wave or
            WUD?, long-press to enter multi-select and nudge a group. Sits
            above the float Composer so the page reads: "people you might
            want to talk to" → "an idea to throw into the air". */}
        <FriendsRail />

        <Composer />

        {active.length > 0 ? (
          <>
            <SectionLabel>In the air · {active.length}</SectionLabel>
            <motion.div layout className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {active.map((f, i) => (
                  <FloatCard
                    key={f.id}
                    float={f}
                    myId={myId}
                    delay={i * 0.05}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          </>
        ) : (
          <EmptyState meName={me.name} />
        )}

        {expired.length > 0 && (
          <>
            <SectionLabel>Recently grounded</SectionLabel>
            <div className="flex flex-col gap-2 opacity-70">
              {expired.map(f => (
                <ExpiredFloatRow key={f.id} float={f} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Background bokeh ─────────────────────────── */

function BackgroundOrbs() {
  // willChange: 'filter' promotes each orb onto its own GPU layer with the
  // blur baked in from the first paint. Without it, browsers paint the
  // unblurred element briefly before the filter kicks in, which read as a
  // bright flash when the page mounted — most visible on the bottom amber
  // orb. Pairing that with an opacity fade-in hides any residual hiccup.
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute -top-20 -left-10 h-64 w-64 rounded-full bg-fuchsia-500/15 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 24, 0], x: [0, 12, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut' },
          y: { duration: 18, repeat: Infinity, ease: 'easeInOut' },
          x: { duration: 18, repeat: Infinity, ease: 'easeInOut' },
        }}
      />
      <motion.div
        className="absolute top-1/3 -right-16 h-72 w-72 rounded-full bg-rose-500/12 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -30, 0], x: [0, -16, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut', delay: 0.05 },
          y: { duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 2 },
          x: { duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 2 },
        }}
      />
      <motion.div
        className="absolute bottom-10 left-1/4 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -18, 0], x: [0, 10, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut', delay: 0.1 },
          y: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 4 },
          x: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 4 },
        }}
      />
    </div>
  );
}

/* ─────────────────────────── Composer ─────────────────────────── */

const PROMPT_PRESETS: { emoji: string; text: string }[] = [
  { emoji: '🏄', text: 'anyone keen for a surf?' },
  { emoji: '☕', text: 'coffee run?' },
  { emoji: '🏃', text: 'evening run?' },
  { emoji: '🍕', text: 'pizza tonight?' },
  { emoji: '🎬', text: 'movie this weekend?' },
  { emoji: '🍷', text: 'drinks after work?' },
];

const TIMINGS: { key: FloatTiming; label: string }[] = [
  { key: 'today',     label: 'Today' },
  { key: 'tomorrow',  label: 'Tomorrow' },
  { key: 'weekend',   label: 'Weekend' },
  { key: 'whenever',  label: 'Whenever' },
];

function Composer() {
  const postFloat = useApp(s => s.postFloat);
  const [emoji, setEmoji] = useState('✨');
  const [question, setQuestion] = useState('');
  const [place, setPlace] = useState('');
  const [timing, setTiming] = useState<FloatTiming | undefined>(undefined);
  const [posting, setPosting] = useState(false);

  const canSend = !!question.trim() && !posting;

  const pickPreset = (p: typeof PROMPT_PRESETS[number]) => {
    setEmoji(p.emoji);
    setQuestion(p.text);
  };

  const send = async () => {
    if (!canSend) return;
    setPosting(true);
    const f = await postFloat({
      question: question.trim(),
      emoji: emoji.trim() || '✨',
      place: place.trim() || undefined,
      timing,
    });
    setPosting(false);
    if (f) {
      // Tiny burst at the send button — quick acknowledgement that the
      // balloon left your hand.
      confetti({
        particleCount: 40, spread: 60, startVelocity: 28,
        scalar: 0.9,
        origin: { x: 0.5, y: 0.3 },
        colors: ['#e879f9', '#fb7185', '#fbbf24', '#ffffff'],
      });
      setQuestion('');
      setEmoji('✨');
      setPlace('');
      setTiming(undefined);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="relative rounded-3xl p-4 mb-5
                 bg-gradient-to-br from-fuchsia-500/15 via-rose-500/10 to-orange-500/10
                 border border-fuchsia-400/25 backdrop-blur-sm"
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-fuchsia-200/90 font-bold flex items-center gap-1.5 mb-2">
        <Sparkles size={11} />
        Float an idea
      </div>

      <div className="flex gap-2 items-stretch">
        <input
          value={emoji}
          onChange={e => {
            const next = Array.from(e.target.value).slice(0, 2).join('');
            setEmoji(next);
          }}
          className="w-14 text-center text-xl bg-white/5 border border-white/10 rounded-2xl py-2.5 text-white
                     focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60"
          aria-label="Float emoji"
        />
        <input
          value={question}
          onChange={e => setQuestion(e.target.value.slice(0, 120))}
          onKeyDown={e => { if (e.key === 'Enter') void send(); }}
          placeholder="anyone keen for a surf?"
          className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 text-white placeholder:text-zinc-500
                     focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60 text-sm"
        />
      </div>

      {/* Optional place */}
      <div className="mt-2 flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2
                      focus-within:ring-2 focus-within:ring-fuchsia-400/60">
        <MapPin size={14} className="text-zinc-400" />
        <input
          value={place}
          onChange={e => setPlace(e.target.value.slice(0, 60))}
          placeholder="where (optional)"
          className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none text-[13px]"
        />
      </div>

      {/* Rough timing chips */}
      <div className="mt-2 flex gap-1.5 overflow-x-auto no-scrollbar">
        {TIMINGS.map(t => {
          const active = timing === t.key;
          return (
            <motion.button
              key={t.key}
              whileTap={{ scale: 0.92 }}
              onClick={() => setTiming(active ? undefined : t.key)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition border
                          ${active
                            ? 'bg-white text-zinc-900 border-white'
                            : 'bg-white/5 text-zinc-300 border-white/10'}`}
            >
              {t.label}
            </motion.button>
          );
        })}
      </div>

      {/* Preset prompts */}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {PROMPT_PRESETS.map(p => {
          const active = p.emoji === emoji && p.text === question;
          return (
            <motion.button
              key={p.text}
              whileTap={{ scale: 0.96 }}
              onClick={() => pickPreset(p)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-2xl text-left text-[12px] border transition
                          ${active
                            ? 'bg-white text-zinc-900 border-white font-semibold'
                            : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
            >
              <span className="text-base">{p.emoji}</span>
              <span className="truncate">{p.text}</span>
            </motion.button>
          );
        })}
      </div>

      <motion.button
        whileTap={canSend ? { scale: 0.97 } : undefined}
        disabled={!canSend}
        onClick={send}
        className={`mt-3 w-full inline-flex items-center justify-center gap-1.5 py-3 rounded-2xl
                    text-sm font-bold tracking-wide
                    ${canSend
                      ? 'bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-500 text-white shadow-[0_18px_40px_-14px_rgba(244,63,94,0.5)]'
                      : 'bg-white/5 text-zinc-500 cursor-not-allowed'}`}
      >
        <Send size={14} />
        {posting ? 'Floating…' : 'Float it'}
      </motion.button>
    </motion.div>
  );
}

/* ─────────────────────────── Float card ─────────────────────────── */

/** Pastel palettes deterministically chosen by float id so each balloon has
 *  a stable, distinct color even as the list re-orders. */
const PALETTES = [
  { from: 'from-fuchsia-500/25', via: 'via-pink-500/15',   to: 'to-rose-500/10',   ring: 'border-fuchsia-400/35' },
  { from: 'from-sky-500/25',     via: 'via-cyan-500/15',   to: 'to-teal-500/10',   ring: 'border-sky-400/35' },
  { from: 'from-amber-500/25',   via: 'via-orange-500/15', to: 'to-rose-500/10',   ring: 'border-amber-400/35' },
  { from: 'from-emerald-500/25', via: 'via-teal-500/15',   to: 'to-cyan-500/10',   ring: 'border-emerald-400/35' },
  { from: 'from-violet-500/25',  via: 'via-purple-500/15', to: 'to-fuchsia-500/10', ring: 'border-violet-400/35' },
] as const;

function paletteFor(id: string): typeof PALETTES[number] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(h) % PALETTES.length];
}

function FloatCard({ float: f, myId, delay }: { float: Float; myId: string; delay: number }) {
  const respondToFloat = useApp(s => s.respondToFloat);
  const removeFloat = useApp(s => s.removeFloat);
  const setLockingFloatId = useApp(s => s.setLockingFloatId);
  const userById = useApp(s => s.userById);

  const isMine = f.senderId === myId;
  const myResponse = f.responses.find(r => r.userId === myId)?.state;
  const palette = paletteFor(f.id);
  const sender = userById(f.senderId);

  const tally = useMemo(() => {
    let keen = 0, maybe = 0, nah = 0;
    for (const r of f.responses) {
      if (r.state === 'keen')  keen++;
      else if (r.state === 'maybe') maybe++;
      else nah++;
    }
    return { keen, maybe, nah };
  }, [f.responses]);

  const keenUsers = useMemo(
    () => f.responses.filter(r => r.state === 'keen').map(r => userById(r.userId)),
    [f.responses, userById],
  );

  const expiresInMs = f.expiresAt - Date.now();
  const expiresLabel = formatExpiresIn(expiresInMs);

  const respond = (state: FloatResponseState) => {
    respondToFloat(f.id, state);
    if (state === 'keen' && myResponse !== 'keen') {
      // Mini burst over the keen button area — sells the "you're in" moment.
      confetti({
        particleCount: 24, spread: 50, startVelocity: 22, scalar: 0.7,
        origin: { x: 0.25, y: 0.6 },
        colors: ['#34d399', '#10b981', '#a7f3d0'],
      });
    }
  };

  return (
    <motion.div
      layout
      // Entrance: rises in from below like a balloon released. Idle: gentle bob.
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -80, scale: 0.85, transition: { duration: 0.5 } }}
      transition={{ type: 'spring', stiffness: 220, damping: 22, delay }}
      className="relative"
    >
      <motion.div
        // Gentle continuous float. Independent rotation so it doesn't look mechanical.
        animate={{ y: [0, -4, 0, 2, 0], rotate: [0, 0.3, 0, -0.3, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className={`relative rounded-3xl p-4 border bg-gradient-to-br ${palette.from} ${palette.via} ${palette.to} ${palette.ring}
                    shadow-[0_22px_50px_-24px_rgba(0,0,0,0.6)] backdrop-blur-sm`}
      >
        {/* Decorative emoji + question */}
        <div className="flex items-start gap-3">
          <div className="text-3xl drop-shadow select-none leading-none mt-0.5">
            {f.emoji ?? '✨'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-[15px] font-semibold leading-snug">
              {f.question}
            </div>
            <div className="text-[11px] text-white/70 mt-1 flex items-center gap-1.5 flex-wrap">
              <Avatar user={sender} size={14} />
              <span className="font-semibold text-white/90">{isMine ? 'You' : sender.name}</span>
              {f.timing && (
                <>
                  <span className="text-white/40">·</span>
                  <span>{timingLabel(f.timing)}</span>
                </>
              )}
              {f.place && (
                <>
                  <span className="text-white/40">·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin size={10} /> {f.place}
                  </span>
                </>
              )}
              <span className="text-white/40">·</span>
              <span className="inline-flex items-center gap-0.5 text-white/70">
                <Timer size={10} /> {expiresLabel}
              </span>
            </div>
          </div>

          {isMine && (
            <button
              onClick={() => {
                if (confirm('Pop this float?')) removeFloat(f.id);
              }}
              aria-label="Delete float"
              className="text-white/60 hover:text-white/90 h-7 w-7 grid place-items-center rounded-full hover:bg-white/10"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>

        {/* Tally bar */}
        <div className="mt-3 flex items-center gap-2">
          {keenUsers.length > 0 && (
            <AvatarStack users={keenUsers} size={20} max={4} />
          )}
          <div className="flex-1 text-[11px] text-white/80 font-semibold flex items-center gap-2">
            <span className="text-emerald-300">{tally.keen} keen</span>
            <span className="text-white/30">·</span>
            <span className="text-amber-200">{tally.maybe} maybe</span>
            <span className="text-white/30">·</span>
            <span className="text-white/50">{tally.nah} nah</span>
          </div>
        </div>

        {/* Response buttons (recipients) OR Lock-in CTA (sender) */}
        {isMine ? (
          <motion.button
            whileTap={tally.keen > 0 ? { scale: 0.97 } : undefined}
            disabled={tally.keen === 0}
            onClick={() => setLockingFloatId(f.id)}
            className={`mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-2xl
                        text-sm font-bold transition
                        ${tally.keen > 0
                          ? 'bg-white text-zinc-900 shadow-[0_8px_24px_-12px_rgba(255,255,255,0.7)] hover:bg-zinc-100'
                          : 'bg-white/10 text-white/50 cursor-not-allowed'}`}
          >
            {tally.keen > 0 ? `Lock it in (${tally.keen} keen)` : 'Waiting for keen votes…'}
            {tally.keen > 0 && <ChevronRight size={14} />}
          </motion.button>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <ResponsePill label="Keen"  emoji="🙋" state="keen"  current={myResponse} onTap={() => respond('keen')} />
            <ResponsePill label="Maybe" emoji="🤔" state="maybe" current={myResponse} onTap={() => respond('maybe')} />
            <ResponsePill label="Nah"   emoji="❌" state="nah"   current={myResponse} onTap={() => respond('nah')} />
          </div>
        )}

        {/* Hanging string — purely decorative balloon vibe */}
        <div aria-hidden className="absolute left-8 -bottom-3 w-px h-3 bg-white/15" />
      </motion.div>
    </motion.div>
  );
}

function ResponsePill({
  label, emoji, state, current, onTap,
}: {
  label: string;
  emoji: string;
  state: FloatResponseState;
  current?: FloatResponseState;
  onTap: () => void;
}) {
  const active = current === state;
  const tones: Record<FloatResponseState, string> = {
    keen:  'from-emerald-500 to-teal-600 border-emerald-400 text-white',
    maybe: 'from-amber-400 to-orange-500 border-amber-400 text-white',
    nah:   'from-zinc-500 to-zinc-700 border-zinc-400 text-white',
  };
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onTap}
      className={`inline-flex flex-col items-center gap-0.5 py-2 rounded-2xl text-[12px] font-bold border transition
                  ${active
                    ? `bg-gradient-to-br ${tones[state]} shadow-[0_6px_20px_-8px_rgba(0,0,0,0.6)]`
                    : 'bg-white/10 text-white/85 border-white/10 hover:bg-white/15'}`}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active && <Check size={11} strokeWidth={3} />}
      </span>
    </motion.button>
  );
}

/* ─────────────────────────── Expired row ─────────────────────────── */

function ExpiredFloatRow({ float: f }: { float: Float }) {
  const userById = useApp(s => s.userById);
  const sender = userById(f.senderId);
  const keen = f.responses.filter(r => r.state === 'keen').length;
  const locked = !!f.lockedIntoActivityId;
  const openActivity = useApp(s => s.openActivity);

  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={() => { if (locked) openActivity(f.lockedIntoActivityId!); }}
      className="w-full text-left p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-3"
    >
      <div className="text-xl select-none">{f.emoji ?? '✨'}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-white/80 font-medium truncate">{f.question}</div>
        <div className="text-[11px] text-zinc-500 truncate">
          {sender.name} · {locked ? 'locked in 🎉' : `${keen} keen · expired`}
        </div>
      </div>
      {locked && <ChevronRight size={14} className="text-zinc-400" />}
    </motion.button>
  );
}

/* ─────────────────────────── Empty + helpers ─────────────────────────── */

function EmptyState({ meName }: { meName: string }) {
  return (
    <div className="text-center mt-12 pb-4">
      <motion.div
        animate={{ y: [0, -8, 0], rotate: [0, 4, 0, -4, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="text-6xl"
      >
        🎈
      </motion.div>
      <div className="text-white font-semibold mt-3">Nothing in the air, {meName}</div>
      <div className="text-sm text-zinc-400 mt-1 max-w-[280px] mx-auto">
        Float a soft proposal — "anyone keen for ___?" — and see who's in before you commit to a plan.
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold mt-4 mb-2 px-1 inline-flex items-center gap-1.5">
      <Sparkles size={11} className="text-fuchsia-300" />
      {children}
    </div>
  );
}

function timingLabel(t: FloatTiming): string {
  switch (t) {
    case 'today':    return 'Today';
    case 'tomorrow': return 'Tomorrow';
    case 'weekend':  return 'This weekend';
    case 'whenever': return 'Whenever';
  }
}

function formatExpiresIn(ms: number): string {
  if (ms <= 0) return 'popped';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h left` : `${Math.floor(h / 24)}d left`;
}
