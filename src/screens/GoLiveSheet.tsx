import { motion } from 'framer-motion';
import { MapPin, Radio, UserCheck, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { BottomSheet } from '../components/BottomSheet';
import { PulseButton } from '../components/PulseButton';
import { useApp } from '../store';

/**
 * Go Live — a streamlined activity creator for "I'm doing this RIGHT NOW."
 *
 * It posts a real activity (same model the feed + plans use) with
 * startsAt = now and endsAt picked via the duration chips. The point of
 * this separate sheet vs. the full PostSheet is reduced friction: no
 * category picker, no scheduling, no recurrence — just a quick "what's
 * happening + how long + who can join."
 *
 * Category is 'custom' under the hood so the user's emoji + label drive
 * the visual treatment in the live strip / activity card.
 */

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
  { mins: 480, label: '8h' },
];

export function GoLiveSheet() {
  const open = useApp(s => s.showGoLiveSheet);
  const close = useApp(s => s.setShowGoLiveSheet);
  const postActivity = useApp(s => s.postActivity);
  // Same audience model as PostSheet — pick any combination of squads, plus
  // an "all friends" open-invite switch.
  const squads = useApp(useShallow(s =>
    s.squads.filter(sq => sq.hostId === s.meId || sq.memberIds.includes(s.meId))
  ));

  const [emoji, setEmoji] = useState('✨');
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [openToJoin, setOpenToJoin] = useState(true);
  const [durationMins, setDurationMins] = useState(120);
  const [selectedSquadIds, setSelectedSquadIds] = useState<string[]>([]);

  // Reset on open so a previously-aborted live doesn't bleed in.
  useEffect(() => {
    if (open) {
      setEmoji('✨'); setText(''); setPlace('');
      setOpenToJoin(true); setDurationMins(120);
      setSelectedSquadIds([]);
    }
  }, [open]);

  const pickPreset = (p: { emoji: string; text: string }) => {
    setEmoji(p.emoji);
    setText(p.text);
  };

  const toggleSquad = (id: string) =>
    setSelectedSquadIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );

  const audienceEmpty = !openToJoin && selectedSquadIds.length === 0;

  const go = () => {
    if (!text.trim() || audienceEmpty) return;
    const startsAt = Date.now();
    const endsAt = startsAt + durationMins * 60_000;
    // category='custom' lets the user's emoji + label drive the visual
    // category in the strip + card without making the user pick from the
    // CATEGORIES list. Title falls back to the user's text.
    postActivity({
      category: 'custom',
      customEmoji: emoji.trim() || '✨',
      customLabel: text.trim(),
      title: text.trim(),
      place: place.trim(),
      description: '',
      startsAt,
      endsAt,
      isPrivate: false,
      isOpenInvite: openToJoin,
      squadIds: selectedSquadIds,
    });
    close(false);
  };

  return (
    <BottomSheet open={open} onClose={() => close(false)} size="tall">
      <div className="h-full flex flex-col">
        {/* Hero — same gradient/radio vibe as the previous live status sheet
            so muscle memory carries over. */}
        <div className="relative mx-4 mt-2 overflow-hidden rounded-2xl h-24
                        bg-gradient-to-br from-rose-500 via-pink-500 to-orange-500">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
          <div className="absolute inset-0 flex items-center justify-between px-5">
            <div>
              <div className="text-white/85 text-xs uppercase tracking-widest font-semibold flex items-center gap-1.5">
                <Radio size={12} />
                Go live
              </div>
              <div className="text-white text-2xl font-black leading-tight mt-0.5">
                What are you doing now?
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

          {/* Duration — drives endsAt. */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
            How long?
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

          {/* Audience — all-friends switch + per-squad toggles. */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
            Who can see + join?
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
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
                <span className="text-sm font-bold">All friends</span>
              </div>
              <div className={`text-[11px] mt-1 ${openToJoin ? 'text-white/85' : 'text-zinc-400'}`}>
                Anyone you're friends with can join.
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
                <span className="text-sm font-bold">Squads only</span>
              </div>
              <div className={`text-[11px] mt-1 ${!openToJoin ? 'text-zinc-600' : 'text-zinc-400'}`}>
                Pick specific squads below.
              </div>
            </motion.button>
          </div>

          {/* Squad chips — optional. Picking some narrows the audience when
              "Squads only" is selected, or piggybacks on "All friends" so
              the activity shows in those squads' Plans tabs too. */}
          {squads.length > 0 && (
            <div className="mt-1">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-1.5 px-1">
                Squads (optional)
              </div>
              <div className="flex flex-wrap gap-2">
                {squads.map(sq => {
                  const picked = selectedSquadIds.includes(sq.id);
                  return (
                    <motion.button
                      key={sq.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleSquad(sq.id)}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-semibold border transition
                                  ${picked
                                    ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400'
                                    : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                    >
                      <span className="mr-1">{sq.emoji}</span>
                      {sq.name}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {audienceEmpty && (
            <div className="text-[11px] text-rose-300 mt-3 px-1">
              Pick at least one squad — or switch back to All friends.
            </div>
          )}
        </div>

        {/* Sticky go button */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <PulseButton onClick={go} disabled={!text.trim() || audienceEmpty}>
            Go live
          </PulseButton>
        </div>
      </div>
    </BottomSheet>
  );
}
