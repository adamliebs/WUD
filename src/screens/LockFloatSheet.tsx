import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Globe2, Lock, MapPin, Radio, Sparkles, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AvatarStack } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { PulseButton } from '../components/PulseButton';
import { buildDayOptions, computeStartsAt, nextQuarterTime } from '../data/time';
import { useApp } from '../store';

/**
 * Sender-only sheet that promotes a Float into a real Activity. Reuses the
 * same "Now / Scheduled" time mental model as PostSheet but trimmed to the
 * essentials — title, time, place — because the float already carries the
 * question and the audience. Submitting calls the floats lock endpoint
 * server-side, which:
 *   1. Creates the activity (with the float's keen responders pre-RSVP'd)
 *   2. Sets the float's locked_into_activity_id back-reference
 *   3. Notifies each keen responder "Sarah locked it in — see you there"
 */
export function LockFloatSheet() {
  const lockingId = useApp(s => s.lockingFloatId);
  const setLockingId = useApp(s => s.setLockingFloatId);
  return (
    <BottomSheet open={!!lockingId} onClose={() => setLockingId(null)} size="tall">
      {lockingId ? <Inner key={lockingId} floatId={lockingId} onClose={() => setLockingId(null)} /> : null}
    </BottomSheet>
  );
}

const DURATIONS = [
  { mins: 60,  label: '1h' },
  { mins: 120, label: '2h' },
  { mins: 240, label: '4h' },
  { mins: 480, label: '8h' },
];

