import { motion } from 'framer-motion';
import { Calendar, Clock, Globe2, Lock, MapPin, Sparkles, Users, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { BottomSheet } from '../components/BottomSheet';
import { PulseButton } from '../components/PulseButton';
import { TimePicker } from '../components/TimePicker';
import { CATEGORIES } from '../data/categories';
import { buildDayOptions, computeStartsAt, decomposeEpoch } from '../data/time';
import { isLiveActivity, useApp } from '../store';
import type { CategoryKey } from '../types';

/**
 * Host-only edit sheet for an existing activity. Mirrors the relevant slices
 * of PostSheet (title, place, description, start/end, audience, privacy,
 * squads, max size) but with two changes:
 *
 *   1. State is seeded from the activity, so opening it reflects current values.
 *   2. The start time stays editable even after the plan goes live — the
 *      "forgot to bump it" case is real and locking the field just sent
 *      hosts to delete + repost. End-after-start is still enforced.
 *
 * Category, recurrence, and banner are deliberately out of scope here. They
 * change the plan's identity more than its details and belong in a future
 * "rebuild plan" flow if we ever want them editable.
 */
export function EditActivitySheet() {
  const editId = useApp(s => s.editActivityId);
  const setEditId = useApp(s => s.setEditActivityId);
  return (
    <BottomSheet open={!!editId} onClose={() => setEditId(null)} size="tall">
      {editId ? <Inner key={editId} activityId={editId} onClose={() => setEditId(null)} /> : null}
    </BottomSheet>
  );
}

function Inner({ activityId, onClose }: { activityId: string; onClose: () => void }) {
  const activity = useApp(s => s.activities.find(a => a.id === activityId));
  const updateActivity = useApp(s => s.updateActivity);
  // Eligible squads = ones I host or am a member of (matches PostSheet).
  const squads = useApp(useShallow(s =>
    s.squads.filter(sq => sq.hostId === s.meId || sq.memberIds.includes(s.meId))
  ));

  const startDecomp = useMemo(
    () => activity ? decomposeEpoch(activity.startsAt) : { dayOffset: 0, time: '12:00' },
    [activity?.startsAt, activity],
  );
  const endDecomp = useMemo(
    () => activity ? decomposeEpoch(activity.endsAt) : { dayOffset: 0, time: '14:00' },
    [activity?.endsAt, activity],
  );

  const [category, setCategory] = useState<CategoryKey>(activity?.category ?? 'other');
  const [customEmoji, setCustomEmoji] = useState(activity?.customEmoji ?? '');
  const [customLabel, setCustomLabel] = useState(activity?.customLabel ?? '');
  const [title, setTitle] = useState(activity?.title ?? '');
  const [place, setPlace] = useState(activity?.place ?? '');
  const [description, setDescription] = useState(activity?.description ?? '');
  const [startDay, setStartDay] = useState(startDecomp.dayOffset);
  const [startTime, setStartTime] = useState(startDecomp.time);
  const [endDay, setEndDay] = useState(endDecomp.dayOffset);
  const [endTime, setEndTime] = useState(endDecomp.time);
  const [isPrivate, setIsPrivate] = useState(activity?.isPrivate ?? false);
  const [isOpenInvite, setOpenInvite] = useState(activity?.isOpenInvite ?? true);
  const [selectedSquadIds, setSelectedSquadIds] = useState<string[]>(activity?.squadIds ?? []);
  const [maxSize, setMaxSize] = useState<number | undefined>(activity?.maxSize);
  const [saving, setSaving] = useState(false);

  // Re-sync state if the underlying activity changes mid-edit (e.g. a realtime
  // event lands while the sheet is open). We only do this once on activityId
  // mount via the `key` prop — but if endsAt shifts externally while editing,
  // the user keeps their unsaved changes rather than losing them silently.

  const days = useMemo(buildDayOptions, []);

  if (!activity) return null;

  const live = isLiveActivity(activity);

  const newStartsAt = computeStartsAt(startDay, startTime);
  const newEndsAt = computeStartsAt(endDay, endTime);
  const validRange = newEndsAt > newStartsAt;
  const audienceEmpty = !isOpenInvite && selectedSquadIds.length === 0;
  const canSave = !!title.trim() && validRange && !audienceEmpty && !saving;

  const toggleSquad = (id: string) =>
    setSelectedSquadIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    // Only include startsAt if it actually moved — skip the no-op write so
    // updated_at doesn't bump for nothing. Live status no longer gates the
    // patch.
    const startChanged = newStartsAt !== activity.startsAt;
    const endChanged = newEndsAt !== activity.endsAt;
    // Only thread category fields when they actually changed — otherwise the
    // server clears custom_emoji/custom_label on a no-op category switch.
    const categoryChanged = category !== activity.category;
    const ok = await updateActivity(activityId, {
      title: title.trim(),
      place: place.trim(),
      description: description.trim(),
      startsAt: startChanged ? newStartsAt : undefined,
      endsAt: endChanged ? newEndsAt : undefined,
      isPrivate,
      isOpenInvite,
      squadIds: selectedSquadIds,
      maxSize: maxSize ?? null,
      category: categoryChanged ? category : undefined,
      customEmoji: category === 'custom' ? customEmoji.trim() : undefined,
      customLabel: category === 'custom' ? customLabel.trim() : undefined,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Hero */}
      <div className="relative mx-4 mt-2 overflow-hidden rounded-2xl h-20 bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-500">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        <div className="absolute inset-0 flex items-center justify-between px-5">
          <div>
            <div className="text-white/85 text-xs uppercase tracking-widest font-semibold">
              Edit plan
            </div>
            <div className="text-white text-xl font-black mt-0.5 truncate">
              {title.trim() || activity.title}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full grid place-items-center bg-black/30 text-white backdrop-blur"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-36">
        {/* Category — Custom comes first so users who don't see a fitting
            preset find the escape hatch without scrolling. Mirrors the
            PostSheet category strip exactly. */}
        <Label>Category</Label>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          <motion.button
            key="custom"
            whileTap={{ scale: 0.92 }}
            onClick={() => setCategory('custom')}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border transition
                        ${category === 'custom'
                          ? 'bg-gradient-to-br from-fuchsia-500 to-rose-500 text-white border-fuchsia-300 shadow-[0_8px_24px_-10px_rgba(232,121,249,0.6)]'
                          : 'bg-white/5 text-zinc-200 border-white/10 border-dashed hover:bg-white/10'}`}
          >
            <Sparkles size={13} />
            <span>{category === 'custom' ? (customLabel.trim() || 'Custom') : 'Custom +'}</span>
          </motion.button>
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
        </div>
        {category === 'custom' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="mt-3 flex gap-2"
          >
            <input
              value={customEmoji}
              onChange={e => {
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

        {/* Title */}
        <Label>Name</Label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, 80))}
          placeholder="Plan name"
          className={fieldCls}
        />

        {/* Place */}
        <Label>Where (optional)</Label>
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3
                        focus-within:ring-2 focus-within:ring-rose-400/60 focus-within:border-rose-400/30">
          <MapPin size={16} className="text-zinc-400" />
          <input
            value={place}
            onChange={e => setPlace(e.target.value.slice(0, 80))}
            placeholder="e.g. Equinox SoHo"
            className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none text-sm"
          />
        </div>

        {/* Description */}
        <Label>Description (optional)</Label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value.slice(0, 280))}
          rows={2}
          placeholder="What's the vibe? Anything to bring?"
          className={`${fieldCls} resize-none`}
        />

        {/* Start time */}
        <Label>
          <Calendar size={11} className="inline -mt-0.5 mr-1" />
          Starts {live && <span className="ml-1 text-rose-300 normal-case tracking-normal font-bold">live now</span>}
        </Label>
        <DayTimePicker
          days={days}
          dayOffset={startDay}
          time={startTime}
          onDay={setStartDay}
          onTime={setStartTime}
        />
        {live && (
          <div className="text-[11px] text-rose-300/90 mt-2 px-1">
            Moving the start time will reset the live-now timer for everyone.
          </div>
        )}

        {/* End time */}
        <Label>
          <Clock size={11} className="inline -mt-0.5 mr-1" />
          Ends
        </Label>
        <DayTimePicker
          days={days}
          dayOffset={endDay}
          time={endTime}
          onDay={setEndDay}
          onTime={setEndTime}
        />
        {!validRange && (
          <div className="text-[11px] text-rose-300 mt-2 px-1">
            End time must be after the start.
          </div>
        )}

        {/* Audience */}
        <Label>
          <Users size={11} className="inline -mt-0.5 mr-1" />
          Who can see + join?
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setOpenInvite(true)}
            className={`p-3 rounded-2xl border text-left transition
                        ${isOpenInvite
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-400'
                          : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
          >
            <div className="text-sm font-bold">All friends</div>
            <div className={`text-[11px] mt-1 ${isOpenInvite ? 'text-white/85' : 'text-zinc-400'}`}>
              Anyone you're friends with can join.
            </div>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => setOpenInvite(false)}
            className={`p-3 rounded-2xl border text-left transition
                        ${!isOpenInvite
                          ? 'bg-white text-zinc-900 border-white'
                          : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
          >
            <div className="text-sm font-bold">Squads only</div>
            <div className={`text-[11px] mt-1 ${!isOpenInvite ? 'text-zinc-600' : 'text-zinc-400'}`}>
              Pick specific squads below.
            </div>
          </motion.button>
        </div>

        {/* Privacy — only relevant for open-invite plans (squad-only is private
            by construction). */}
        {isOpenInvite && (
          <>
            <Label>
              {isPrivate ? <Lock size={11} className="inline -mt-0.5 mr-1" /> : <Globe2 size={11} className="inline -mt-0.5 mr-1" />}
              Visibility
            </Label>
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
          </>
        )}

        {/* Squads */}
        {squads.length > 0 && (
          <>
            <Label>Squads (optional)</Label>
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
          </>
        )}

        {audienceEmpty && (
          <div className="text-[11px] text-rose-300 mt-3 px-1">
            Pick at least one squad — or switch back to All friends.
          </div>
        )}

        {/* Max size */}
        <Label>Max party size (optional)</Label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMaxSize(prev => (prev === undefined ? undefined : Math.max(2, prev - 1)))}
            disabled={maxSize === undefined || maxSize <= 2}
            className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 text-white text-lg font-bold
                       disabled:opacity-30"
          >
            −
          </button>
          <div className="flex-1 text-center bg-white/5 border border-white/10 rounded-2xl py-2.5 text-sm text-white font-semibold">
            {maxSize === undefined ? 'No cap' : `${maxSize} people`}
          </div>
          <button
            onClick={() => setMaxSize(prev => (prev === undefined ? 4 : prev + 1))}
            className="h-10 w-10 rounded-2xl bg-white/5 border border-white/10 text-white text-lg font-bold"
          >
            +
          </button>
          {maxSize !== undefined && (
            <button
              onClick={() => setMaxSize(undefined)}
              className="text-[11px] uppercase tracking-widest font-bold text-rose-300 px-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Sticky save button */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <PulseButton onClick={onSave} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save changes'}
        </PulseButton>
      </div>
    </div>
  );
}

const fieldCls =
  'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30 text-sm';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
      {children}
    </div>
  );
}

function DayTimePicker({
  days, dayOffset, time, onDay, onTime,
}: {
  days: ReturnType<typeof buildDayOptions>;
  dayOffset: number;
  time: string;
  onDay: (offset: number) => void;
  onTime: (time: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {days.map(d => {
          const active = d.offset === dayOffset;
          return (
            <motion.button
              key={d.offset}
              whileTap={{ scale: 0.94 }}
              onClick={() => onDay(d.offset)}
              className={`shrink-0 px-3 py-2 rounded-2xl text-center border transition min-w-[58px]
                          ${active
                            ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400'
                            : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
            >
              <div className={`text-[10px] uppercase tracking-widest font-bold ${active ? 'text-white/85' : 'text-zinc-400'}`}>
                {d.label}
              </div>
              <div className="text-sm font-bold mt-0.5">{d.day}</div>
            </motion.button>
          );
        })}
      </div>
      <TimePicker value={time} onChange={onTime} />
    </div>
  );
}
