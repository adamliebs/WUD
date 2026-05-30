import { motion } from 'framer-motion';
import { Clock, MapPin, Radio, UserCheck, UserX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { BottomSheet } from '../components/BottomSheet';
import { useApp } from '../store';

/**
 * Go Live — a streamlined activity creator for "I'm doing this RIGHT NOW."
 *
 * It posts a real activity (same model the feed + plans use) with
 * startsAt = now and endsAt picked via the duration chips. The point of
 * this separate sheet vs. the full PostSheet is reduced friction: no
 * category picker, no scheduling, no recurrence — just "what's happening
 * + how long + who can join."
 *
 * Layout matches the new PostSheet pattern: top header bar with the
 * primary action on the right, a live PreviewCard at the top of the
 * scroll so the user sees what their live card will look like, and the
 * form fields underneath. No old colored hero, no sticky bottom CTA.
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
  const me = useApp(s => s.me());

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
  const submitDisabled = !text.trim() || audienceEmpty;

  const go = () => {
    if (submitDisabled) return;
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

  // Preview duration label — drives the "→ HH:MM" line in the PreviewCard.
  const previewEndDate = new Date(Date.now() + durationMins * 60_000);
  const endTimeLabel = previewEndDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <BottomSheet open={open} onClose={() => close(false)} size="tall">
      <div className="h-full flex flex-col">
        {/* Sticky header — X close, "Going live" title, Go action on the
            right. Matches the PostSheet shell so both creation flows share
            the same chrome. */}
        <div className="px-3 pt-1 pb-3 flex items-center justify-between border-b border-white/5">
          <button
            onClick={() => close(false)}
            className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-zinc-300 hover:bg-white/5"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <div className="text-base font-bold text-white truncate px-2 inline-flex items-center gap-1.5">
            <Radio size={14} className="text-rose-400" />
            Going live
          </div>
          <motion.button
            whileTap={!submitDisabled ? { scale: 0.94 } : undefined}
            onClick={go}
            disabled={submitDisabled}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition
                        ${submitDisabled
                          ? 'bg-white/5 text-zinc-500 cursor-not-allowed'
                          : 'bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-[0_10px_24px_-10px_rgba(251,146,60,0.6)]'}`}
          >
            Go
          </motion.button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-0 pb-12">
          {/* Live preview — sticky at the top so the user always sees what
              they're about to broadcast as they fill the form. Opaque sheet-
              colored bg closes the gap to the header so scrolled content
              never peeks through. */}
          <div className="sticky -top-px -mx-4 px-4 pt-3 pb-3 z-20 glass-strong border-0 border-b border-white/5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-bold mb-1.5 px-1">
              Preview
            </div>
            <LivePreviewCard
              emoji={emoji}
              text={text}
              place={place}
              endTimeLabel={endTimeLabel}
              hostName={me.name}
              hostAvatar={me.avatar}
              hostColor={me.color}
            />
          </div>

          {/* Quick picks — horizontal scroll so the row stays one line and
              the user can see what comes after the visible chips. */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
            Quick picks
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
            {PRESETS.map(p => {
              const active = p.emoji === emoji && p.text === text;
              return (
                <motion.button
                  key={p.text}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => pickPreset(p)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border transition
                              ${active
                                ? 'bg-white text-zinc-900 border-white'
                                : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                >
                  <span>{p.emoji}</span>
                  <span>{p.text}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Status — single combined emoji + text row. Larger input height
              than the old composer so it reads as the primary field, not
              just another row in the form. */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
            What's the status?
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

          {/* Where — optional */}
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

          {/* Duration */}
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

          {/* Audience — same model as PostSheet (All friends switch + squad
              chips). Two-card switcher kept here because Go Live is a "fire
              and forget" surface — wrong audience is high-stakes (you'd
              broadcast to the wrong group) so it deserves prominence. */}
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
      </div>
    </BottomSheet>
  );
}

/**
 * Live preview of the going-live card the user is about to broadcast.
 * Mirrors the visual language of ActivityCard but specifically for the
 * LIVE state: rose-orange header band with a pulsing LIVE pill, the user's
 * emoji + status text as the title, host avatar floating, and a footer
 * line showing "now → endTime" so the user can confirm the duration.
 */
function LivePreviewCard({
  emoji, text, place, endTimeLabel, hostName, hostAvatar, hostColor,
}: {
  emoji: string;
  text: string;
  place: string;
  endTimeLabel: string;
  hostName: string;
  hostAvatar: string;
  hostColor: string;
}) {
  const displayedText = text.trim() || 'What are you doing now?';
  return (
    <div className="relative overflow-hidden rounded-3xl glass border border-white/10
                    shadow-[0_18px_40px_-22px_rgba(0,0,0,0.65)]">
      <div className="relative h-20 bg-gradient-to-br from-orange-500 to-rose-500">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        <div className="absolute top-2.5 left-3 flex items-center gap-1.5">
          <span className="text-lg drop-shadow">{emoji.trim() || '✨'}</span>
          <span className="text-white/95 text-[10px] font-bold uppercase tracking-widest">
            Going live
          </span>
        </div>
        <div className="absolute top-2.5 right-3 inline-flex items-center gap-1.5 text-white text-[9px] font-bold uppercase tracking-widest bg-rose-500/85 backdrop-blur px-2 py-0.5 rounded-full">
          <motion.span
            animate={{ opacity: [1, 0.2, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            className="inline-block w-1.5 h-1.5 rounded-full bg-white"
          />
          Live
        </div>
        <div className="absolute -bottom-5 left-3">
          <div
            className={`h-12 w-12 rounded-full grid place-items-center text-xl ring-4 ring-[#15121b]
                        bg-gradient-to-br ${hostColor}`}
          >
            {hostAvatar}
          </div>
        </div>
      </div>
      <div className="px-3 pt-7 pb-3">
        <div className={`text-sm font-semibold leading-tight truncate ${text.trim() ? 'text-white' : 'text-zinc-500'}`}>
          {displayedText}
        </div>
        <div className="text-zinc-400 text-[11px] mt-0.5 truncate">
          <span className="text-zinc-200 font-medium">{hostName}</span>
          {' · live now'}
        </div>
        <div className="flex items-center gap-3 mt-2 text-zinc-300 text-[11px]">
          <span className="inline-flex items-center gap-1 min-w-0">
            <Clock size={11} className="text-zinc-500 shrink-0" />
            <span className="truncate">Now → {endTimeLabel}</span>
          </span>
          {place.trim() && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <MapPin size={11} className="text-zinc-500 shrink-0" />
              <span className="truncate">{place.trim()}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
