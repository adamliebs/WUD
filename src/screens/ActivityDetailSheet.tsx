import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BarChart3, Camera, Clock, Crown, Lock, MapPin, MessageCircle, MoreHorizontal, Repeat, Send, ShieldOff, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { PollBubble } from '../components/PollBubble';
import { ReactionBar } from '../components/ReactionBar';
import { categoryFor } from '../data/categories';
import { clockTime, isPast, recurrenceLabel, relTime, useApp } from '../store';
import { mediaUrl } from '../api/client';

export function ActivityDetailSheet() {
  const openId = useApp(s => s.openActivityId);
  const openActivity = useApp(s => s.openActivity);

  return (
    <BottomSheet open={!!openId} onClose={() => openActivity(null)}>
      {openId ? <Inner key={openId} activityId={openId} /> : null}
    </BottomSheet>
  );
}

function Inner({ activityId }: { activityId: string }) {
  const activity = useApp(s => s.activities.find(a => a.id === activityId));
  const me = useApp(s => s.me());
  const userById = useApp(s => s.userById);
  const joinerIds = useApp(useShallow(s => s.activities.find(a => a.id === activityId)?.joinerIds ?? []));
  const maybeIds  = useApp(useShallow(s => s.activities.find(a => a.id === activityId)?.maybeIds  ?? []));
  const cantIds   = useApp(useShallow(s => s.activities.find(a => a.id === activityId)?.cantIds   ?? []));
  const setRsvp = useApp(s => s.setRsvp);
  const leave = useApp(s => s.leaveActivity);
  const close = useApp(s => s.openActivity);
  // T&S — only relevant when the viewer isn't the host (you can't block/report
  // your own plan; you'd delete it instead).
  const blockUserAction = useApp(s => s.blockUser);
  const openReport = useApp(s => s.openReportSheet);
  const [tab, setTab] = useState<'details' | 'chat'>('details');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  // Outside-click + Escape close for the More popover.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  if (!activity) return null;

  const host = userById(activity.hostId);
  const goingPeople = joinerIds.map(id => userById(id));
  const maybePeople = maybeIds.map(id => userById(id));
  const cantPeople  = cantIds.map(id => userById(id));
  const cat = categoryFor(activity);
  const isHost = activity.hostId === me.id;
  const hasJoined = activity.joinerIds.includes(me.id);
  const hasMaybe  = activity.maybeIds.includes(me.id);
  const hasCant   = activity.cantIds.includes(me.id);
  const myRsvp: 'going' | 'maybe' | 'cant' | 'none' =
    hasJoined ? 'going' : hasMaybe ? 'maybe' : hasCant ? 'cant' : 'none';
  const inParty = isHost || hasJoined;
  const total = 1 + activity.joinerIds.length;
  const full = activity.maxSize ? total >= activity.maxSize : false;
  const over = isPast(activity);

  const onGoing = () => {
    // Only fire confetti when transitioning INTO going from anything else.
    const wasGoing = myRsvp === 'going';
    setRsvp(activity.id, wasGoing ? 'none' : 'going');
    if (!wasGoing) {
      confetti({
        particleCount: 90,
        spread: 70,
        startVelocity: 35,
        origin: { x: 0.5, y: 0.7 },
        colors: ['#fb7185', '#f472b6', '#fb923c', '#facc15', '#ffffff'],
      });
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Hero */}
      <div className={`mx-4 mt-2 relative overflow-hidden rounded-2xl h-36 ${activity.bannerUrl ? 'bg-zinc-900' : `bg-gradient-to-br ${cat.gradient}`}`}>
        {activity.bannerUrl ? (
          <>
            <img
              src={mediaUrl(activity.bannerUrl)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-black/40" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        )}
        <button
          onClick={() => close(null)}
          className="absolute top-2 right-2 h-8 w-8 rounded-full grid place-items-center bg-black/30 text-white backdrop-blur"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        {/* "More" menu — exposes Report plan + Block host. Hidden when I'm the
            host (you can't report/block yourself). Required surface for Apple
            Guideline 1.2 review. */}
        {!isHost && (
          <div ref={moreRef} className="absolute top-2 right-12">
            <button
              onClick={() => setMoreOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="More"
              className="h-8 w-8 rounded-full grid place-items-center bg-black/30 text-white backdrop-blur"
            >
              <MoreHorizontal size={16} />
            </button>
            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  role="menu"
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 mt-1.5 min-w-[180px] rounded-2xl bg-[#15121b]
                             border border-white/10 shadow-2xl shadow-black/60 p-1 z-10"
                >
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      openReport({ kind: 'activity', targetId: activity.id, label: activity.title });
                    }}
                    className="w-full text-left text-[13px] font-medium text-zinc-100 px-2.5 py-2 rounded-xl hover:bg-white/5 flex items-center gap-2"
                  >
                    <AlertTriangle size={14} className="text-amber-300" />
                    Report plan
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      openReport({ kind: 'user', targetId: host.id, label: host.name });
                    }}
                    className="w-full text-left text-[13px] font-medium text-zinc-100 px-2.5 py-2 rounded-xl hover:bg-white/5 flex items-center gap-2"
                  >
                    <AlertTriangle size={14} className="text-amber-300" />
                    Report {host.name}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMoreOpen(false);
                      // Confirm before blocking — blocks remove the friendship
                      // and aren't trivially reversible (an unblock doesn't
                      // restore it). A native confirm keeps this lean.
                      if (confirm(`Block ${host.name}? You won't see each other's plans or messages.`)) {
                        void blockUserAction(host.id);
                        close(null);
                      }
                    }}
                    className="w-full text-left text-[13px] font-medium text-rose-200 px-2.5 py-2 rounded-xl hover:bg-rose-500/10 flex items-center gap-2"
                  >
                    <ShieldOff size={14} />
                    Block {host.name}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
        <div className="absolute top-3 left-4 flex items-center gap-2">
          <span className="text-2xl drop-shadow">{cat.emoji}</span>
          <span className="text-white/90 text-xs font-semibold uppercase tracking-widest">
            {cat.label}
          </span>
          {activity.isPrivate && (
            <span className="ml-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white bg-black/35 backdrop-blur px-1.5 py-0.5 rounded-full">
              <Lock size={9} strokeWidth={3} />
              Private
            </span>
          )}
          {activity.recurrence && (
            <span className="ml-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white bg-black/35 backdrop-blur px-1.5 py-0.5 rounded-full">
              <Repeat size={9} strokeWidth={3} />
              {recurrenceLabel(activity.recurrence)}
            </span>
          )}
          {over && (
            <span className="ml-1 text-[10px] font-bold uppercase tracking-widest text-zinc-100 bg-black/45 backdrop-blur px-1.5 py-0.5 rounded-full">
              Over
            </span>
          )}
        </div>
        <div className="absolute bottom-3 left-4 right-4">
          <div className="text-white text-2xl font-black leading-tight drop-shadow-sm">
            {activity.title}
          </div>
          <div className="text-white/85 text-xs mt-0.5 flex items-center gap-2">
            <Avatar user={host} size={18} />
            <span><strong>{host.name}</strong> hosting</span>
          </div>
        </div>
      </div>

      {/* Tab switch */}
      <div className="mt-3 mx-4 grid grid-cols-2 bg-white/5 border border-white/10 rounded-2xl p-1 relative">
        {(['details', 'chat'] as const).map(t => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="relative py-2 rounded-xl text-sm font-semibold text-zinc-300"
            >
              {active && (
                <motion.div
                  layoutId="detailpill"
                  className="absolute inset-0 bg-white rounded-xl"
                  transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                />
              )}
              <span className={`relative ${active ? 'text-zinc-900' : ''}`}>
                {t === 'details' ? 'Details' : (
                  <span className="inline-flex items-center gap-1">
                    Chat
                    <MessageCircle size={13} />
                    {activity.chat.length > 0 && (
                      <span className={`text-[10px] font-bold ml-0.5 px-1.5 rounded-full
                                       ${active ? 'bg-rose-100 text-rose-600' : 'bg-white/10 text-zinc-300'}`}>
                        {activity.chat.length}
                      </span>
                    )}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative mt-3">
        <AnimatePresence mode="wait">
          {tab === 'details' ? (
            <motion.div
              key="details"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
              // pb-48 so the last name in the "Going / Maybe / Can't" lists can
              // scroll above the sticky action bar (which is taller in the 3-pill
              // RSVP layout — pills + Open chat shortcut + helper text).
              className="absolute inset-0 overflow-y-auto no-scrollbar px-4 pb-48"
            >
              {/* Info rows */}
              <InfoRow icon={<Clock size={16} />} label="When"
                value={`${clockTime(activity.startsAt)} · ${relTime(activity.startsAt)}`} />
              {activity.place && (
                <InfoRow icon={<MapPin size={16} />} label="Where" value={activity.place} />
              )}
              <InfoRow
                icon={<Users size={16} />}
                label="Party"
                value={`${total}${activity.maxSize ? `/${activity.maxSize}` : ''} going${full ? ' · full' : ''}`}
              />

              {/* Tagged squads — only shown if any */}
              {activity.squadIds.length > 0 && (
                <SquadTagRow squadIds={activity.squadIds} isOpenInvite={activity.isOpenInvite} />
              )}

              {/* Reminder — show when participating + not over */}
              {(hasJoined || isHost) && !over && (
                <ReminderRow activity={activity} />
              )}

              {activity.description && (
                <div className="mt-4 p-4 rounded-2xl bg-white/5 border border-white/10 text-zinc-200 text-sm leading-relaxed">
                  {activity.description}
                </div>
              )}

              {/* Reactions */}
              <div className="mt-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">
                  Reactions
                </div>
                <ReactionBar
                  activityId={activity.id}
                  reactions={activity.reactions}
                  size="full"
                />
              </div>

              {/* People — grouped by RSVP */}
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2">
                Going · {1 + goingPeople.length}
              </div>
              <div className="flex flex-col gap-2">
                <PersonRow user={host} badge="host" />
                {goingPeople.map(u => (
                  <PersonRow key={u.id} user={u} />
                ))}
                {goingPeople.length === 0 && !isHost && (
                  <div className="text-zinc-500 text-sm">No one else is going yet. Be the first!</div>
                )}
              </div>

              {maybePeople.length > 0 && (
                <>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2">
                    Maybe · {maybePeople.length}
                  </div>
                  <div className="flex flex-col gap-2">
                    {maybePeople.map(u => (
                      <PersonRow key={u.id} user={u} badge="maybe" />
                    ))}
                  </div>
                </>
              )}

              {cantPeople.length > 0 && (
                <>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-5 mb-2">
                    Can't make it · {cantPeople.length}
                  </div>
                  <div className="flex flex-col gap-2">
                    {cantPeople.map(u => (
                      <PersonRow key={u.id} user={u} badge="cant" />
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          ) : (
            <ChatPane key="chat" activityId={activity.id} canSend={inParty} />
          )}
        </AnimatePresence>
      </div>

      {/* Sticky action bar */}
      {tab === 'details' && (
        <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-4
                        bg-[#0a070f]/95 backdrop-blur-md border-t border-white/10">
          {over ? (
            // Past event — no join/leave/pass-host actions. Just read-only access
            // to the chat (if you were part of it) and a clear "Over" label.
            inParty ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="py-3.5 rounded-2xl font-bold text-zinc-300 bg-white/5 border border-white/10 text-center">
                  ✓ Plan is over
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setTab('chat')}
                  className="py-3.5 rounded-2xl font-bold text-zinc-900 bg-white"
                >
                  <MessageCircle size={16} className="inline mr-1.5 -mt-0.5" />
                  View chat
                </motion.button>
              </div>
            ) : (
              <div className="w-full py-3.5 rounded-2xl font-bold text-zinc-300 bg-white/5 border border-white/10 text-center">
                ✓ This plan is over
              </div>
            )
          ) : isHost ? (
            // Host can't RSVP — they're hosting. Open chat or pass-host & leave.
            <div className="grid grid-cols-2 gap-2">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setTab('chat')}
                className="py-3.5 rounded-2xl font-bold text-zinc-900 bg-white"
              >
                <MessageCircle size={16} className="inline mr-1.5 -mt-0.5" />
                Open chat
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => leave(activity.id)}
                className="py-3.5 rounded-2xl font-bold text-rose-200 bg-rose-500/15 border border-rose-400/30"
              >
                {activity.joinerIds.length === 0 ? (
                  // No joiners to hand off to — leaving dissolves the plan.
                  <><X size={16} className="inline mr-1.5 -mt-0.5" /> End plan</>
                ) : (
                  <><Crown size={16} className="inline mr-1.5 -mt-0.5" /> Pass host &amp; leave</>
                )}
              </motion.button>
            </div>
          ) : (
            // Non-host live event — three RSVP pills + open-chat shortcut when going/maybe.
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-2">
                <RsvpPill
                  label="Going"
                  emoji="✅"
                  active={myRsvp === 'going'}
                  disabled={full && myRsvp !== 'going'}
                  tone="going"
                  onClick={onGoing}
                />
                <RsvpPill
                  label="Maybe"
                  emoji="🤔"
                  active={myRsvp === 'maybe'}
                  tone="maybe"
                  onClick={() => setRsvp(activity.id, myRsvp === 'maybe' ? 'none' : 'maybe')}
                />
                <RsvpPill
                  label="Can't"
                  emoji="✕"
                  active={myRsvp === 'cant'}
                  tone="cant"
                  onClick={() => setRsvp(activity.id, myRsvp === 'cant' ? 'none' : 'cant')}
                />
              </div>
              {(myRsvp === 'going' || myRsvp === 'maybe') && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setTab('chat')}
                  className="w-full py-2.5 rounded-2xl font-bold text-zinc-900 bg-white text-sm"
                >
                  <MessageCircle size={14} className="inline mr-1.5 -mt-0.5" />
                  Open chat
                </motion.button>
              )}
              {full && myRsvp !== 'going' && (
                <div className="text-center text-[11px] text-zinc-400">
                  Going list is full — you can still mark Maybe or Can't.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReminderRow({ activity }: { activity: import('../types').Activity }) {
  const defaultMins = useApp(s => s.settings.defaultReminderMins);
  const setReminder = useApp(s => s.setReminderForActivity);
  const [open, setOpen] = useState(false);
  const current = activity.reminderMins === undefined ? defaultMins : activity.reminderMins;
  // Standard chips + the "use default" option.
  const choices: { mins: number | null; label: string; isDefault?: boolean }[] = [
    { mins: null, label: 'Off' },
    { mins: 5,    label: '5 min before' },
    { mins: 15,   label: '15 min before' },
    { mins: 30,   label: '30 min before' },
    { mins: 60,   label: '1 hour before' },
  ];
  const summary = current === null ? 'Off' : current < 60 ? `${current} min before` : `${current / 60}h before`;
  return (
    <div className="border-b border-white/5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <div className="h-8 w-8 grid place-items-center rounded-xl bg-white/5 text-zinc-300">
          ⏰
        </div>
        <div className="flex-1">
          <div className="text-[10.5px] uppercase tracking-widest text-zinc-500">Reminder</div>
          <div className="text-sm text-zinc-100 font-medium">
            {summary}
            {activity.reminderMins === undefined && (
              <span className="text-[11px] text-zinc-500 normal-case font-normal ml-1">· default</span>
            )}
          </div>
        </div>
        <span className="text-zinc-500 text-lg leading-none">{open ? '▾' : '›'}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="py-2 flex flex-wrap gap-2 pl-11 pr-1">
              {/* "Use default" chip — clears the per-plan override */}
              <button
                onClick={() => setReminder(activity.id, undefined)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition
                            ${activity.reminderMins === undefined
                              ? 'bg-white text-zinc-900 border-white'
                              : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
              >
                Use default
              </button>
              {choices.map(c => {
                const active = activity.reminderMins === c.mins;
                return (
                  <button
                    key={String(c.mins)}
                    onClick={() => setReminder(activity.id, c.mins)}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold border transition
                                ${active
                                  ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400'
                                  : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SquadTagRow({ squadIds, isOpenInvite }: { squadIds: string[]; isOpenInvite: boolean }) {
  const setOverlay = useApp(s => s.openOverlay);
  const squads = useApp(useShallow(s =>
    squadIds.map(id => s.squads.find(x => x.id === id)).filter(Boolean) as { id: string; name: string; emoji: string }[]
  ));
  if (squads.length === 0) return null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5">
      <div className="h-8 w-8 grid place-items-center rounded-xl bg-white/5 text-zinc-300">
        👥
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] uppercase tracking-widest text-zinc-500">
          Shared with {isOpenInvite ? '· also open to all friends' : '· squad only'}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {squads.map(sq => (
            <button
              key={sq.id}
              onClick={() => setOverlay('squads')}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-rose-100 bg-rose-500/20 border border-rose-400/30 hover:bg-rose-500/30 transition"
            >
              <span>{sq.emoji}</span>
              <span>{sq.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5">
      <div className="h-8 w-8 grid place-items-center rounded-xl bg-white/5 text-zinc-300">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-[10.5px] uppercase tracking-widest text-zinc-500">{label}</div>
        <div className="text-sm text-zinc-100 font-medium">{value}</div>
      </div>
    </div>
  );
}

function RsvpPill({
  label, emoji, active, disabled, tone, onClick,
}: {
  label: string;
  emoji: string;
  active: boolean;
  disabled?: boolean;
  tone: 'going' | 'maybe' | 'cant';
  onClick: () => void;
}) {
  const activeCls =
    tone === 'going' ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-400 shadow-[0_10px_30px_-12px_rgba(16,185,129,0.55)]' :
    tone === 'maybe' ? 'bg-gradient-to-br from-sky-500 to-indigo-600 text-white border-sky-400 shadow-[0_10px_30px_-12px_rgba(56,189,248,0.55)]' :
                       'bg-gradient-to-br from-zinc-600 to-zinc-800 text-white border-zinc-500';
  const idleCls = 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10';
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`py-3 rounded-2xl text-sm font-bold border transition flex flex-col items-center justify-center gap-0.5
                  ${disabled ? 'bg-white/[0.02] text-zinc-500 border-white/5 cursor-not-allowed' : active ? activeCls : idleCls}`}
    >
      <span className="text-lg leading-none">{emoji}</span>
      <span className="text-[11px] uppercase tracking-widest">{label}</span>
    </motion.button>
  );
}

function PersonRow({
  user, badge,
}: {
  user: { id: string; name: string; handle: string; avatar: string; color: string; photoUrl?: string };
  badge?: 'host' | 'maybe' | 'cant';
}) {
  const badgeStyles: Record<NonNullable<typeof badge>, { cls: string; label: string }> = {
    host:  { cls: 'text-amber-200 bg-amber-400/15 border-amber-300/30',  label: '👑 Host' },
    maybe: { cls: 'text-sky-200 bg-sky-400/15 border-sky-400/30',        label: '🤔 Maybe' },
    cant:  { cls: 'text-zinc-300 bg-zinc-500/15 border-zinc-500/30',     label: '✕ Can\'t' },
  };
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10">
      <Avatar user={user} size={36} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{user.name}</div>
        <div className="text-xs text-zinc-400 truncate">@{user.handle}</div>
      </div>
      {badge && (
        <span className={`text-[10px] font-bold uppercase tracking-widest border px-2 py-1 rounded-full ${badgeStyles[badge].cls}`}>
          {badgeStyles[badge].label}
        </span>
      )}
    </div>
  );
}

function ChatPane({ activityId, canSend }: { activityId: string; canSend: boolean }) {
  const activity = useApp(s => s.activities.find(a => a.id === activityId));
  const me = useApp(s => s.me());
  const userById = useApp(s => s.userById);
  const sendChat = useApp(s => s.sendChat);
  const sendChatPhoto = useApp(s => s.sendChatPhoto);
  const openPollComposer = useApp(s => s.setPollComposerActivityId);
  const [draft, setDraft] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; preview: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const chatLen = activity?.chat.length ?? 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatLen]);

  // Revoke the staged photo's preview URL when it's replaced or the pane closes.
  useEffect(() => () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview);
  }, [pendingPhoto]);

  if (!activity) return null;

  const hasContent = !!draft.trim() || !!pendingPhoto;

  const submit = () => {
    if (pendingPhoto) {
      // Send the staged photo, with the draft text as an optional caption.
      sendChatPhoto(activityId, pendingPhoto.file, draft.trim() || undefined);
      setPendingPhoto(null);
      setDraft('');
      return;
    }
    if (!draft.trim()) return;
    sendChat(activityId, draft);
    setDraft('');
  };

  // Picking a photo stages it for review — it isn't sent until the user taps send.
  const onPickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendingPhoto({ file, preview: URL.createObjectURL(file) });
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 flex flex-col"
    >
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-4 pb-3">
        {activity.chat.length === 0 && (
          <div className="text-center text-zinc-500 text-sm mt-10">
            No messages yet — say hi 👋
          </div>
        )}
        <div className="flex flex-col gap-2 pt-2">
          {activity.chat.map(m => {
            if (m.authorId === 'system') {
              return (
                <div key={m.id} className="self-center text-[11px] text-zinc-400 bg-white/5 border border-white/10 px-3 py-1 rounded-full">
                  {m.text}
                </div>
              );
            }
            const u = userById(m.authorId);
            const mine = m.authorId === me.id;
            const isPhoto = m.type === 'photo' && m.photoUrl;
            const isPoll  = m.type === 'poll' && m.poll;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
              >
                {!mine && !isPoll && <Avatar user={u} size={26} />}
                {isPoll ? (
                  /* Polls need more room than text bubbles — give them ~94%
                     of the chat width so option labels + vote counters fit cleanly. */
                  <div className="flex flex-col items-stretch gap-1 w-[94%]">
                    {!mine && (
                      <div className="text-[10.5px] font-semibold text-zinc-400 pl-1">{u.name}</div>
                    )}
                    <PollBubble
                      activityId={activityId}
                      message={m}
                      mine={mine}
                      canVote={canSend}
                    />
                  </div>
                ) : isPhoto ? (
                  <div className={`max-w-[78%] overflow-hidden rounded-2xl
                                  ${mine ? 'rounded-br-sm' : 'rounded-bl-sm'}
                                  bg-white/8 border border-white/10`}>
                    {!mine && (
                      <div className="px-3 pt-2 text-[10.5px] font-semibold text-zinc-400">{u.name}</div>
                    )}
                    <img
                      src={mediaUrl(m.photoUrl)}
                      alt={m.text ?? 'shared photo'}
                      className="block max-h-64 w-full object-cover"
                      draggable={false}
                    />
                    {m.text && (
                      <div className={`px-3 py-2 text-sm ${mine ? 'text-white' : 'text-zinc-100'}`}>
                        {m.text}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`max-w-[78%] px-3.5 py-2 rounded-2xl text-sm
                                  ${mine
                                    ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-br-sm shadow-[0_8px_30px_-10px_rgba(244,63,94,0.6)]'
                                    : 'bg-white/8 text-zinc-100 rounded-bl-sm border border-white/5'}`}>
                    {!mine && <div className="text-[10.5px] font-semibold text-zinc-400 mb-0.5">{u.name}</div>}
                    {m.text}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="px-3 pb-safe pt-2 bg-gradient-to-t from-black/80 to-transparent">
        <input
          ref={photoFileRef}
          type="file"
          accept="image/*"
          onChange={onPickPhoto}
          className="hidden"
        />
        {pendingPhoto && (
          <div className="mb-2 flex items-center gap-2.5 bg-white/8 border border-white/10 rounded-2xl p-2">
            <img src={pendingPhoto.preview} alt="" className="h-14 w-14 rounded-xl object-cover" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">Photo ready</div>
              <div className="text-[11px] text-zinc-400">Add a caption if you like, then tap send</div>
            </div>
            <button
              onClick={() => setPendingPhoto(null)}
              aria-label="Remove photo"
              className="h-8 w-8 rounded-full grid place-items-center text-zinc-200 bg-white/10 hover:bg-white/15 shrink-0"
            >
              <X size={15} />
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 bg-white/8 border border-white/10 rounded-full pl-1.5 pr-1.5 py-1.5">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => openPollComposer(activityId)}
            disabled={!canSend}
            aria-label="Create a poll"
            className={`h-9 w-9 rounded-full grid place-items-center transition
                       ${canSend ? 'text-zinc-200 hover:bg-white/10' : 'text-zinc-500'}`}
          >
            <BarChart3 size={16} />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => photoFileRef.current?.click()}
            disabled={!canSend}
            aria-label="Attach a photo"
            className={`h-9 w-9 rounded-full grid place-items-center transition
                       ${canSend ? 'text-zinc-200 hover:bg-white/10' : 'text-zinc-500'}`}
          >
            <Camera size={16} />
          </motion.button>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder={!canSend ? 'Join to chat' : pendingPhoto ? 'Add a caption…' : 'Message the squad...'}
            disabled={!canSend}
            className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none text-sm"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={submit}
            disabled={!canSend || !hasContent}
            className={`h-9 w-9 rounded-full grid place-items-center
                       ${canSend && hasContent
                         ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white'
                         : 'bg-white/10 text-zinc-500'}`}
          >
            <Send size={16} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
