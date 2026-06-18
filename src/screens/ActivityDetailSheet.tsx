import { burst as confetti } from '../lib/confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BarChart3, CalendarPlus, Camera, Check, Clock, Crown, Link2, Loader2, Lock, MapPin, MessageCircle, MoreHorizontal, Pencil, Repeat, Search, Send, Share2, ShieldOff, SmilePlus, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { ImageViewer } from '../components/ImageViewer';
import { PollBubble } from '../components/PollBubble';
import { ReactionBar } from '../components/ReactionBar';
import { categoryFor } from '../data/categories';
import { clockTime, isLiveActivity, isPast, recurrenceLabel, relTime, useApp } from '../store';
import { mediaUrl } from '../api/client';
import { shareInvite } from '../lib/share-invite';
import type { User } from '../types';

export function ActivityDetailSheet() {
  const openId = useApp(s => s.openActivityId);
  const openActivity = useApp(s => s.openActivity);
  // When the opened plan isn't visible to the viewer (a link forwarded by a
  // non-friend), show the "add the host" gate instead of the plan detail.
  const gate = useApp(s => s.planGate);
  const gated = !!gate && gate.activityId === openId;

  return (
    <BottomSheet open={!!openId} onClose={() => openActivity(null)}>
      {!openId ? null
        : gated ? <PlanGate host={gate!.host} onClose={() => openActivity(null)} />
        : <Inner key={openId} activityId={openId} />}
    </BottomSheet>
  );
}

/**
 * Shown when someone opens a plan link they aren't connected to (none of their
 * friends are in it). We never reveal the plan's details — just the host —
 * and offer to add them, which is the path to actually unlocking it.
 */
