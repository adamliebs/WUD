import { motion } from 'framer-motion';
import { MapPin, Radio, UserCheck, UserX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { PulseButton } from '../components/PulseButton';
import { isLive, useApp } from '../store';

const PRESETS: { emoji: string; text: string }[] = [
  { emoji: '🏋️', text: 'at the gym' },
  { emoji: '🏃', text: 'on a run' },
  { emoji: '☕', text: 'coffee' },
  { emoji: '🍔', text: 'grabbing food' },
  { emoji: '🎮', text: 'gaming' },
  { emoji: '📚', text: 'studying / heads-down' },
  { emoji: '🏖️', text: 'at the beach' },
  { emoji: '🛋️', text: 'just chilling' },
  { emoji: '🛏️', text: 'napping — do not ping' },
];

const DURATIONS = [
  { mins: 60,  label: '1h' },
  { mins: 120, label: '2h' },
  { mins: 240, label: '4h' },
];

export function GoLiveSheet() {
  const open = useApp(s => s.showGoLiveSheet);
  const close = useApp(s => s.setShowGoLiveSheet);
  const me = useApp(s => s.me());
  const setLive = useApp(s => s.setLiveStatus);
  const clearLive = useApp(s => s.clearLiveStatus);

  const currentlyLive = isLive(me);
  const [emoji, setEmoji] = useState('✨');
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [openToJoin, setOpenToJoin] = useState(false);
  const [durationMins, setDurationMins] = useState(120);

  // When opening the sheet, seed from current status if any.
  useEffect(() => {
    if (open && currentlyLive && me.liveStatus) {
      setEmoji(me.liveStatus.emoji);
      setText(me.liveStatus.text);
      setPlace(me.liveStatus.place ?? '');
      setOpenToJoin(!!me.liveStatus.openToJoin);
    } else if (open && !currentlyLive) {
      setEmoji('✨');
      setText('');
      setPlace('');
      setOpenToJoin(false);
      setDurationMins(120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pickPreset = (p: { emoji: string; text: string }) => {
    setEmoji(p.emoji);
    setText(p.text);
  };

  const go = () => {
    if (!text.trim()) return;
    setLive({ emoji, text, durationMins, place, openToJoin });
  };

  return (
    <BottomSheet open={open} onClose={() => close(false)} size="tall">
      <div className="h-full flex flex-col">
        {/* Hero */}
        <div className="relative mx-4 mt-2 overflow-hidden rounded-2xl h-24
                        bg-gradient-to-br from-rose-500 via-pink-500 to-orange-500">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
          <div className="absolute inset-0 flex items-center justify-between px-5">
            <div>
              <div className="text-white/85 text-xs uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <Radio size={12} />
                {currentlyLive ? 'You\'re live' : 'Go live'}
              </div>
              <div className="text-white text-2xl font-black leading-tight mt-0.5">
                {currentlyLive ? 'Update what you\'re doing' : 'What are you doing now?'}
              </div>
            </div>
            <motion.div
              key={emoji}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              className="text-5xl drop-shadow"
            >
              {emoji}
            </motion.div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-36">
          {/* Quick presets */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-1">
            Quick picks
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map(p => {
              const active = p.emoji === emoji && p.text === text;
              return (
                <motion.button
                  key={p.text}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => pickPreset(p)}
                  className={`p-3 rounded-2xl border text-left transition
                              ${active
                                ? 'bg-white text-zinc-900 border-white'
                                : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}
                >
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="text-sm font-semibold mt-1">{p.text}</div>
                </motion.button>
              );
            })}
          </div>

          {/* Custom */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
            Or write your own
          </div>
          <div className="flex gap-2 items-stretch">
            <input
              value={emoji}
              onChange={e => {
                const next = Array.from(e.target.value).slice(0, 4).join('');
                setEmoji(next);
              }}
              className="w-16 text-center text-2xl bg-white/5 border border-white/10 rounded-2xl py-3 text-white
                         focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
              aria-label="Status emoji"
            />
            <input
              value={text}
              onChange={e => setText(e.target.value.slice(0, 60))}
              placeholder="What are you up to?"
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
            />
          </div>

          {/* Where (optional) */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
            Where (optional)
          </div>
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3
                          focus-within:ring-2 focus-within:ring-rose-400/60 focus-within:border-rose-400/30">
            <MapPin size={16} className="text-zinc-400" />
            <input
              value={place}
              onChange={e => setPlace(e.target.value.slice(0, 60))}
              placeholder="e.g. Equinox SoHo"
              className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none text-sm"
            />
          </div>

          {/* Open to join? */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
            Open to join?
          </div>
          <div className="grid grid-cols-2 gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setOpenToJoin(true)}
              className={`p-3 rounded-2xl border text-left transition
                          ${openToJoin
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-400 shadow-[0_10px_30px_-12px_rgba(16,185,129,0.55)]'
                            : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
            >
              <div className="flex items-center gap-2">
                <UserCheck size={16} />
                <span className="text-sm font-bold">Yes — come join</span>
              </div>
              <div className={`text-[11px] mt-1 ${openToJoin ? 'text-white/85' : 'text-zinc-400'}`}>
                Friends are invited to pull up.
              </div>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setOpenToJoin(false)}
              className={`p-3 rounded-2xl border text-left transition
                          ${!openToJoin
                            ? 'bg-white text-zinc-900 border-white'
                            : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
            >
              <div className="flex items-center gap-2">
                <UserX size={16} />
                <span className="text-sm font-bold">Just sharing</span>
              </div>
              <div className={`text-[11px] mt-1 ${!openToJoin ? 'text-zinc-600' : 'text-zinc-400'}`}>
                Heads-down — no need to pull up.
              </div>
            </motion.button>
          </div>

          {/* Duration */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
            Visible for
          </div>
          <div className="flex gap-2">
            {DURATIONS.map(d => {
              const active = durationMins === d.mins;
              return (
                <motion.button
                  key={d.mins}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setDurationMins(d.mins)}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-bold border transition
                              ${active
                                ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400 shadow-[0_10px_30px_-12px_rgba(244,63,94,0.6)]'
                                : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                >
                  {d.label}
                </motion.button>
              );
            })}
          </div>
          <div className="text-[11px] text-zinc-500 mt-2 px-1">
            Auto-clears after this window. Your scheduled plans are unaffected.
          </div>
        </div>

        {/* Sticky bottom actions */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent flex gap-2">
          {currentlyLive && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => clearLive()}
              className="px-4 py-3.5 rounded-2xl font-bold text-rose-200 bg-rose-500/15 border border-rose-400/30
                         inline-flex items-center gap-2"
            >
              <X size={16} />
              End
            </motion.button>
          )}
          <div className="flex-1">
            <PulseButton onClick={go} disabled={!text.trim()}>
              {currentlyLive ? 'Update status' : 'Go live'}
            </PulseButton>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
