import { motion } from 'framer-motion';
import { Calendar, Camera, Clock, Globe2, Loader2, Lock, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CATEGORIES, CUSTOM_GRADIENT } from '../data/categories';
import { BottomSheet } from '../components/BottomSheet';
import { PulseButton } from '../components/PulseButton';
import { uploadApi } from '../api/endpoints';
import { mediaUrl } from '../api/client';
import { useApp } from '../store';
import type { CategoryKey, Recurrence } from '../types';
import { recurrenceLabel } from '../store';

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
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [time, setTime] = useState<string>(nextQuarterTime());
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [bannerUploading, setBannerUploading] = useState(false);

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
  const startsAt = computeStartsAt(dayOffset, time);
  const startsAtLabel = formatStartsAt(dayOffset, time);

  const reset = () => {
    setCategory('coffee'); setCustomEmoji(''); setCustomLabel('');
    setTitle(''); setPlace(''); setDescription('');
    setDayOffset(0); setTime(nextQuarterTime()); setMaxSize(undefined);
    setIsPrivate(false);
    setBannerUrl(undefined);
    setRecurrence(undefined);
    setOpenInvite(true);
    setSelectedSquadIds([]);
  };

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

  const submit = () => {
    if (audienceEmpty) return;
    post({
      category, customEmoji, customLabel,
      title, place, startsAt, description, maxSize,
      // isPrivate only meaningful for open-invite plans
      isPrivate: openInvite ? isPrivate : false,
      bannerUrl, recurrence,
      squadIds: selectedSquadIds,
      isOpenInvite: openInvite,
    });
    reset();
  };

  // Weekday derived from the chosen day, used as the default for "weekly"/"biweekly".
  const startsWeekday = new Date(startsAt).getDay();
  const setRepeat = (next: 'none' | 'daily' | 'weekly' | 'biweekly') => {
    if (next === 'none') return setRecurrence(undefined);
    if (next === 'daily') return setRecurrence({ freq: 'daily' });
    return setRecurrence({ freq: next, weekday: startsWeekday });
  };
  const repeatKey: 'none' | 'daily' | 'weekly' | 'biweekly' = recurrence?.freq ?? 'none';

  return (
    <BottomSheet open={open} onClose={() => close(false)}>
      <div className="flex flex-col h-full">
        {/* Hero category preview */}
        <div className={`mx-4 mt-2 rounded-2xl relative overflow-hidden h-28 bg-gradient-to-br ${cat.gradient}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
          <div className="absolute inset-0 flex items-center justify-between px-5">
            <div>
              <div className="text-white/90 text-xs font-semibold uppercase tracking-widest">
                Post a plan
              </div>
              <div className="text-white text-2xl font-black leading-tight">
                {cat.label}
              </div>
            </div>
            <motion.div
              key={cat.key}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18 }}
              className="text-6xl drop-shadow"
            >
              {cat.emoji}
            </motion.div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-32">
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

          {/* Title */}
          <Section title="What are you doing?">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`e.g. ${cat.label} sesh`}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
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

            {/* Time pill */}
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
          </Section>

          {/* Place */}
          <Section title="Where">
            <input
              value={place}
              onChange={e => setPlace(e.target.value)}
              placeholder="Add a place"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
            />
          </Section>

          {/* Description */}
          <Section title="Notes (optional)">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="A little context for the squad..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30 resize-none"
            />
          </Section>

          {/* Banner image (optional) — single image, replaces the gradient hero */}
          <Section
            title="Banner image (optional)"
            trailing={bannerUrl ? (
              <button
                onClick={removeBanner}
                className="text-[11px] uppercase tracking-[0.18em] font-bold text-rose-300"
              >
                Remove
              </button>
            ) : null}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPickBanner}
              className="hidden"
            />
            {bannerUrl ? (
              <motion.button
                whileTap={{ scale: 0.985 }}
                onClick={() => fileRef.current?.click()}
                disabled={bannerUploading}
                className="relative w-full h-28 rounded-2xl overflow-hidden border border-white/10"
              >
                <img src={mediaUrl(bannerUrl)} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-black/30" />
                <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-widest font-bold text-white bg-black/45 backdrop-blur px-2 py-1 rounded-full inline-flex items-center gap-1.5">
                    <Camera size={11} /> Banner set
                  </span>
                  <span className="text-[11px] text-white/85">Tap to replace</span>
                </div>
              </motion.button>
            ) : (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => fileRef.current?.click()}
                disabled={bannerUploading}
                className="w-full h-28 rounded-2xl border border-dashed border-white/20 bg-white/5 grid place-items-center text-zinc-300 hover:bg-white/10 transition"
              >
                <div className="flex flex-col items-center gap-1.5">
                  {bannerUploading ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      <span className="text-sm font-semibold">Uploading…</span>
                    </>
                  ) : (
                    <>
                      <Camera size={20} />
                      <span className="text-sm font-semibold">Add a banner image</span>
                      <span className="text-[11px] text-zinc-500">
                        Replaces the category gradient on your event
                      </span>
                    </>
                  )}
                </div>
              </motion.button>
            )}
          </Section>

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

          {/* Share with — multi-select. Tick "All friends" for an open invite;
              tick any squads to also tag those squad screens. Combine for
              "open invite + tagged" or pick squads only for private squad plan. */}
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

          {/* Privacy — only relevant when "All friends" is on (squad-only posts ignore FoF). */}
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
        </div>

        {/* Sticky submit */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <PulseButton onClick={submit} disabled={audienceEmpty}>
            {audienceEmpty ? 'Pick an audience to post' : 'Post to your squad'}
          </PulseButton>
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
}: { title: string; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{title}</div>
        {trailing}
      </div>
      {children}
    </div>
  );
}