function PlanGate({ host, onClose }: { host: User | null; onClose: () => void }) {
  const addFriend = useApp(s => s.addFriend);
  const meId = useApp(s => s.meId);
  const isFriend = useApp(s => !!host && s.friendIds.includes(host.id));
  const requested = useApp(s => !!host && s.outgoingRequests.some(r => r.to.id === host.id));
  const isMe = !!host && host.id === meId;

  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-7 pb-8">
      <div className="text-5xl mb-1">🔒</div>
      {host ? <Avatar user={host} size={84} ring /> : null}
      <div className="text-lg font-bold text-white mt-4">You're not in this plan</div>
      <div className="text-sm text-zinc-400 mt-2 leading-relaxed max-w-[290px]">
        {host
          ? <>None of your friends are in this plan yet. <span className="font-semibold text-white">{host.name}</span> invited you — add them to see the details and join.</>
          : <>None of your friends are in this plan, and it’s not shared with you.</>}
      </div>

      {host && !isMe && (
        <div className="mt-6 w-full max-w-[300px]">
          {isFriend ? (
            <div className="text-[13px] text-zinc-400">
              You’re already friends with {host.name} — they may have set this plan to private or a specific squad.
            </div>
          ) : requested ? (
            <div className="text-[13px] text-emerald-300 font-semibold">
              Friend request sent ✓ — once {host.name} accepts, the plan unlocks.
            </div>
          ) : (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => addFriend(host.id)}
              className="w-full py-3.5 rounded-2xl font-bold text-white text-[15px]
                         bg-gradient-to-br from-rose-500 to-orange-500
                         shadow-[0_18px_40px_-14px_rgba(244,63,94,0.6)]
                         inline-flex items-center justify-center gap-2"
            >
              <UserPlus size={16} /> Add {host.name}
            </motion.button>
          )}
        </div>
      )}

      <button
        onClick={onClose}
        className="mt-5 text-sm font-semibold text-zinc-400 hover:text-zinc-200 px-4 py-2"
      >
        Close
      </button>
    </div>
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
  const openEdit = useApp(s => s.setEditActivityId);
  const [tab, setTab] = useState<'details' | 'chat'>('details');
  const [moreOpen, setMoreOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
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
  const live = isLiveActivity(activity);

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
        {/* Share — visible to everyone. Uses the native share sheet so users
            can pop the plan into iMessage, Slack, etc. */}
        <button
          onClick={() => void shareActivity(activity, host.name, isHost)}
          aria-label="Share plan"
          className="absolute top-2 right-12 h-8 w-8 rounded-full grid place-items-center bg-black/30 text-white backdrop-blur"
        >
          <Share2 size={14} />
        </button>
        {/* Edit pencil — host-only. Opens the EditActivitySheet pre-filled
            with this plan's current fields. */}
        {isHost && !over && (
          <button
            onClick={() => openEdit(activity.id)}
            aria-label="Edit plan"
            className="absolute top-2 right-[5.5rem] h-8 w-8 rounded-full grid place-items-center bg-black/30 text-white backdrop-blur"
          >
            <Pencil size={14} />
          </button>
        )}
        {/* "More" menu — exposes Report plan + Block host. Hidden when I'm the
            host (you can't report/block yourself). Required surface for Apple
            Guideline 1.2 review. */}
        {!isHost && (
          <div ref={moreRef} className="absolute top-2 right-[5.5rem]">
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
        {/* Chip row — capped at right-28 so it never collides with the Share
            / Edit / Close action buttons stacked on the right. flex-wrap +
            small gap-y handles the rare case where category label + 2-3
            chips overflow the remaining width (it stacks them onto a
            second row instead of overlapping the buttons). */}
        <div className="absolute top-3 left-4 right-28 flex flex-wrap items-center gap-2 gap-y-1">
          <span className="text-2xl drop-shadow shrink-0">{cat.emoji}</span>
          <span className="text-white/90 text-xs font-semibold uppercase tracking-widest truncate">
            {cat.label}
          </span>
          {activity.isPrivate && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white bg-black/35 backdrop-blur px-1.5 py-0.5 rounded-full">
              <Lock size={9} strokeWidth={3} />
              Private
            </span>
          )}
          {activity.recurrence && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white bg-black/35 backdrop-blur px-1.5 py-0.5 rounded-full">
              <Repeat size={9} strokeWidth={3} />
              {recurrenceLabel(activity.recurrence)}
            </span>
          )}
          {live && (
            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white bg-rose-500/80 backdrop-blur px-1.5 py-0.5 rounded-full">
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-white live-dot" />
              Live
            </span>
          )}
          {over && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-100 bg-black/45 backdrop-blur px-1.5 py-0.5 rounded-full">
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
              onClick={() => { setTab(t); if (t === 'chat') useApp.getState().coachSignal('detail-chat'); }}
              data-coach={t === 'chat' ? 'detail-chat-tab' : undefined}
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
              {/* Primary info — grouped into one glass card with subtle
                  internal dividers. Matches the Settings/Notifications card
                  pattern so the detail surface reads as part of the same
                  visual family. */}
              <div data-coach="detail-info" className="rounded-2xl bg-white/[0.04] border border-white/8 divide-y divide-white/5 overflow-hidden">
                {live ? (
                  <InfoRow
                    icon={<Clock size={16} />}
                    label="Live now"
                    value={liveTimingLabel(activity)}
                  />
                ) : (
                  <InfoRow icon={<Clock size={16} />} label="When"
                    value={`${clockTime(activity.startsAt)} → ${clockTime(activity.endsAt)} · ${relTime(activity.startsAt)}`} />
                )}
                {activity.place && (
                  <InfoRow icon={<MapPin size={16} />} label="Where" value={activity.place} />
                )}
                <InfoRow
                  icon={<Users size={16} />}
                  label="Party"
                  value={`${total}${activity.maxSize ? `/${activity.maxSize}` : ''} going${full ? ' · full' : ''}`}
                />
                {activity.squadIds.length > 0 && (
                  <SquadTagRow squadIds={activity.squadIds} isOpenInvite={activity.isOpenInvite} />
                )}
              </div>

              {/* Host: nudge specific friends to come. Distinct from the
                  initial broadcast — useful when the plan's getting closer
                  and the host wants to personally bug a few more people. */}
              {isHost && !over && (
                <button
                  onClick={() => setInviteOpen(true)}
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                             text-sm font-bold text-white
                             bg-gradient-to-br from-sky-500/90 to-blue-600/90
                             shadow-[0_14px_30px_-14px_rgba(56,189,248,0.55)]
                             active:scale-[0.99] transition"
                >
                  <UserPlus size={16} />
                  Invite friends
                </button>
              )}

              {/* Invite with link — share a personal invite link. A recipient
                  who isn't on WUD / isn't a friend yet lands on the /invite
                  page and is auto-friended on open (store.handleInviteLink),
                  so they can then see and join the plan. */}
              {isHost && !over && (
                <button
                  onClick={() => void shareInvite(me)}
                  className="mt-2 w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                             text-sm font-bold text-zinc-100 bg-white/5 border border-white/10
                             hover:bg-white/10 active:scale-[0.99] transition"
                >
                  <Link2 size={16} className="text-sky-300" />
                  Invite with link
                </button>
              )}

              {/* Add to calendar — exports an .ics that drops the plan into
                  the user's native calendar app. Visible to anyone viewing
                  the plan (not just attendees); hidden once the plan is
                  over since exporting a past event isn't useful. */}
              {!over && (
                <button
                  onClick={() => void addToCalendar(activity, host.name)}
                  className={`${isHost ? 'mt-2' : 'mt-4'} w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl
                             text-sm font-bold text-zinc-100 bg-white/5 border border-white/10
                             hover:bg-white/10 active:scale-[0.99] transition`}
                >
                  <CalendarPlus size={16} className="text-rose-300" />
                  Add to calendar
                </button>
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

              {/* People — grouped by RSVP. Each section header is a small
                  chip with a count, matching the new chip-style headers used
                  in the rest of the app. */}
              <PeopleSectionHeader label="Going" count={1 + goingPeople.length} tone="going" />
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
                  <PeopleSectionHeader label="Maybe" count={maybePeople.length} tone="maybe" />
                  <div className="flex flex-col gap-2">
                    {maybePeople.map(u => (
                      <PersonRow key={u.id} user={u} badge="maybe" />
                    ))}
                  </div>
                </>
              )}

              {cantPeople.length > 0 && (
                <>
                  <PeopleSectionHeader label="Can't make it" count={cantPeople.length} tone="cant" />
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

      {/* Sticky action bar — lighter glass treatment so it reads as part
          of the sheet rather than a heavy footer. The primary action (Open
          chat) is full-width with the brand gradient; destructive / less
          common actions are smaller ghost-square buttons next to it. */}
      {tab === 'details' && (
        <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-4
                        bg-black/40 backdrop-blur-xl border-t border-white/5">
          {over ? (
            // Past event — no join/leave/pass-host actions. Just read-only access
            // to the chat (if you were part of it) and a clear "Over" label.
            inParty ? (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setTab('chat')}
                className="w-full py-3 rounded-2xl font-bold text-white text-sm
                           bg-gradient-to-br from-rose-500 to-orange-500
                           shadow-[0_14px_30px_-12px_rgba(244,63,94,0.5)]
                           inline-flex items-center justify-center gap-1.5"
              >
                <MessageCircle size={15} />
                View chat
              </motion.button>
            ) : (
              <div className="w-full py-3 rounded-2xl font-bold text-zinc-300 bg-white/5 border border-white/10 text-center text-sm">
                ✓ This plan is over
              </div>
            )
          ) : isHost ? (
            // Host — small ghost End plan / Pass host on the left, big primary
            // Open chat filling the rest. Open chat is what hosts actually
            // tap 99% of the time; demote the destructive action visually.
            <div className="flex items-stretch gap-2">
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={() => leave(activity.id)}
                aria-label={activity.joinerIds.length === 0 ? 'End plan' : 'Pass host and leave'}
                className="w-12 grid place-items-center rounded-2xl text-rose-200
                           bg-rose-500/10 border border-rose-400/30 hover:bg-rose-500/15 transition"
              >
                {activity.joinerIds.length === 0
                  ? <X size={16} strokeWidth={2.5} />
                  : <Crown size={16} strokeWidth={2.5} />}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setTab('chat')}
                className="flex-1 py-3 rounded-2xl font-bold text-white text-sm
                           bg-gradient-to-br from-rose-500 to-orange-500
                           shadow-[0_14px_30px_-12px_rgba(244,63,94,0.5)]
                           inline-flex items-center justify-center gap-1.5"
              >
                <MessageCircle size={15} />
                Open chat
              </motion.button>
            </div>
          ) : (
            // Non-host — three RSVP pills. Open chat appears below as a
            // primary CTA once the user is going/maybe (and so has chat
            // access). When the going list is full and the user isn't on it,
            // a small helper line clarifies that Maybe / Can't are still on
            // the table.
            <div className="flex flex-col gap-2">
              <div data-coach="detail-join" className="grid grid-cols-3 gap-2">
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
                  className="w-full py-2.5 rounded-2xl font-bold text-white text-sm
                             bg-gradient-to-br from-rose-500 to-orange-500
                             shadow-[0_14px_30px_-12px_rgba(244,63,94,0.5)]
                             inline-flex items-center justify-center gap-1.5"
                >
                  <MessageCircle size={14} />
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

      {isHost && (
        <InviteFriendsSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          activityId={activity.id}
          activityTitle={activity.title}
          // Only exclude confirmed-going friends — Maybe / Can't / unanswered
          // are all legit re-nudge targets, and re-inviting the same person
          // later is allowed (server-side).
          excludeIds={new Set(activity.joinerIds)}
        />
      )}
    </div>
  );
}

/**
 * Host-only friend picker. Lists my friends excluding anyone already going /
 * maybe, with multi-select + a filter. Submitting fires a plan_invite
 * notification + push to each picked friend via the inviteToActivity store
 * action.
 */
function InviteFriendsSheet({
  open, onClose, activityId, activityTitle, excludeIds,
}: {
  open: boolean;
  onClose: () => void;
  activityId: string;
  activityTitle: string;
  excludeIds: Set<string>;
}) {
  const friends = useApp(useShallow(s => s.friendIds.map(id => s.userById(id))));
  const invite = useApp(s => s.inviteToActivity);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(false);

  // Reset selection + filter every time the sheet opens — picking up where
  // the user left off after dismissing reads as a bug ("I cleared it!").
  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setQ('');
    }
  }, [open]);

  const available = friends.filter(u => !excludeIds.has(u.id));
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? available.filter(u =>
        u.name.toLowerCase().includes(needle) || u.handle.toLowerCase().includes(needle))
    : available;

  const togglePick = (id: string) => {
    setPicked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (picked.size === 0 || sending) return;
    setSending(true);
    try {
      await invite(activityId, Array.from(picked));
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} size="tall" stiff>
      <div className="h-full flex flex-col">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-white/5 shrink-0">
          <button
            onClick={onClose}
            className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-zinc-200 hover:bg-white/5"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <div className="text-base font-bold text-white truncate">Invite to "{activityTitle}"</div>
          <div className="min-w-[36px]" />
        </div>

        <div className="px-5 pt-3 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Filter your friends"
              className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-2xl text-white text-sm placeholder:text-zinc-500
                         focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:border-sky-400/30"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-5 pt-3 pb-4">
          {filtered.length === 0 ? (
            <div className="text-center text-sm text-zinc-400 py-10 leading-relaxed">
              {available.length === 0
                ? 'Everyone in your friend list is already going or marked maybe.'
                : `No friend matches "${q}".`}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map(u => {
                const isPicked = picked.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => togglePick(u.id)}
                    className={`flex items-center gap-3 p-2.5 rounded-2xl border transition text-left
                      ${isPicked
                        ? 'bg-sky-500/15 border-sky-400/50'
                        : 'bg-white/5 border-white/10 hover:bg-white/[0.08]'}`}
                  >
                    <Avatar user={u} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{u.name}</div>
                      <div className="text-[11px] text-zinc-400 truncate">@{u.handle}</div>
                    </div>
                    <div className={`h-6 w-6 rounded-full grid place-items-center shrink-0
                      ${isPicked ? 'bg-sky-400 text-white' : 'border border-white/20'}`}>
                      {isPicked && <Check size={14} strokeWidth={3} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-5 pt-2 pb-[max(env(safe-area-inset-bottom),16px)] border-t border-white/5 shrink-0">
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => void submit()}
            disabled={picked.size === 0 || sending}
            className="w-full py-3 rounded-2xl font-bold text-white text-sm
                       bg-gradient-to-br from-sky-500 to-blue-600
                       shadow-[0_14px_30px_-14px_rgba(56,189,248,0.55)]
                       disabled:opacity-50 disabled:shadow-none
                       inline-flex items-center justify-center gap-2"
          >
            <UserPlus size={15} />
            {sending
              ? 'Sending…'
              : picked.size === 0
                ? 'Pick at least one friend'
                : `Invite ${picked.size} ${picked.size === 1 ? 'friend' : 'friends'}`}
          </motion.button>
        </div>
      </div>
    </BottomSheet>
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
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="h-8 w-8 grid place-items-center rounded-xl bg-rose-500/10 text-rose-300 border border-rose-400/15">
        👥
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] uppercase tracking-widest text-zinc-500 font-semibold">
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

/** "Started Xm ago · Ym left" — used when the activity is currently in its
 *  [startsAt, endsAt] window. Uses "Xh Ym" once the value crosses an hour. */
/** Open the system share sheet for an activity.
 *
 *  Prefers the Capacitor Share plugin on native (iOS/Android) so we get the
 *  real OS UIActivityViewController / Share Intent every time — Capacitor
 *  WKWebView's `navigator.share` can be flaky inside non-standard origins.
 *  Falls back to `navigator.share` on the web, and finally to a clipboard
 *  copy with a toast.
 *
 *  The copy is tailored to the viewer's relationship to the plan:
 *    • Host:    "Come join my plan"
 *    • Non-host: "Come check out {Host}'s plan" — sharing on someone else's
 *      behalf reads weird with "wants you to join their plan".
 *
 *  The URL is the canonical https://whatudoing.app/plan/<id> link — the
 *  server serves a landing page that tries the wud:// deep link and falls
 *  back to the App Store / Play Store if the app isn't installed. */
async function shareActivity(
  activity: import('../types').Activity,
  hostName: string,
  isHost: boolean,
): Promise<void> {
  const url = `https://whatudoing.app/plan/${activity.id}`;
  const text = isHost
    ? `Hey! What U Doing? Come join my plan: "${activity.title}"`
    : `Hey! What U Doing? I want you to come to ${hostName}'s plan: "${activity.title}"`;

  // Capacitor native share — preferred on iOS/Android.
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      const canShare = await Share.canShare();
      if (canShare.value) {
        await Share.share({ title: 'WUD?', text, url, dialogTitle: 'Share plan' });
        return;
      }
    }
  } catch (e) {
    // Capacitor cancel surfaces as a throw — treat as a silent no-op.
    if (looksLikeShareCancel(e)) return;
  }

  // Web fallback — desktop browsers and Capacitor configurations that don't
  // expose the native plugin.
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ title: 'WUD?', text, url });
      return;
    }
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return;
  }

  // Clipboard last-resort.
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    useApp.getState().pushToast('Plan copied to clipboard', 'success');
  } catch {
    useApp.getState().pushToast('Could not share the plan', 'warn');
  }
}