function Inner({ floatId, onClose }: { floatId: string; onClose: () => void }) {
  const f = useApp(s => s.floats.find(x => x.id === floatId));
  const lockFloat = useApp(s => s.lockFloat);
  const openActivity = useApp(s => s.openActivity);

  const keenUsers = useApp(useShallow(s => {
    const found = s.floats.find(x => x.id === floatId);
    return found ? found.responses.filter(r => r.state === 'keen').map(r => s.userById(r.userId)) : [];
  }));

  // Squads I can tag with — same eligibility rule as PostSheet/EditActivity.
  const squads = useApp(useShallow(s =>
    s.squads.filter(sq => sq.hostId === s.meId || sq.memberIds.includes(s.meId))
  ));

  const [title, setTitle] = useState(f?.question.replace(/[?!.]+$/, '') ?? '');
  const [place, setPlace] = useState(f?.place ?? '');
  const [timeMode, setTimeMode] = useState<'now' | 'scheduled'>('scheduled');
  const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState(nextQuarterTime());
  const [durationMins, setDurationMins] = useState(120);
  // Audience defaults inherit from the float but the host can override them
  // here — locking in is the moment the soft proposal becomes commitment, so
  // it's also the right time to lock down visibility.
  const [isOpenInvite, setOpenInvite] = useState(f?.isOpenInvite ?? true);
  const [isPrivate, setIsPrivate] = useState(f?.isPrivate ?? false);
  const [selectedSquadIds, setSelectedSquadIds] = useState<string[]>(f?.squadIds ?? []);
  const [saving, setSaving] = useState(false);

  const toggleSquad = (id: string) =>
    setSelectedSquadIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Default the day strip to the float's rough timing when there is one,
  // so a "weekend" float lands on Saturday by default.
  useEffect(() => {
    if (!f?.timing) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (f.timing === 'today') setDayOffset(0);
    else if (f.timing === 'tomorrow') setDayOffset(1);
    else if (f.timing === 'weekend') {
      // Next Saturday (or today if it's already Sat/Sun)
      const dow = new Date().getDay();
      const offset = dow === 6 ? 0 : dow === 0 ? 0 : 6 - dow;
      setDayOffset(offset);
    }
  }, [f?.timing]);

  const days = useMemo(buildDayOptions, []);

  if (!f) return null;

  const computedTimes = (): { startsAt: number; endsAt: number } => {
    if (timeMode === 'now') {
      const start = Date.now();
      return { startsAt: start, endsAt: start + durationMins * 60_000 };
    }
    const start = computeStartsAt(dayOffset, time);
    return { startsAt: start, endsAt: start + durationMins * 60_000 };
  };

  const audienceEmpty = !isOpenInvite && selectedSquadIds.length === 0;
  const canSave = !!title.trim() && !audienceEmpty && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const { startsAt, endsAt } = computedTimes();
    const activityId = await lockFloat(floatId, {
      title: title.trim(),
      place: place.trim() || undefined,
      startsAt,
      endsAt,
      isOpenInvite,
      // Private only applies when open-invite is on — squad-only is private by
      // construction, mirroring PostSheet's semantics.
      isPrivate: isOpenInvite ? isPrivate : false,
      squadIds: selectedSquadIds,
    });
    setSaving(false);
    if (activityId) {
      onClose();
      // Jump them right into the new activity so they see who's coming.
      setTimeout(() => openActivity(activityId), 120);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Hero — keeps the balloon visual identity from the float card. */}
      <div className="relative mx-4 mt-2 overflow-hidden rounded-2xl h-24 bg-gradient-to-br from-fuchsia-500 via-rose-500 to-orange-500">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        <div className="absolute inset-0 flex items-center justify-between px-5">
          <div className="min-w-0">
            <div className="text-white/85 text-xs uppercase tracking-widest font-semibold flex items-center gap-1.5">
              <Sparkles size={12} />
              Lock it in
            </div>
            <div className="text-white text-lg font-black leading-tight mt-0.5 truncate">
              {f.emoji ?? '✨'} {f.question}
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full grid place-items-center bg-black/30 text-white backdrop-blur shrink-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-36">
        {/* Keen crowd preview */}
        {keenUsers.length > 0 && (
          <div className="mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-400/30 p-3 flex items-center gap-3">
            <AvatarStack users={keenUsers} size={26} max={5} />
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-emerald-200">
                {keenUsers.length} keen — auto-RSVP'd as going
              </div>
              <div className="text-[11px] text-emerald-100/70 truncate">
                {keenUsers.map(u => u.name).join(', ')}
              </div>
            </div>
          </div>
        )}

        {/* Title */}
        <Label>Plan name</Label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value.slice(0, 80))}
          placeholder="Surf at Bondi"
          className={fieldCls}
        />

        {/* Place */}
        <Label>Where (optional)</Label>
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3
                        focus-within:ring-2 focus-within:ring-fuchsia-400/60">
          <MapPin size={16} className="text-zinc-400" />
          <input
            value={place}
            onChange={e => setPlace(e.target.value.slice(0, 80))}
            placeholder="e.g. Bondi Beach"
            className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none text-sm"
          />
        </div>

        {/* When? */}
        <Label>When?</Label>
        <div className="grid grid-cols-2 bg-white/5 border border-white/10 rounded-2xl p-1 relative">
          {(['now', 'scheduled'] as const).map(m => {
            const active = timeMode === m;
            return (
              <button
                key={m}
                onClick={() => setTimeMode(m)}
                className="relative py-2 rounded-xl text-sm font-semibold text-zinc-300"
              >
                {active && (
                  <motion.div
                    layoutId="lockfloat-timemode-pill"
                    className="absolute inset-0 bg-white rounded-xl"
                    transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  />
                )}
                <span className={`relative inline-flex items-center gap-1.5 ${active ? 'text-zinc-900' : ''}`}>
                  {m === 'now' ? <><Radio size={13} /> Now</> : <><Calendar size={13} /> Scheduled</>}
                </span>
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {timeMode === 'scheduled' ? (
            <motion.div
              key="sched"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-3 space-y-2"
            >
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
                {days.map(d => {
                  const active = d.offset === dayOffset;
                  return (
                    <motion.button
                      key={d.offset}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => setDayOffset(d.offset)}
                      className={`shrink-0 px-3 py-2 rounded-2xl text-center border transition min-w-[58px]
                                  ${active
                                    ? 'bg-gradient-to-br from-fuchsia-500 to-rose-500 text-white border-fuchsia-400'
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
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm
                           focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60"
              />
            </motion.div>
          ) : (
            <motion.div
              key="now"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-3 rounded-2xl p-3 bg-gradient-to-br from-rose-500/15 to-orange-500/10 border border-rose-400/30 text-sm text-white"
            >
              <div className="font-bold flex items-center gap-1.5">
                <Radio size={13} className="text-rose-300" />
                Going live as soon as you save
              </div>
              <div className="text-[11px] text-zinc-300 mt-0.5">
                Lands in the live strip immediately.
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Duration */}
        <Label>How long?</Label>
        <div className="flex gap-1.5">
          {DURATIONS.map(d => {
            const active = durationMins === d.mins;
            return (
              <motion.button
                key={d.mins}
                whileTap={{ scale: 0.92 }}
                onClick={() => setDurationMins(d.mins)}
                className={`flex-1 py-2.5 rounded-2xl text-sm font-bold border transition
                            ${active
                              ? 'bg-gradient-to-br from-fuchsia-500 to-orange-500 text-white border-fuchsia-400'
                              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
              >
                {d.label}
              </motion.button>
            );
          })}
        </div>

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

        {/* Visibility — only relevant when open-invite is on (squad-only is
            private by construction). */}
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
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
        <PulseButton onClick={save} disabled={!canSave}>
          {saving ? 'Locking in…' :
            keenUsers.length > 0
              ? `Lock in for ${keenUsers.length} keen friend${keenUsers.length === 1 ? '' : 's'}`
              : 'Lock it in'}
        </PulseButton>
      </div>
    </div>
  );
}

const fieldCls =
  'w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-fuchsia-400/60 text-sm';

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2 px-1">
      {children}
    </div>
  );
}

