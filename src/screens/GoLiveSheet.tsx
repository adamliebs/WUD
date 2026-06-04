import { motion } from 'framer-motion';
import { Globe2, Lock, MapPin, Radio, X } from 'lucide-react';
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

  const [emoji, setEmoji] = useState('✨');
  const [text, setText] = useState('');
  const [place, setPlace] = useState('');
  const [openToJoin, setOpenToJoin] = useState(true);
  // Visibility — mirrors PostSheet / EditActivitySheet. Previously hardcoded
  // to public, which silently broadcast every Go Live to friends-of-friends.
  const [isPrivate, setIsPrivate] = useState(false);
  const [durationMins, setDurationMins] = useState(120);
  const [selectedSquadIds, setSelectedSquadIds] = useState<string[]>([]);

  // Reset on open so a previously-aborted live doesn't bleed in.
  useEffect(() => {
    if (open) {
      setEmoji('✨'); setText(''); setPlace('');
      setOpenToJoin(true); setIsPrivate(false); setDurationMins(120);
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
      // isPrivate is only meaningful for All-friends posts (squad-only is
      // private by construction).
      isPrivate: openToJoin ? isPrivate : false,
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

        {/* Slim "going live" banner — sits OUTSIDE the scroll container so
            a downward swipe on it dismisses the whole sheet (matches the
            PostSheet pattern). Without this, the scroll view's iOS
            overscroll bounce eats the gesture and the user can't flick
            the sheet away from its most natural target. */}
        <div className="px-4 pt-3 pb-3">
          <LiveBanner emoji={emoji} text={text} endTimeLabel={endTimeLabel} />
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-12">
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

          {/* Audience — same shape as PostSheet / EditActivitySheet so the
              two creation flows feel like the same form. Two-card switcher
              (All friends / Squads only) followed by either the squad
              picker or the visibility section. Wrong audience here is
              high-stakes (Go Live = "I'm doing this NOW"), so it deserves
              prominence. */}
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
            Who can see + join?
          </div>
          <div className="grid grid-cols-2 gap-2">
            <motion.button
              whileTap={{ scale: 0.96 }}
              // Picking All friends keeps any tagged squads — they ride
              // along as an additional tag (the activity appears in those
              // squad screens too). Matches PostSheet / EditActivitySheet.
              onClick={() => setOpenToJoin(true)}
              className={`p-3 rounded-2xl border text-left transition
                          ${openToJoin
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-400'
                            : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
            >
              <div className="text-sm font-bold">All friends</div>
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
              <div className="text-sm font-bold">Squads only</div>
              <div className={`text-[11px] mt-1 ${!openToJoin ? 'text-zinc-600' : 'text-zinc-400'}`}>
                Pick specific squads below.
              </div>
            </motion.button>
          </div>

          {/* Visibility — only when All friends. Previously hardcoded to
              public so every Go Live silently surfaced to friends-of-
              friends; now an explicit pick like the other two creation
              flows. */}
          {openToJoin && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold mb-2 px-1">
                {isPrivate
                  ? <><Lock size={11} className="inline -mt-0.5 mr-1" />Visibility</>
                  : <><Globe2 size={11} className="inline -mt-0.5 mr-1" />Visibility</>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setIsPrivate(false)}
                  className={`p-3 rounded-2xl border text-left transition
                              ${!isPrivate
                                ? 'bg-gradient-to-br from-sky-500 to-blue-600 text-white border-sky-400'
                                : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                >
                  <div className="text-sm font-bold">Public</div>
                  <div className={`text-[11px] mt-1 ${!isPrivate ? 'text-white/85' : 'text-zinc-400'}`}>
                    Friends-of-friends can see it once a friend joins.
                  </div>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => setIsPrivate(true)}
                  className={`p-3 rounded-2xl border text-left transition
                              ${isPrivate
                                ? 'bg-white text-zinc-900 border-white'
                                : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                >
                  <div className="text-sm font-bold">Private</div>
                  <div className={`text-[11px] mt-1 ${isPrivate ? 'text-zinc-600' : 'text-zinc-400'}`}>
                    Only direct friends can see it.
                  </div>
                </motion.button>
              </div>
            </div>
          )}

          {/* Squad pills — always shown when the user has squads. With
              All friends they're an optional tag; with Squads only they
              gate who can see the live. Matches PostSheet /
              EditActivitySheet. */}
          {squads.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-1">
                {openToJoin ? 'Squads (optional)' : 'Pick squads'}
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
          {!openToJoin && squads.length === 0 && (
            <div className="text-[11px] text-zinc-500 mt-3 px-1">
              No squads to tag yet — make one from Profile → Squads.
            </div>
          )}
          {audienceEmpty && (
            <div className="text-[11px] text-amber-300 mt-3 px-1">
              Pick at least one squad — or switch back to All friends.
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

/**
 * Slim "going live" banner — orange→rose strip with the user's current
 * emoji + status text and a pulsing LIVE pill. Replaces the bigger live
 * preview card so the sheet has more room for the form, while still tying
 * the sheet visually to the floating + button the user tapped.
 */
function LiveBanner({
  emoji, text, endTimeLabel,
}: {
  emoji: string;
  text: string;
  endTimeLabel: string;
}) {
  const displayedText = text.trim() || 'What are you doing now?';
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10
                    shadow-[0_18px_40px_-22px_rgba(0,0,0,0.6)]
                    bg-gradient-to-br from-orange-500 to-rose-500">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
      <div className="relative px-4 py-3 flex items-center gap-3">
        <span className="text-3xl drop-shadow shrink-0">{emoji.trim() || '✨'}</span>
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-1.5 text-white/95 text-[10px] uppercase tracking-[0.18em] font-bold">
            <motion.span
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-block w-1.5 h-1.5 rounded-full bg-white"
            />
            Going live · Now → {endTimeLabel}
          </div>
          <div className={`text-base font-bold leading-tight truncate mt-0.5 ${text.trim() ? 'text-white' : 'text-white/70'}`}>
            {displayedText}
          </div>
        </div>
      </div>
    </div>
  );
}