/**
 * Build an RFC-5545 VCALENDAR string for an activity. Returned as a single
 * UTF-8 string ready to write to disk; CRLF line endings are required by the
 * spec and respected by every modern calendar app (Apple, Google, Outlook).
 */
function activityToIcs(activity: import('../types').Activity, hostName: string): string {
  const esc = (s: string) =>
    // ICS text fields require these four characters to be escaped (per
    // RFC 5545 §3.3.11). Order matters — backslash first, the rest after.
    s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const ts = (t: number) => {
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  };
  const url = `https://whatudoing.app/plan/${activity.id}`;
  const description = [
    `${hostName}'s plan on WUD`,
    activity.description ?? '',
    url,
  ].filter(Boolean).join('\n\n');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WUD//WUD App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${activity.id}@wud.app`,
    `DTSTAMP:${ts(Date.now())}`,
    `DTSTART:${ts(activity.startsAt)}`,
    `DTEND:${ts(activity.endsAt)}`,
    `SUMMARY:${esc(activity.title)}`,
    `DESCRIPTION:${esc(description)}`,
    `URL:${url}`,
  ];
  if (activity.place) lines.push(`LOCATION:${esc(activity.place)}`);
  // Map our recurrence variants to iCalendar RRULE so the user's calendar app
  // schedules the same cadence — weekly / biweekly / daily.
  if (activity.recurrence) {
    const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    if (activity.recurrence.freq === 'daily') {
      lines.push('RRULE:FREQ=DAILY');
    } else if (activity.recurrence.freq === 'weekly') {
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${days[activity.recurrence.weekday]}`);
    } else if (activity.recurrence.freq === 'biweekly') {
      lines.push(`RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=${days[activity.recurrence.weekday]}`);
    }
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/**
 * Open the user's native calendar at a prefilled new-event sheet for this
 * plan. On native (iOS/Android) we go through our AddToCalendar plugin
 * which uses EventKit's editor view on iOS and ACTION_INSERT on Android —
 * the user sees their calendar app's normal "add event" UI with everything
 * filled in. On web we fall back to downloading an .ics file the user can
 * open in their desktop calendar app.
 */
async function addToCalendar(activity: import('../types').Activity, hostName: string): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { AddToCalendar } = await import('../lib/add-to-calendar');
      const planUrl = `https://whatudoing.app/plan/${activity.id}`;
      const description = [
        `${hostName}'s plan on WUD`,
        activity.description ?? '',
      ].filter(Boolean).join('\n\n');
      const result = await AddToCalendar.open({
        title: activity.title,
        description,
        location: activity.place || undefined,
        startsAt: activity.startsAt,
        endsAt: activity.endsAt,
        url: planUrl,
      });
      if (result.saved) {
        useApp.getState().pushToast('Added to your calendar', 'success');
      }
      return;
    }
  } catch (e) {
    const msg = (e as { message?: string } | null)?.message ?? '';
    if (/permission/i.test(msg)) {
      useApp.getState().pushToast('Allow Calendar access in Settings to add events', 'warn');
      return;
    }
    // Plugin not installed on this build (older client, web preview) — fall
    // through to the .ics download path.
  }

  // Web fallback — download the .ics so the user can open it in their
  // default desktop calendar app. (Native path above is the supported one;
  // this exists for the browser preview build.)
  const ics = activityToIcs(activity, hostName);
  const filename = `wud-${activity.id.slice(0, 8)}.ics`;
  try {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke after the click has been consumed by the browser; small delay
    // avoids the rare race where revoke kills the URL before download fires.
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    useApp.getState().pushToast('Calendar file downloaded', 'success');
  } catch {
    useApp.getState().pushToast('Could not add to calendar', 'warn');
  }
}

