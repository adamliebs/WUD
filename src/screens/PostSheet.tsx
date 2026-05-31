import { AnimatePresence, motion } from 'framer-motion';
import {
  Calendar, Camera, ChevronDown, Clock, Globe2, Loader2, Lock,
  Radio, Sparkles, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CATEGORIES, CUSTOM_GRADIENT } from '../data/categories';
import { BottomSheet } from '../components/BottomSheet';
import { uploadApi } from '../api/endpoints';
import { mediaUrl } from '../api/client';
import { useApp, recurrenceLabel } from '../store';
import type { CategoryKey, Recurrence } from '../types';

function nextQuarterTime(): string {
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildDayOptions() {
  const out: { offset: number; label: string; weekday: string; day: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const weekday = d.toLocaleDateString([], { weekday: 'short' });
    const label =
      i === 0 ? 'Today' :
      i === 1 ? 'Tomorrow' :
      weekday;
    out.push({ offset: i, label, weekday, day: d.getDate() });
  }
  return out;
}

function computeStartsAt(dayOffset: number, time: string): number {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function formatStartsAt(dayOffset: number, time: string): string {
  const ms = computeStartsAt(dayOffset, time);
  const d = new Date(ms);
  const dayPart =
    dayOffset === 0 ? 'Today' :
    dayOffset === 1 ? 'Tomorrow' :
    d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dayPart} · ${timePart}`;
}

export function PostSheet() {
  const open = useApp(s => s.showPostSheet);
  const close = useApp(s => s.setShowPostSheet);
  const post = useApp(s => s.postActivity);
  const pushToast = useApp(s => s.pushToast);

  const [category, setCategory] = useState<CategoryKey>('coffee');
  const [customEmoji, setCustomEmoji] = useState('');
  const [customLabel, setCustomLabel] = useState('');
  const [title, setTitle] = useState('');
  const [place, setPlace] = useState('');
  const [description, setDescription] = useState('');
  // Two-mode time picker:
  //   'now'      — activity is happening RIGHT NOW; user picks a duration chip
  //                and the start time is `Date.now()` at submit. Renders a
  //                glowing GO LIVE indicator instead of a date picker.
  //   'scheduled'— traditional pick-a-day-and-time, plus a duration chip
  //                (or "Custom" end date+time) for the window.
  // Default = scheduled; if the user wants a live event the lighter
  // GoLiveSheet is the dedicated shortcut.
  const [timeMode, setTimeMode] = useState<'now' | 'scheduled'>('scheduled');
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [time, setTime] = useState<string>(nextQuarterTime());
  // Duration in minutes. Drives endsAt in BOTH modes by default; "Custom" in
  // scheduled mode flips to an explicit end day+time picker (customEnd state).
  const [durationMins, setDurationMins] = useState<number>(120);
  const [customEnd, setCustomEnd] = useState<{ dayOffset: number; time: string } | null>(null);
  const [maxSize, setMaxSize] = useState<number | undefined>(undefined);
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [bannerUrl, setBannerUrl] = useState<string | undefined>(undefined);
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined);
  // Multi-select audience: "All friends" toggle (openInvite) + any number of squads.
  const [openInvite, setOpenInvite] = useState<boolean>(true);
  const [selectedSquadIds, setSelectedSquadIds] = useState<string[]>([]);
  // Only squads I'm in (host or member) can be targeted.
  const squads = useApp(useShallow(s =>
    s.squads.filter(sq => sq.hostId === s.meId || sq.memberIds.includes(s.meId))
  ));
  const [bannerUploading, setBannerUploading] = useState(false);
  // Controls the "More options" collapse below the primary fields.
  const [moreOpen, setMoreOpen] = useState(false);

  const onPickBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBannerUploading(true);
    try {
      const { url } = await uploadApi.photo(file);
      setBannerUrl(url);
    } catch {
      pushToast('Could not upload that photo', 'warn');
    } finally {
      setBannerUploading(false);
    }
  };

  const removeBanner = () => setBannerUrl(undefined);

  const days = useMemo(buildDayOptions, []);
  const isCustom = category === 'custom';
  // Resolve the displayed category — uses the live custom inputs in preview.
  const cat = isCustom
    ? {
        key: 'custom' as const,
        label: customLabel.trim() || 'Custom',
        emoji: customEmoji.trim() || '✨',
        gradient: CUSTOM_GRADIENT,
      }
    : CATEGORIES.find(c => c.key === category)!;
  // For 'now' mode, both the start-of-window and recurrence-weekday hint
  // come from "today, now". For 'scheduled' mode the chosen pickers drive
  // them — same as before.
  const startsAt = timeMode === 'now'
    ? Date.now()
    : computeStartsAt(dayOffset, time);
  const startsAtLabel = timeMode === 'now'
    ? 'Starting now'
    : formatStartsAt(dayOffset, time);

  // Reset on open (not on submit) so the user's last selection stays visible
  // through the sheet's close animation instead of flashing back to defaults
  // before sliding away. Mirrors the GoLiveSheet pattern.
  useEffect(() => {
    if (!open) return;
    setCategory('coffee'); setCustomEmoji(''); setCustomLabel('');
    setTitle(''); setPlace(''); setDescription('');
    setTimeMode('scheduled');
    setDayOffset(0); setTime(nextQuarterTime());
    setDurationMins(120); setCustomEnd(null);
    setMaxSize(undefined);
    setIsPrivate(false);
    setBannerUrl(undefined);
    setRecurrence(undefined);
    setOpenInvite(true);
    setSelectedSquadIds([]);
  }, [open]);

  const toggleSquad = (id: string) =>
    setSelectedSquadIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );

  // Audience summary text for the Section trailing label.
  const audienceLabel =
    openInvite && selectedSquadIds.length === 0 ? 'All friends'
    : openInvite && selectedSquadIds.length > 0
      ? `All friends + ${selectedSquadIds.length} squad${selectedSquadIds.length === 1 ? '' : 's'}`
    : selectedSquadIds.length === 0 ? 'Nobody yet'
    : selectedSquadIds.length === 1
      ? `${squads.find(s => s.id === selectedSquadIds[0])?.emoji ?? '👥'} ${squads.find(s => s.id === selectedSquadIds[0])?.name ?? 'Squad'} only`
      : `${selectedSquadIds.length} squads only`;

  const audienceEmpty = !openInvite && selectedSquadIds.length === 0;

  // Derived submit times — depend on the active mode + state.
  //   'now':       starts = right-now-at-submit; ends = starts + duration.
  //   'scheduled': starts = chosen day+time; ends = either a duration chip
  //                offset from start, or an explicit customEnd day+time.
  const computedTimes = (): { startsAt: number; endsAt: number } => {
    if (timeMode === 'now') {
      const start = Date.now();
      return { startsAt: start, endsAt: start + durationMins * 60_000 };
    }
    const start = computeStartsAt(dayOffset, time);
    const end = customEnd
      ? computeStartsAt(customEnd.dayOffset, customEnd.time)
      : start + durationMins * 60_000;
    return { startsAt: start, endsAt: end };
  };

  const submit = () => {
    if (audienceEmpty) return;
    const { startsAt: liveStartsAt, endsAt: liveEndsAt } = computedTimes();
    // Custom end-time must fall after start. Other paths are safe by
    // construction (chips are positive offsets).
    if (liveEndsAt <= liveStartsAt) {
      pushToast('End time must be after the start', 'warn');
      return;
    }
    post({
      category, customEmoji, customLabel,
      title, place,
      startsAt: liveStartsAt,
      endsAt: liveEndsAt,
      description, maxSize,
      // isPrivate only meaningful for open-invite plans
      isPrivate: openInvite ? isPrivate : false,
      bannerUrl, recurrence,
      squadIds: selectedSquadIds,
      isOpenInvite: openInvite,
    });
    // Don't reset here — that flashes every field back to defaults while the
    // sheet animates closed. The open-effect above resets on the next open.
  };

  // Weekday derived from the chosen day, used as the default for "weekly"/"biweekly".
  const startsWeekday = new Date(startsAt).getDay();
  const setRepeat = (next: 'none' | 'daily' | 'weekly' | 'biweekly') => {
    if (next === 'none') return setRecurrence(undefined);
    if (next === 'daily') return setRecurrence({ freq: 'daily' });
    return setRecurrence({ freq: next, weekday: startsWeekday });
  };
  const repeatKey: 'none' | 'daily' | 'weekly' | 'biweekly' = recurrence?.freq ?? 'none';

  // Header label + state for the Post button. Disabled state mirrors the same
  // checks the submit handler enforces — feedback before action.
  const submitDisabled = audienceEmpty || !title.trim();

  return (
    <BottomSheet open={open} onClose={() => close(false)} size="tall">
      <div className="flex flex-col h-full">
        {/* Sticky header bar — replaces the old colored hero. X close on the
            left, page title centered, Post action on the right. Same shape as
            EditProfile / Settings so the create flow reads as part of the
            same app, not a separate composer. */}
        <div className="px-3 pt-1 pb-3 flex items-center justify-between border-b border-white/5">
          <button
            onClick={() => close(false)}
            className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-zinc-300 hover:bg-white/5"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <div className="text-base font-bold text-white truncate px-2">New plan</div>
          <motion.button
            whileTap={!submitDisabled ? { scale: 0.94 } : undefined}
            onClick={submit}
            disabled={submitDisabled}
            className={`px-4 py-1.5 rounded-full text-sm font-bold transition
                        ${submitDisabled
                          ? 'bg-white/5 text-zinc-500 cursor-not-allowed'
                          : 'bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-[0_10px_24px_-10px_rgba(244,63,94,0.6)]'}`}
          >
            Post
          </motion.button>
        </div>

        {/* Slim category banner — lives OUTSIDE the scroll container so it
            sits as a fixed "roof" of the sheet. With the banner outside the
            scroll area, a downward swipe on it goes straight to the
            BottomSheet's drag handler instead of being eaten by the scroll
            view's iOS overscroll bounce, so the user can drag the banner
            down to dismiss the whole sheet — the natural gesture. */}
        <div className="px-4 pt-3 pb-3">
          <BannerStrip
            cat={cat}
            bannerUrl={bannerUrl}
            onPickBanner={onPickBanner}
            onRemoveBanner={removeBanner}
            bannerUploading={bannerUploading}
            title="New plan"
          />
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-12">
          {/* Category chips */}
          <Section title="Category">
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
              {CATEGORIES.map(c => {
                const active = c.key === category;
                return (
                  <motion.button
                    key={c.key}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setCategory(c.key)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border transition
                                ${active
                                  ? 'bg-white text-zinc-900 border-white'
                                  : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                  </motion.button>
                );
              })}

              {/* Custom — user-defined emoji + label */}
              <motion.button
                key="custom"
                whileTap={{ scale: 0.92 }}
                onClick={() => setCategory('custom')}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border transition
                            ${isCustom
                              ? 'bg-gradient-to-br from-fuchsia-500 to-rose-500 text-white border-fuchsia-300 shadow-[0_8px_24px_-10px_rgba(232,121,249,0.6)]'
                              : 'bg-white/5 text-zinc-200 border-white/10 border-dashed hover:bg-white/10'}`}
              >
                <Sparkles size={13} />
                <span>{isCustom ? (customLabel.trim() || 'Custom') : 'Custom +'}</span>
              </motion.button>
            </div>

            {/* Inline inputs — only when "Custom" is selected */}
            {isCustom && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className="mt-3 flex gap-2"
              >
                <input
                  value={customEmoji}
                  onChange={e => {
                    // Keep it short — single grapheme is typical but allow up to 4
                    // chars so combo emojis (skin tones, ZWJ sequences) survive.
                    const next = Array.from(e.target.value).slice(0, 4).join('');
                    setCustomEmoji(next);
                  }}
                  placeholder="✨"
                  inputMode="text"
                  className="w-16 text-center text-2xl bg-white/5 border border-white/10 rounded-2xl py-3 text-white
                             focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60 focus:border-fuchsia-400/30"
                  aria-label="Emoji for your custom category"
                />
                <input
                  value={customLabel}
                  onChange={e => setCustomLabel(e.target.value.slice(0, 24))}
                  placeholder="Name your category"
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                             focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60 focus:border-fuchsia-400/30"
                  aria-label="Label for your custom category"
                />
              </motion.div>
            )}
          </Section>

          {/* Title — REQUIRED. Empty-state styling: rose ring + helper text
              so the user knows why Post is disabled. The asterisk in the
              label matches the standard "required" convention without
              needing a separate "Required" badge. */}
          <Section
            title={<>What are you doing? <span className="text-rose-400">*</span></>}
            trailing={
              !title.trim() ? (
                <span className="text-[11px] uppercase tracking-[0.18em] font-bold text-rose-300/90">
                  Required
                </span>
              ) : null
            }
          >
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`e.g. ${cat.label} sesh`}
              aria-required="true"
              aria-invalid={!title.trim()}
              className={`w-full bg-white/5 border rounded-2xl px-3.5 py-2.5 text-white placeholder:text-zinc-500
                          focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30
                          ${title.trim() ? 'border-white/10' : 'border-rose-400/40'}`}
            />
          </Section>

          {/* Where */}
          <Section title="Where">
            <input
              value={place}
              onChange={e => setPlace(e.target.value)}
              placeholder="Add a place"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5 text-white placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
            />
          </Section>

          {/* Notes — small, optional context the host wants to share with
              the audience. */}
          <Section title="Notes (optional)">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="A little context for the squad..."
              rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5 text-white placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30 resize-none"
            />
          </Section>

          {/* When? — day + time */}
          <Section
            title="When?"
            trailing={
              <span className="text-[11px] text-rose-300/90 font-semibold normal-case tracking-normal">
                {startsAtLabel}
              </span>
            }
          >
            {/* Mode toggle — "Happening now" vs "Scheduled". */}
            <div className="grid grid-cols-2 bg-white/5 border border-white/10 rounded-2xl p-1 relative mb-3">
              {(['now', 'scheduled'] as const).map(m => {
                const active = timeMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setTimeMode(m)}
                    className="relative py-2 rounded-xl text-[12px] font-semibold text-zinc-300"
                  >
                    {active && (
                      <motion.div
                        layoutId="timemode-pill"
                        className="absolute inset-0 bg-white rounded-xl"
                        transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                      />
                    )}
                    <span className={`relative inline-flex items-center gap-1.5 ${active ? 'text-zinc-900' : ''}`}>
                      {m === 'now' ? <Radio size={12} /> : <Calendar size={12} />}
                      {m === 'now' ? 'Happening now' : 'Scheduled'}
                    </span>
                  </button>
                );
              })}
            </div>

            {timeMode === 'now' ? (
              /* GO LIVE banner — gives the "right now" mode a distinctive feel
                 so the user understands the activity will publish + start
                 immediately on submit. */
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-2xl border border-rose-400/40
                           bg-gradient-to-br from-rose-500/20 via-rose-500/10 to-orange-500/10
                           px-4 py-3 mb-3"
              >
                {/* Subtle pulse so the badge feels alive. */}
                <motion.span
                  aria-hidden
                  className="absolute -inset-1 rounded-2xl pointer-events-none"
                  initial={{ boxShadow: '0 0 0 0 rgba(244, 63, 94, 0.55)' }}
                  animate={{ boxShadow: [
                    '0 0 0 0 rgba(244, 63, 94, 0.55)',
                    '0 0 0 12px rgba(244, 63, 94, 0)',
                    '0 0 0 0 rgba(244, 63, 94, 0)',
                  ] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                />
                <div className="relative flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)]" />
                  <div className="flex-1">
                    <div className="text-[12px] uppercase tracking-[0.18em] font-black text-rose-100">
                      GO LIVE
                    </div>
                    <div className="text-[11px] text-rose-200/85 mt-0.5">
                      Starts the moment you post. Pick how long it'll run.
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <>
                {/* Day strip — horizontal scroll, auto-width chips so "Tomorrow" fits */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                  {days.map(d => {
                    const active = d.offset === dayOffset;
                    return (
                      <motion.button
                        key={d.offset}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setDayOffset(d.offset)}
                        className={`shrink-0 px-4 py-2 rounded-2xl border transition flex flex-col items-center justify-center min-w-[64px]
                                    ${active
                                      ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400 shadow-[0_10px_30px_-12px_rgba(244,63,94,0.7)]'
                                      : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                      >
                        <span className={`text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap ${active ? 'text-white/90' : 'text-zinc-400'}`}>
                          {d.offset < 2 ? d.label : d.weekday}
                        </span>
                        <span className="text-xl font-black leading-tight mt-0.5">
                          {d.day}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Start time pill */}
                <label className="mt-2 flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10
                                  focus-within:ring-2 focus-within:ring-rose-400/60 focus-within:border-rose-400/30 cursor-pointer">
                  <Clock size={16} className="text-zinc-400" />
                  <span className="text-xs uppercase tracking-widest text-zinc-400 font-semibold">Time</span>
                  <input
                    type="time"
                    value={time}
                    onChange={e => setTime(e.target.value)}
                    className="ml-auto bg-transparent text-white font-semibold text-base focus:outline-none
                               [color-scheme:dark]"
                  />
                </label>
              </>
            )}

            {/* Duration chips — drive endsAt in both modes. "Custom" expands
                an explicit end-time picker for scheduled events that span
                long windows or land on a different day. */}
            <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold px-1 mb-1.5">
              How long?
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                { mins: 30,  label: '30m' },
                { mins: 60,  label: '1h' },
                { mins: 120, label: '2h' },
                { mins: 240, label: '4h' },
                { mins: 480, label: '8h' },
              ] as const).map(opt => {
                const active = !customEnd && durationMins === opt.mins;
                return (
                  <motion.button
                    key={opt.mins}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => { setDurationMins(opt.mins); setCustomEnd(null); }}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition
                                ${active
                                  ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400 shadow-[0_6px_18px_-8px_rgba(244,63,94,0.6)]'
                                  : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                  >
                    {opt.label}
                  </motion.button>
                );
              })}
              {/* Custom — flips to explicit end day+time inputs below.
                  Disabled in 'now' mode since the day picker doesn't make
                  sense there (you'd be picking a future day for "now"). */}
              {timeMode === 'scheduled' && (
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => {
                    if (customEnd) {
                      setCustomEnd(null);
                    } else {
                      // Seed with start + 2h so the user has a reasonable
                      // default to tweak.
                      const seedStart = computeStartsAt(dayOffset, time) + 2 * 60 * 60 * 1000;
                      const d = new Date(seedStart);
                      // Day offset relative to today
                      const today0 = new Date(); today0.setHours(0, 0, 0, 0);
                      const dayOf  = new Date(d);  dayOf.setHours(0, 0, 0, 0);
                      const offset = Math.round((dayOf.getTime() - today0.getTime()) / 86_400_000);
                      const hh = String(d.getHours()).padStart(2, '0');
                      const mm = String(d.getMinutes()).padStart(2, '0');
                      setCustomEnd({ dayOffset: Math.max(0, offset), time: `${hh}:${mm}` });
                    }
                  }}
                  className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition
                              ${customEnd
                                ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400'
                                : 'bg-white/5 text-zinc-200 border-white/10 border-dashed hover:bg-white/10'}`}
                >
                  {customEnd ? 'Custom ✓' : 'Custom'}
                </motion.button>
              )}
            </div>

            {/* Explicit end-time picker — only when "Custom" is on in
                scheduled mode. Lets the user pick a different end day. */}
            {timeMode === 'scheduled' && customEnd && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mt-3"
              >
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold px-1 mb-1.5">
                  Ends on
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
                  {days.map(d => {
                    const active = d.offset === customEnd.dayOffset;
                    return (
                      <motion.button
                        key={d.offset}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setCustomEnd({ ...customEnd, dayOffset: d.offset })}
                        className={`shrink-0 px-4 py-2 rounded-2xl border transition flex flex-col items-center justify-center min-w-[64px]
                                    ${active
                                      ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400'
                                      : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                      >
                        <span className={`text-[10px] uppercase tracking-widest font-semibold whitespace-nowrap ${active ? 'text-white/90' : 'text-zinc-400'}`}>
                          {d.offset < 2 ? d.label : d.weekday}
                        </span>
                        <span className="text-xl font-black leading-tight mt-0.5">
                          {d.day}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
                <label className="mt-2 flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10
                                  focus-within:ring-2 focus-within:ring-rose-400/60 focus-within:border-rose-400/30 cursor-pointer">
                  <Clock size={16} className="text-zinc-400" />
                  <span className="text-xs uppercase tracking-widest text-zinc-400 font-semibold">End time</span>
                  <input
                    type="time"
                    value={customEnd.time}
                    onChange={e => setCustomEnd({ ...customEnd, time: e.target.value })}
                    className="ml-auto bg-transparent text-white font-semibold text-base focus:outline-none
                               [color-scheme:dark]"
                  />
                </label>
              </motion.div>
            )}
          </Section>

          {/* Share with — promoted up from the bottom of the form because
              audience is the #1 thing that affects who sees the plan. Kept
              outside the More options collapse for that reason. */}
          <Section
            title="Share with"
            trailing={
              <span className={`text-[11px] font-semibold normal-case tracking-normal
                                ${audienceEmpty ? 'text-amber-300' : 'text-rose-300/90'}`}>
                {audienceLabel}
              </span>
            }
          >
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
              <ShareChip
                emoji="🌐"
                label="All friends"
                active={openInvite}
                onClick={() => setOpenInvite(v => !v)}
              />
              {squads.map(s => {
                const active = selectedSquadIds.includes(s.id);
                return (
                  <ShareChip
                    key={s.id}
                    emoji={s.emoji}
                    label={s.name}
                    badge={String(1 + s.memberIds.length)}
                    active={active}
                    onClick={() => toggleSquad(s.id)}
                  />
                );
              })}
            </div>
            <div className="text-[11px] text-zinc-400 mt-2 px-1 leading-snug">
              {audienceEmpty
                ? 'Pick at least one audience above.'
                : openInvite && selectedSquadIds.length === 0
                  ? 'Open to all friends — they\'ll see it in the feed.'
                  : openInvite
                    ? 'Open invite — also surfaces in the tagged squad screens.'
                    : 'Squad-only — only members of the selected squads can see it.'}
            </div>
            {squads.length === 0 && (
              <div className="text-[11px] text-zinc-500 mt-2 px-1">
                No squads to tag yet — make one from Profile → Squads.
              </div>
            )}
          </Section>

          {/* Privacy — only relevant when "All friends" is on (squad-only posts ignore FoF).
              Kept OUT of More options because audience scope is a privacy-impacting
              decision the host should consciously confirm, not bury two clicks deep. */}
          {openInvite && (
          <Section
            title="Visibility"
            trailing={
              <span className="text-[11px] text-rose-300/90 font-semibold normal-case tracking-normal">
                {isPrivate ? 'Friends only' : 'Friends + their friends'}
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setIsPrivate(false)}
                className={`p-3 rounded-2xl border text-left transition
                            ${!isPrivate
                              ? 'bg-white text-zinc-900 border-white shadow-[0_10px_30px_-12px_rgba(244,63,94,0.4)]'
                              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
              >
                <div className="flex items-center gap-2">
                  <Globe2 size={16} />
                  <span className="text-sm font-bold">Public</span>
                </div>
                <div className={`text-[11px] mt-1 ${!isPrivate ? 'text-zinc-600' : 'text-zinc-400'}`}>
                  Friends + their friends if a friend joins.
                </div>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setIsPrivate(true)}
                className={`p-3 rounded-2xl border text-left transition
                            ${isPrivate
                              ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400 shadow-[0_10px_30px_-12px_rgba(244,63,94,0.6)]'
                              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
              >
                <div className="flex items-center gap-2">
                  <Lock size={16} />
                  <span className="text-sm font-bold">Private</span>
                </div>
                <div className={`text-[11px] mt-1 ${isPrivate ? 'text-white/85' : 'text-zinc-400'}`}>
                  Only your direct friends. No friend-of-friend unlock.
                </div>
              </motion.button>
            </div>
          </Section>
          )}

          {/* More options — the rarely-needed fields. Notes + Visibility are
              NOT here (they're either above or per request "shouldn't be more
              options"). Banner image is no longer a separate section — it
              lives on the preview card itself (tap the camera button on the
              header band to add or replace). */}
          <MoreOptions open={moreOpen} onToggle={() => setMoreOpen(o => !o)}>

          {/* Max party size — horizontal scroll, 2-10 + Unlimited */}
          <Section
            title="Max party size"
            trailing={
              <span className="text-[11px] text-rose-300/90 font-semibold normal-case tracking-normal">
                {maxSize === undefined ? 'Unlimited' : `Cap ${maxSize}`}
              </span>
            }
          >
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
              {[2,3,4,5,6,7,8,9,10].map(n => {
                const active = maxSize === n;
                return (
                  <motion.button
                    key={n}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setMaxSize(n)}
                    className={`shrink-0 min-w-[56px] px-4 py-2 rounded-full text-sm font-semibold border transition
                                ${active
                                  ? 'bg-white text-zinc-900 border-white'
                                  : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                  >
                    {n}
                  </motion.button>
                );
              })}
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setMaxSize(undefined)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition whitespace-nowrap
                            ${maxSize === undefined
                              ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400 shadow-[0_8px_24px_-10px_rgba(244,63,94,0.6)]'
                              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
              >
                ∞ Unlimited
              </motion.button>
            </div>
          </Section>

          {/* "everyone welcome" reassurance — shown only when unlimited */}
          {maxSize === undefined && (
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400 px-1">
              <Calendar size={12} className="text-rose-300/80" />
              Open to everyone in your squad.
            </div>
          )}

          {/* Repeat */}
          <Section
            title="Repeat"
            trailing={
              <span className="text-[11px] text-rose-300/90 font-semibold normal-case tracking-normal">
                {recurrenceLabel(recurrence) ?? 'Doesn\'t repeat'}
              </span>
            }
          >
            <div className="flex gap-2 flex-wrap">
              {([
                { key: 'none',     label: 'Doesn\'t repeat' },
                { key: 'daily',    label: 'Daily' },
                { key: 'weekly',   label: 'Weekly' },
                { key: 'biweekly', label: 'Every 2 weeks' },
              ] as const).map(opt => {
                const active = repeatKey === opt.key;
                return (
                  <motion.button
                    key={opt.key}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setRepeat(opt.key)}
                    className={`px-3.5 py-2 rounded-full text-sm font-semibold border transition
                                ${active
                                  ? 'bg-white text-zinc-900 border-white'
                                  : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                  >
                    {opt.label}
                  </motion.button>
                );
              })}
            </div>
            <div className="text-[11px] text-zinc-500 mt-2 px-1">
              {repeatKey === 'none'
                ? 'One-off plan — happens once.'
                : `↻ ${recurrenceLabel(recurrence)} starting ${startsAtLabel}.`}
            </div>
          </Section>
          </MoreOptions>
        </div>
      </div>
    </BottomSheet>
  );
}

function ShareChip({
  emoji, label, badge, active, onClick,
}: {
  emoji: string;
  label: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border transition
                  ${active
                    ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400 shadow-[0_8px_24px_-10px_rgba(244,63,94,0.6)]'
                    : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
    >
      <span>{emoji}</span>
      <span>{label}</span>
      {badge && (
        <span className={`text-[10px] tabular-nums ml-0.5 ${active ? 'text-white/80' : 'text-zinc-400'}`}>
          {badge}
        </span>
      )}
      {active && (
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="2,7 5,10 10,3" />
        </svg>
      )}
    </motion.button>
  );
}

function Section({
  title, trailing, children,
}: { title: React.ReactNode; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1.5 px-1">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{title}</div>
        {trailing}
      </div>
      {children}
    </div>
  );
}

/**
 * Slim banner strip at the top of the sheet — a single colored bar tinted
 * to the currently-selected category gradient (or the user's uploaded
 * banner photo). Carries the page title + category label + a camera button
 * for picking/replacing the banner image. Replaces the previous full live
 * preview card, which was visually heavy.
 */
function BannerStrip({
  cat, bannerUrl, onPickBanner, onRemoveBanner, bannerUploading, title,
}: {
  cat: { key: string; label: string; emoji: string; gradient: string };
  bannerUrl?: string;
  onPickBanner: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveBanner: () => void;
  bannerUploading: boolean;
  title: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10
                    shadow-[0_18px_40px_-22px_rgba(0,0,0,0.6)]">
      {/* Hidden file input — triggered by the camera button. */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onPickBanner}
        className="hidden"
      />
      <div className={`relative h-20 ${bannerUrl ? 'bg-zinc-900' : `bg-gradient-to-br ${cat.gradient}`}`}>
        {bannerUrl ? (
          <>
            <img
              src={mediaUrl(bannerUrl)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/30" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        )}
        <div className="absolute inset-0 flex items-center justify-between px-4">
          <div className="min-w-0">
            <div className="text-white/85 text-[10px] uppercase tracking-[0.18em] font-bold">
              {title}
            </div>
            <div className="text-white text-lg font-black leading-tight truncate inline-flex items-center gap-2 mt-0.5">
              <span className="text-2xl drop-shadow">{cat.emoji}</span>
              <span className="truncate">{cat.label}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {bannerUrl && (
              <button
                type="button"
                onClick={onRemoveBanner}
                aria-label="Remove banner image"
                className="h-8 w-8 grid place-items-center rounded-full bg-black/50 backdrop-blur text-white hover:bg-black/65 transition"
              >
                <X size={14} strokeWidth={3} />
              </button>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={bannerUploading}
              aria-label={bannerUrl ? 'Replace banner image' : 'Add a banner image'}
              className="h-8 w-8 grid place-items-center rounded-full bg-black/50 backdrop-blur text-white hover:bg-black/65 transition disabled:opacity-60"
            >
              {bannerUploading
                ? <Loader2 size={14} className="animate-spin" />
                : <Camera size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Collapsing "More options" container. Keeps the primary fields above the fold
 * and tucks the rarely-used advanced fields behind a tap so first-time users
 * aren't faced with a wall of inputs. The header row is the toggle; the body
 * animates open/closed with framer's auto-height pattern.
 */
function MoreOptions({
  open, onToggle, children,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-4 py-3 rounded-2xl
                   bg-white/5 border border-white/10 text-zinc-100 text-sm font-semibold
                   hover:bg-white/10 transition"
      >
        <span className="inline-flex items-center gap-2">
          <Sparkles size={14} className="text-rose-300" />
          More options
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-zinc-400"
        >
          <ChevronDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