/** Inline reactions row that lives directly below each chat bubble.
 *  Renders existing reactions as grouped chips with counts and a small
 *  smile-plus button that opens a quick picker. Tapping an already-mine
 *  chip removes my reaction; tapping someone else's pile adds me to it.
 *  Hidden entirely when the user can't react (not in the party).
 */
function MessageReactions({
  activityId, messageId, reactions, meId, canReact, mine,
}: {
  activityId: string;
  messageId: string;
  reactions: import('../types').Reaction[];
  meId: string;
  canReact: boolean;
  mine: boolean;
}) {
  const toggle = useApp(s => s.toggleMessageReaction);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Group reactions by emoji, preserving the first-seen order so a chat
  // with three "🔥" reactions before two "❤️" reactions reads in that order.
  const order: string[] = [];
  const agg: Record<string, { count: number; mine: boolean }> = {};
  for (const r of reactions) {
    if (!agg[r.emoji]) { agg[r.emoji] = { count: 0, mine: false }; order.push(r.emoji); }
    agg[r.emoji].count += 1;
    if (r.userId === meId) agg[r.emoji].mine = true;
  }

  if (!canReact && order.length === 0) return null;

  return (
    <div className={`relative flex items-center gap-1 flex-wrap pt-0.5 ${mine ? 'justify-end' : 'justify-start'}`}>
      {order.map(emoji => {
        const { count, mine: isMine } = agg[emoji];
        return (
          <button
            key={emoji}
            onClick={() => canReact && toggle(activityId, messageId, emoji)}
            disabled={!canReact}
            aria-pressed={isMine}
            className={`inline-flex items-center gap-1 h-6 px-1.5 rounded-full text-[11px] font-semibold border transition
                        ${isMine
                          ? 'bg-rose-500/20 border-rose-400/50 text-rose-100'
                          : 'bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10'}
                        disabled:opacity-60 disabled:cursor-default`}
          >
            <span className="text-[12px] leading-none">{emoji}</span>
            <span className="tabular-nums leading-none">{count}</span>
          </button>
        );
      })}
      {canReact && (
        <button
          onClick={() => setPickerOpen(v => !v)}
          aria-label="Add reaction"
          className="h-6 w-6 grid place-items-center rounded-full bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition"
        >
          <SmilePlus size={11} />
        </button>
      )}

      {/* Quick picker — six default emojis, no popup chrome since the row
          itself is intimate. Click-away catcher anchors the dismissal so
          tapping elsewhere on the bubble closes it. */}
      <AnimatePresence>
        {pickerOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onClick={() => setPickerOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className={`absolute z-40 glass-strong rounded-2xl p-1.5 shadow-xl flex gap-1
                          ${mine ? 'right-0' : 'left-0'}`}
              style={{ bottom: 'calc(100% + 6px)' }}
            >
              {QUICK_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    toggle(activityId, messageId, emoji);
                    setPickerOpen(false);
                  }}
                  className={`h-8 w-8 grid place-items-center rounded-xl text-base transition
                              ${agg[emoji]?.mine ? 'bg-rose-500/20 ring-1 ring-rose-400/50' : 'hover:bg-white/10'}`}
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

const QUICK_REACTIONS = ['👍', '❤️', '🔥', '😂', '🎉', '🙏'];

/** Stable empty reference for the pendingMessages selector. A fresh `[]`
 *  literal inside `useApp(...)` makes React's useSyncExternalStore think
 *  the snapshot changed on every render — getSnapshot warning + infinite
 *  loop. Returning the same array when the slice is missing avoids both. */
const EMPTY_PENDING: import('../types').ChatMessage[] = [];

/** Combine the canonical chat list with optimistic placeholders, deduping
 *  any placeholder whose content the server has already echoed back. The
 *  brief window where both are present comes from the realtime push (which
 *  refreshes activity.chat) arriving a few ms before our send-side cleanup;
 *  matching on author + content + time window hides the duplicate without
 *  needing the server to know the client's localId. */
function mergePending(
  chat: import('../types').ChatMessage[],
  pending: import('../types').ChatMessage[],
): import('../types').ChatMessage[] {
  if (pending.length === 0) return chat;
  // Only check the tail — confirmed messages from way back can't possibly
  // match a placeholder that was just sent.
  const tail = chat.slice(-Math.max(pending.length * 2, 6));
  const live = pending.filter(p =>
    !tail.some(c =>
      c.authorId === p.authorId &&
      (c.type ?? 'text') === (p.type ?? 'text') &&
      (c.text ?? '') === (p.text ?? '') &&
      // Same type → either both text/poll (no photoUrl), or both photo. We
      // can't compare photo URLs because the server returns a different URL
      // from the local blob: URL, so trust author + caption + time window.
      Math.abs(c.at - p.at) < 30_000,
    ),
  );
  return [...chat, ...live];
}

function looksLikeShareCancel(e: unknown): boolean {
  const msg = (e as { message?: string } | null)?.message?.toLowerCase() ?? '';
  return msg.includes('cancel') || msg.includes('abort');
}

function liveTimingLabel(a: import('../types').Activity): string {
  const now = Date.now();
  const sinceStart = Math.max(0, now - a.startsAt);
  const untilEnd = Math.max(0, a.endsAt - now);
  const fmt = (ms: number) => {
    const m = Math.round(ms / 60_000);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
  };
  return `Started ${fmt(sinceStart)} ago · ${fmt(untilEnd)} left`;
}

/** Small chip-style section header for the Going / Maybe / Can't groups.
 *  Tone tints the count pill to match the badge style used on PersonRow,
 *  so a glance at the page reads as visually consistent. */
function PeopleSectionHeader({
  label, count, tone,
}: { label: string; count: number; tone: 'going' | 'maybe' | 'cant' }) {
  const countCls =
    tone === 'going' ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30' :
    tone === 'maybe' ? 'bg-sky-400/15 text-sky-200 border-sky-400/30' :
                       'bg-zinc-500/15 text-zinc-300 border-zinc-500/30';
  return (
    <div className="mt-5 mb-2 flex items-center gap-2">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-300 font-bold">
        {label}
      </div>
      <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full border ${countCls}`}>
        {count}
      </span>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="h-8 w-8 grid place-items-center rounded-xl bg-rose-500/10 text-rose-300 border border-rose-400/15">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10.5px] uppercase tracking-widest text-zinc-500 font-semibold">{label}</div>
        <div className="text-sm text-zinc-100 font-medium truncate">{value}</div>
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
  // Going is the primary positive action — keep the full gradient fill so
  // it pops. Maybe + Can't are softer states; use subtle tints so the
  // bottom bar doesn't compete with the rest of the screen visually.
  const activeCls =
    tone === 'going'
      ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-emerald-400 shadow-[0_10px_30px_-12px_rgba(16,185,129,0.55)]'
      : tone === 'maybe'
        ? 'bg-sky-400/15 text-sky-100 border-sky-400/40'
        : 'bg-zinc-500/15 text-zinc-200 border-zinc-400/30';
  const idleCls = 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10';
  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={`py-2.5 rounded-2xl text-sm font-bold border transition flex items-center justify-center gap-1.5
                  ${disabled ? 'bg-white/[0.02] text-zinc-500 border-white/5 cursor-not-allowed' : active ? activeCls : idleCls}`}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="text-[12px] font-bold tracking-wide">{label}</span>
    </motion.button>
  );
}

function PersonRow({
  user, badge,
}: {
  user: { id: string; name: string; handle: string; avatar: string; color: string; photoUrl?: string };
  badge?: 'host' | 'maybe' | 'cant';
}) {
  const openProfile = useApp(s => s.openProfile);
  const badgeStyles: Record<NonNullable<typeof badge>, { cls: string; label: string }> = {
    host:  { cls: 'text-amber-200 bg-amber-400/15 border-amber-300/30',  label: '👑 Host' },
    maybe: { cls: 'text-sky-200 bg-sky-400/15 border-sky-400/30',        label: '🤔 Maybe' },
    cant:  { cls: 'text-zinc-300 bg-zinc-500/15 border-zinc-500/30',     label: '✕ Can\'t' },
  };
  // Tap a person to open their profile (stats + add-friend) — the main way to
  // friend someone you only know from sharing an event.
  return (
    <button
      onClick={() => openProfile(user.id)}
      className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10
                 hover:bg-white/10 active:bg-white/[0.13] transition text-left"
    >
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
    </button>
  );
}

function ChatPane({ activityId, canSend }: { activityId: string; canSend: boolean }) {
  const activity = useApp(s => s.activities.find(a => a.id === activityId));
  const me = useApp(s => s.me());
  const userById = useApp(s => s.userById);
  const sendChat = useApp(s => s.sendChat);
  const sendChatPhoto = useApp(s => s.sendChatPhoto);
  const openPollComposer = useApp(s => s.setPollComposerActivityId);
  // Optimistic placeholders queued by sendChat / sendChatPhoto / sendPoll —
  // rendered alongside the canonical chat list while their API calls are in
  // flight, then cleared by the store once the server confirms.
  const pendingMessages = useApp(s => s.pendingMessages[`activity:${activityId}`] ?? EMPTY_PENDING);
  const [draft, setDraft] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; preview: string } | null>(null);
  // Photo viewer state — null when closed; the resolved media URL when open.
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const chatLen = activity?.chat.length ?? 0;
  const pendingLen = pendingMessages.length;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatLen, pendingLen]);

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
      <div ref={scrollRef} data-coach="detail-chat-body" className="flex-1 overflow-y-auto no-scrollbar px-4 pb-3 relative">
        {/* Privacy gate — non-members see a blurred preview of the chat
            with an overlay nudging them to join. Sender / message text
            isn't readable through the blur (8px is enough to soft-kerning
            obscure ASCII) and the absolute overlay catches all pointer
            events so a non-member can't click into a bubble. */}
        {!canSend && (activity.chat.length > 0 || pendingMessages.length > 0) && (
          <div className="sticky top-0 z-10 pointer-events-none">
            <div className="absolute inset-x-0 top-10 grid place-items-center pointer-events-auto">
              <div className="px-4 py-3 rounded-2xl bg-[#15121b]/85 backdrop-blur-lg
                              border border-white/10 shadow-2xl shadow-black/60 text-center
                              max-w-[280px]">
                <Lock size={16} className="text-rose-300 mx-auto mb-1.5" />
                <div className="text-sm font-bold text-white">Chat is for the crew</div>
                <div className="text-[12px] text-zinc-300 mt-0.5 leading-snug">
                  Join the plan to see messages, photos, and polls.
                </div>
              </div>
            </div>
          </div>
        )}
        {activity.chat.length === 0 && pendingMessages.length === 0 && (
          <div className="text-center text-zinc-500 text-sm mt-10">
            No messages yet — say hi 👋
          </div>
        )}
        <div
          className={`flex flex-col gap-2 pt-2 transition-[filter] duration-200
                     ${!canSend ? 'blur-sm select-none pointer-events-none' : ''}`}
        >
          {mergePending(activity.chat, pendingMessages).map(m => {
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
            const isPending = m.pending === true;
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: isPending ? 0.65 : 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
              >
                {!mine && !isPoll && <Avatar user={u} size={26} />}
                {/* Sending spinner — sits on the OPPOSITE side of the bubble
                    from the avatar so it's not visually competing with the
                    sender stamp. For mine messages (right-aligned) it goes
                    on the left of the bubble. */}
                {isPending && mine && (
                  <span aria-label="Sending" className="text-zinc-400">
                    <Loader2 size={12} className="animate-spin" />
                  </span>
                )}
                {/* Bubble + reactions stacked vertically so the reactions
                    row sits flush below the bubble without breaking the
                    chat row's avatar-aligned layout. */}
                <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'} max-w-[94%]`}>
                  {isPoll ? (
                    /* Polls need more room than text bubbles — fill almost
                       the whole bubble width so option labels + vote
                       counters fit cleanly. */
                    <div className="flex flex-col items-stretch gap-1 w-full">
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
                    <div className={`max-w-[330px] overflow-hidden rounded-2xl
                                    ${mine ? 'rounded-br-sm' : 'rounded-bl-sm'}
                                    bg-white/8 border border-white/10`}>
                      {!mine && (
                        <div className="px-3 pt-2 text-[10.5px] font-semibold text-zinc-400">{u.name}</div>
                      )}
                      <button
                        onClick={() => setViewerSrc(mediaUrl(m.photoUrl) ?? null)}
                        className="block w-full"
                        aria-label="Open photo"
                      >
                        <img
                          src={mediaUrl(m.photoUrl)}
                          alt={m.text ?? 'shared photo'}
                          className="block max-h-64 w-full object-cover"
                          draggable={false}
                        />
                      </button>
                      {m.text && (
                        <div className={`px-3 py-2 text-sm ${mine ? 'text-white' : 'text-zinc-100'}`}>
                          {m.text}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`max-w-[330px] px-3.5 py-2 rounded-2xl text-sm
                                    ${mine
                                      ? 'bg-gradient-to-br from-rose-500 to-pink-500 text-white rounded-br-sm shadow-[0_8px_30px_-10px_rgba(244,63,94,0.6)]'
                                      : 'bg-white/8 text-zinc-100 rounded-bl-sm border border-white/5'}`}>
                      {!mine && <div className="text-[10.5px] font-semibold text-zinc-400 mb-0.5">{u.name}</div>}
                      {m.text}
                    </div>
                  )}

                  {/* Reactions row sits below the bubble for every
                      non-pending, non-system message. Hidden on pending so
                      a user can't try to react to a message that hasn't
                      hit the server yet. */}
                  {!isPending && (
                    <MessageReactions
                      activityId={activityId}
                      messageId={m.id}
                      reactions={m.reactions ?? []}
                      meId={me.id}
                      canReact={canSend}
                      mine={mine}
                    />
                  )}
                </div>
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

      {/* Photo viewer — wrapped in AnimatePresence so the fade animates. */}
      <AnimatePresence>
        {viewerSrc && (
          <ImageViewer src={viewerSrc} onClose={() => setViewerSrc(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
