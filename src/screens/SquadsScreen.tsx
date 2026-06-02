import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Camera, ChevronLeft, ChevronRight, Crown, LogOut, MessageCircle, Pencil, Plus, Send, Trash2, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ActivityCard } from '../components/ActivityCard';
import { Avatar, AvatarStack } from '../components/Avatar';
import { ImageViewer } from '../components/ImageViewer';
import { PulseButton } from '../components/PulseButton';
import { SwipeBackPage } from '../components/SwipeBackPage';
import { categoryFor } from '../data/categories';
import { clockTime, relTime, useApp } from '../store';
import { mediaUrl } from '../api/client';
import type { Activity, User } from '../types';

type Mode =
  | { type: 'list' }
  | { type: 'detail'; squadId: string; tab: SquadTab }
  | { type: 'edit'; squadId: string }
  | { type: 'create' };

type SquadTab = 'plans' | 'history' | 'members' | 'chat';

// Each mode lives at a "depth." Deeper modes are pushed on top of shallower
// ones (list=0, detail/create=1, edit=2). Going deeper is a forward push
// (new slides in from right, on top); going shallower is a back-pop (old
// slides off to the right, on top, revealing what was underneath).
const depthOf = (m: Mode): number =>
  m.type === 'list' ? 0
  : m.type === 'detail' || m.type === 'create' ? 1
  : 2;

// Custom direction is +1 for push, -1 for pop. Variants give the entering
// page top z-index on a push and the exiting page top z-index on a pop —
// that's what makes the transition feel like a real stack instead of a
// crossfade between two unrelated screens.
const pageSlide = {
  enter:  (dir: 1 | -1) => ({ x: dir > 0 ? '100%'  : '-100%', zIndex: dir > 0 ? 2 : 1 }),
  center: (dir: 1 | -1) => ({ x: 0,                            zIndex: dir > 0 ? 2 : 1 }),
  exit:   (dir: 1 | -1) => ({ x: dir > 0 ? '-100%' : '100%',  zIndex: dir > 0 ? 1 : 2 }),
};
const pageTransition = { type: 'spring' as const, stiffness: 360, damping: 36 };

export function SquadsScreen() {
  const openOverlay = useApp(s => s.openOverlay);
  const closeOverlay = () => openOverlay(null);
  // If the overlay was opened with a focus target (Feed rail tap), drop
  // straight to that squad's detail page; otherwise land on the list.
  // Consumed lazily inside useState's initializer so the focus is cleared
  // exactly once, before the first render commits.
  const [mode, setMode] = useState<Mode>(() => {
    const focusId = useApp.getState().consumeSquadFocus();
    return focusId ? { type: 'detail', squadId: focusId, tab: 'plans' } : { type: 'list' };
  });
  const [direction, setDirection] = useState<1 | -1>(1);

  // Direction is set at navigation time from the depth delta, so each
  // transition slides the right way without any per-callsite plumbing.
  const go = (next: Mode) => {
    setDirection(depthOf(next) >= depthOf(mode) ? 1 : -1);
    setMode(next);
  };

  // Resolve squad for header titles / host-only edit affordance.
  const sqId = mode.type === 'detail' || mode.type === 'edit' ? mode.squadId : null;
  const sq = useApp(s => (sqId ? s.squads.find(x => x.id === sqId) : undefined));
  const isHostOfMode = useApp(s => (mode.type === 'detail' ? s.isSquadHost(mode.squadId) : false));

  // Per-mode header bits.
  let title: string;
  let onClose: () => void;
  let trailing: ReactNode = null;
  if (mode.type === 'create') {
    title = 'New squad';
    onClose = () => go({ type: 'list' });
  } else if (mode.type === 'edit') {
    title = 'Edit squad';
    onClose = () => go({ type: 'detail', squadId: mode.squadId, tab: 'members' });
  } else if (mode.type === 'detail') {
    title = sq ? `${sq.emoji} ${sq.name}` : 'Squad';
    onClose = () => go({ type: 'list' });
    if (isHostOfMode) {
      trailing = (
        <button
          onClick={() => go({ type: 'edit', squadId: mode.squadId })}
          aria-label="Edit squad"
          className="h-9 w-9 grid place-items-center rounded-full bg-white/10 text-white"
        >
          <Pencil size={16} />
        </button>
      );
    }
  } else {
    title = 'Squads';
    onClose = closeOverlay;
    trailing = (
      <button
        onClick={() => go({ type: 'create' })}
        aria-label="Create squad"
        className="h-9 w-9 grid place-items-center rounded-full bg-white text-zinc-900"
      >
        <Plus size={18} />
      </button>
    );
  }

  // Distinct key per mode so AnimatePresence treats each as its own page.
  const pageKey =
    mode.type === 'detail' ? `detail-${mode.squadId}`
    : mode.type === 'edit'  ? `edit-${mode.squadId}`
    : mode.type;

  return (
    // Outer = overlay-level open/close (mirrors OverlayShell's spring).
    // Kept inline (vs reusing OverlayShell) so the header can update across
    // mode changes without remounting the shell — that's what stops the
    // profile-page flash between list → detail. Swipe-right always closes
    // the whole overlay; mode-level pop happens via the chevron.
    <SwipeBackPage
      onBack={closeOverlay}
      transition={pageTransition}
      className="absolute inset-0 z-40 bg-[#07060b] flex flex-col"
    >
      {/* Header — content swaps in place while the shell stays mounted. */}
      <div className="pt-status px-3 pb-3 flex items-center justify-between border-b border-white/5 relative z-10">
        <button
          onClick={onClose}
          className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-white hover:bg-white/5"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-base font-bold text-white truncate px-2">{title}</div>
        <div className="min-w-[36px] flex justify-end">{trailing}</div>
      </div>

      {/* Page stack — absolutely-positioned pages slide push/pop within. */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={pageKey}
            custom={direction}
            variants={pageSlide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0 overflow-y-auto no-scrollbar bg-[#07060b]"
          >
            {mode.type === 'list' && (
              <SquadsListBody onOpen={(id) => go({ type: 'detail', squadId: id, tab: 'plans' })} />
            )}
            {mode.type === 'detail' && (
              <SquadDetailBody
                squadId={mode.squadId}
                initialTab={mode.tab}
                onMissing={() => go({ type: 'list' })}
              />
            )}
            {mode.type === 'edit' && (
              <SquadEditor
                squadId={mode.squadId}
                onDone={() => go({ type: 'detail', squadId: mode.squadId, tab: 'members' })}
              />
            )}
            {mode.type === 'create' && <SquadEditor onDone={() => go({ type: 'list' })} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </SwipeBackPage>
  );
}

/* ─────────────────────────── List of squads ─────────────────────────── */

// Body-only — the surrounding shell/header live in SquadsScreen so the
// shell stays mounted across mode changes (no profile-page flash).
function SquadsListBody({ onOpen }: { onOpen: (id: string) => void }) {
  // Only show squads I'm in (host or member).
  const squads = useApp(useShallow(s =>
    s.squads.filter(sq => sq.hostId === s.meId || sq.memberIds.includes(s.meId))
  ));
  const meId = useApp(s => s.meId);
  const userById = useApp(s => s.userById);

  return (
    <div className="px-4 pt-4 pb-32">
        <div className="text-[11px] text-zinc-500 mb-3 px-1">
          Squads are named subsets of friends. Share a plan or chat with just one group — events
          you share with a squad show up in its Plans tab.
        </div>

        <div className="flex flex-col gap-2">
          {squads.length === 0 && (
            <div className="text-center text-zinc-500 text-sm mt-10">
              You're not in any squads yet — tap + to create one.
            </div>
          )}
          {squads.map(sq => {
            const isHost = sq.hostId === meId;
            const host = userById(sq.hostId);
            const everyone = [host, ...sq.memberIds.map(id => userById(id))];
            return (
              <motion.button
                key={sq.id}
                whileTap={{ scale: 0.985 }}
                onClick={() => onOpen(sq.id)}
                className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-left"
              >
                <div className="h-11 w-11 rounded-xl grid place-items-center text-2xl bg-gradient-to-br from-rose-500/30 to-orange-500/30 border border-rose-400/30">
                  {sq.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <div className="text-sm font-bold text-white truncate">{sq.name}</div>
                    {isHost ? (
                      <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full bg-amber-400/15 text-amber-200 border border-amber-300/30">
                        👑 Host
                      </span>
                    ) : (
                      <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-full bg-white/5 text-zinc-300 border border-white/10">
                        Member
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 truncate">
                    {everyone.length} {everyone.length === 1 ? 'person' : 'people'}
                    {!isHost && <> · hosted by <span className="text-zinc-300 font-medium">{host.name}</span></>}
                  </div>
                </div>
                <AvatarStack users={everyone} size={22} max={3} />
                <ChevronRight size={16} className="text-zinc-500" />
              </motion.button>
            );
          })}
        </div>
      </div>
  );
}

/* ─────────────────────────── Detail (tabs) ─────────────────────────── */

// Body-only — header (title, back, edit) is rendered by SquadsScreen so the
// shell can stay mounted across mode changes.
function SquadDetailBody({
  squadId, initialTab, onMissing,
}: {
  squadId: string; initialTab: SquadTab;
  onMissing: () => void;
}) {
  const sq = useApp(s => s.squads.find(x => x.id === squadId));
  const inSquad = useApp(s => s.amInSquad(squadId));
  const [tab, setTab] = useState<SquadTab>(initialTab);

  // If the squad disappeared mid-view (deleted / I was removed), pop back to
  // the list once on the next tick. Render a soft fallback in the meantime.
  useEffect(() => {
    if (!sq || !inSquad) onMissing();
  }, [sq, inSquad, onMissing]);

  if (!sq || !inSquad) {
    return (
      <div className="px-5 py-12 text-center text-zinc-400 text-sm">
        You're no longer in this squad.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
        {/* Tabs */}
        <div className="px-4 pt-3">
          <div className="grid grid-cols-4 bg-white/5 border border-white/10 rounded-2xl p-1 relative">
            {([
              { key: 'plans',   label: 'Plans',   icon: Calendar },
              { key: 'history', label: 'History', icon: Calendar },
              { key: 'members', label: 'People',  icon: Users },
              { key: 'chat',    label: 'Chat',    icon: MessageCircle },
            ] as const).map(t => {
              const active = tab === t.key;
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="relative py-2 rounded-xl text-[12px] font-semibold text-zinc-300"
                >
                  {active && (
                    <motion.div
                      layoutId="squadtabpill"
                      className="absolute inset-0 bg-white rounded-xl"
                      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                    />
                  )}
                  <span className={`relative inline-flex items-center gap-1 ${active ? 'text-zinc-900' : ''}`}>
                    <Icon size={12} />
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body — flex-1 so each pane can manage its own scroll */}
        <div className="flex-1 relative overflow-hidden mt-3">
          <AnimatePresence mode="wait">
            {tab === 'plans'   && <PlansPane   key="plans"   squadId={squadId} mode="upcoming" />}
            {tab === 'history' && <PlansPane   key="history" squadId={squadId} mode="past" />}
            {tab === 'members' && <MembersPane key="members" squadId={squadId} />}
            {tab === 'chat'    && <SquadChatPane key="chat"  squadId={squadId} />}
          </AnimatePresence>
        </div>
      </div>
  );
}

/* ─────────────────────────── Plans / History tab ─────────────────────────── */

function PlansPane({ squadId, mode }: { squadId: string; mode: 'upcoming' | 'past' }) {
  const items = useApp(useShallow(s => {
    const cutoff = Date.now();
    const all = s.activities.filter(a => a.squadIds.includes(squadId));
    return mode === 'upcoming'
      ? all.filter(a => a.startsAt >= cutoff).sort((a, b) => a.startsAt - b.startsAt)
      : all.filter(a => a.startsAt <  cutoff).sort((a, b) => b.startsAt - a.startsAt);
  }));
  const openActivity = useApp(s => s.openActivity);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 overflow-y-auto no-scrollbar px-4 pb-32"
    >
      {items.length === 0 ? (
        <div className="text-center mt-12">
          <div className="text-5xl mb-3">{mode === 'upcoming' ? '🗓️' : '📭'}</div>
          <div className="text-white font-semibold">
            {mode === 'upcoming' ? 'No upcoming squad plans' : 'No past squad plans'}
          </div>
          <div className="text-sm text-zinc-400 mt-1">
            {mode === 'upcoming'
              ? 'Post a plan and tag this squad to see it here.'
              : 'Once squad plans wrap, they\'ll land here.'}
          </div>
        </div>
      ) : mode === 'upcoming' ? (
        <div className="flex flex-col gap-3 pt-1">
          {items.map(a => <ActivityCard key={a.id} activity={a} />)}
        </div>
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          {items.map(a => <PastRow key={a.id} activity={a} onOpen={() => openActivity(a.id)} />)}
        </div>
      )}
    </motion.div>
  );
}

function PastRow({ activity, onOpen }: { activity: Activity; onOpen: () => void }) {
  const cat = categoryFor(activity);
  const meId = useApp(s => s.meId);
  const host = useApp(s => s.userById(activity.hostId));
  const isHost = activity.hostId === meId;
  const total = 1 + activity.joinerIds.length;
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
    >
      <div className={`relative h-11 w-11 rounded-xl overflow-hidden grid place-items-center text-2xl bg-gradient-to-br ${cat.gradient}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        <span className="relative drop-shadow">{cat.emoji}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{activity.title}</div>
        <div className="text-[11px] text-zinc-400 truncate">
          {clockTime(activity.startsAt)} · {relTime(activity.startsAt)} · {isHost ? 'you hosted' : `${host.name} hosted`} · {total} {total === 1 ? 'person' : 'people'}
        </div>
      </div>
    </motion.button>
  );
}

/* ─────────────────────────── Members tab ─────────────────────────── */

function MembersPane({ squadId }: { squadId: string }) {
  const sq = useApp(s => s.squads.find(x => x.id === squadId)!);
  const meId = useApp(s => s.meId);
  const isHost = useApp(s => s.isSquadHost(squadId));
  const userById = useApp(s => s.userById);
  const removeMember = useApp(s => s.removeMemberFromSquad);
  const addMember = useApp(s => s.addMemberToSquad);
  const leaveSquad = useApp(s => s.leaveSquad);
  const deleteSquad = useApp(s => s.deleteSquad);
  const friendIds = useApp(s => s.friendIds);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const host = userById(sq.hostId);
  const members = sq.memberIds.map(id => userById(id));
  const addableFriends = friendIds
    .filter(id => id !== sq.hostId && !sq.memberIds.includes(id))
    .map(id => userById(id));

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.18 }}
      className="absolute inset-0 overflow-y-auto no-scrollbar px-4 pb-32"
    >
      {/* Host row */}
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-1 mb-2">Host</div>
      <PersonRow user={host} badge="host" />

      {/* Members list */}
      <div className="flex items-center justify-between mt-5 mb-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">
          Members · {members.length}
        </div>
        {isHost && addableFriends.length > 0 && (
          <button
            onClick={() => setShowAdd(v => !v)}
            className="text-[11px] uppercase tracking-[0.18em] font-bold text-rose-300"
          >
            {showAdd ? 'Done' : '+ Add'}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {members.length === 0 && (
          <div className="text-sm text-zinc-500">No members yet.{isHost && ' Tap + Add to invite friends.'}</div>
        )}
        {members.map(u => (
          <PersonRow
            key={u.id}
            user={u}
            trailing={
              isHost ? (
                <RemoveMemberButton onConfirm={() => removeMember(squadId, u.id)} />
              ) : u.id === meId ? (
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300 bg-white/5 border border-white/10 px-2 py-1 rounded-full">
                  You
                </span>
              ) : undefined
            }
          />
        ))}
      </div>

      {/* Host-only: add picker */}
      <AnimatePresence initial={false}>
        {isHost && showAdd && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden mt-4"
          >
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">
              Add a friend
            </div>
            {addableFriends.length === 0 ? (
              <div className="text-sm text-zinc-500">All your friends are already in this squad.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {addableFriends.map(u => (
                  <button
                    key={u.id}
                    onClick={() => addMember(squadId, u.id)}
                    className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-left"
                  >
                    <Avatar user={u} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{u.name}</div>
                      <div className="text-[11px] text-zinc-400 truncate">@{u.handle}</div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-white bg-gradient-to-br from-rose-500 to-orange-500">
                      <UserPlus size={12} /> Add
                    </span>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer actions */}
      <div className="mt-8 border-t border-white/5 pt-5">
        {isHost ? (
          <div className="text-[11px] uppercase tracking-[0.18em] text-rose-300/80 mb-2">
            Danger zone
          </div>
        ) : (
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">
            Membership
          </div>
        )}

        {isHost ? (
          !confirmingDelete ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setConfirmingDelete(true)}
              className="w-full py-3 rounded-2xl text-sm font-bold text-rose-200 bg-rose-500/10 border border-rose-400/30 inline-flex items-center justify-center gap-2"
            >
              <Trash2 size={14} /> Delete this squad
            </motion.button>
          ) : (
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => { deleteSquad(squadId); }}
                className="flex-1 py-3 rounded-2xl font-bold text-white bg-rose-500"
              >
                Confirm delete
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setConfirmingDelete(false)}
                className="px-4 py-3 rounded-2xl font-bold text-zinc-300 bg-white/5 border border-white/10"
              >
                Cancel
              </motion.button>
            </div>
          )
        ) : !confirmingLeave ? (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setConfirmingLeave(true)}
            className="w-full py-3 rounded-2xl text-sm font-bold text-rose-200 bg-white/5 border border-white/10 inline-flex items-center justify-center gap-2"
          >
            <LogOut size={14} /> Leave squad
          </motion.button>
        ) : (
          <div className="flex gap-2">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => leaveSquad(squadId)}
              className="flex-1 py-3 rounded-2xl font-bold text-white bg-rose-500"
            >
              Yes, leave {sq.name}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setConfirmingLeave(false)}
              className="px-4 py-3 rounded-2xl font-bold text-zinc-300 bg-white/5 border border-white/10"
            >
              Cancel
            </motion.button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function PersonRow({
  user, badge, trailing,
}: {
  user: User;
  badge?: 'host';
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10">
      <Avatar user={user} size={36} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{user.name}</div>
        <div className="text-[11px] text-zinc-400 truncate">@{user.handle}</div>
      </div>
      {badge === 'host' && (
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-200 bg-amber-400/15 border border-amber-300/30 px-2 py-1 rounded-full inline-flex items-center gap-1">
          <Crown size={10} /> Host
        </span>
      )}
      {trailing}
    </div>
  );
}

function RemoveMemberButton({ onConfirm }: { onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="text-[11px] font-bold uppercase tracking-widest text-zinc-300 bg-white/5 border border-white/10 hover:bg-white/10 px-2 py-1 rounded-full"
      >
        Remove
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onConfirm}
        className="text-[10.5px] font-bold uppercase tracking-widest text-white bg-rose-500 px-2 py-1 rounded-full"
      >
        Confirm
      </button>
      <button
        onClick={() => setConfirming(false)}
        className="text-[10.5px] font-bold uppercase tracking-widest text-zinc-300 bg-white/5 border border-white/10 px-2 py-1 rounded-full"
      >
        Cancel
      </button>
    </div>
  );
}

/* ─────────────────────────── Chat tab ─────────────────────────── */

function SquadChatPane({ squadId }: { squadId: string }) {
  const sq = useApp(s => s.squads.find(x => x.id === squadId));
  const meId = useApp(s => s.meId);
  const userById = useApp(s => s.userById);
  const sendText = useApp(s => s.sendSquadChat);
  const sendPhoto = useApp(s => s.sendSquadChatPhoto);
  const [draft, setDraft] = useState('');
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const photoFileRef = useRef<HTMLInputElement>(null);
  const chatLen = sq?.chat.length ?? 0;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatLen]);

  // Revoke the staged photo's preview URL when it's replaced or the pane closes.
  useEffect(() => () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview);
  }, [pendingPhoto]);

  if (!sq) return null;

  const hasContent = !!draft.trim() || !!pendingPhoto;

  const submit = () => {
    if (pendingPhoto) {
      sendPhoto(squadId, pendingPhoto.file, draft.trim() || undefined);
      setPendingPhoto(null);
      setDraft('');
      return;
    }
    if (!draft.trim()) return;
    sendText(squadId, draft);
    setDraft('');
  };
  // Picking a photo stages it for review — sent only when the user taps send.
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
        {sq.chat.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm mt-10">
            No messages yet — say hi to the squad 👋
          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-2">
            {sq.chat.map(m => {
              const u = userById(m.authorId);
              const mine = m.authorId === meId;
              const isPhoto = m.type === 'photo' && m.photoUrl;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                  className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                >
                  {!mine && <Avatar user={u} size={26} />}
                  {isPhoto ? (
                    <div className={`max-w-[78%] overflow-hidden rounded-2xl
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
        )}
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
            onClick={() => photoFileRef.current?.click()}
            aria-label="Attach a photo"
            className="h-9 w-9 rounded-full grid place-items-center text-zinc-200 hover:bg-white/10"
          >
            <Camera size={16} />
          </motion.button>
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder={pendingPhoto ? 'Add a caption…' : `Message ${sq.emoji} ${sq.name}…`}
            className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none text-sm"
          />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={submit}
            disabled={!hasContent}
            className={`h-9 w-9 rounded-full grid place-items-center
                       ${hasContent
                         ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white'
                         : 'bg-white/10 text-zinc-500'}`}
          >
            <Send size={16} />
          </motion.button>
        </div>
      </div>

      <AnimatePresence>
        {viewerSrc && (
          <ImageViewer src={viewerSrc} onClose={() => setViewerSrc(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─────────────────────────── Editor (host-only) ─────────────────────────── */

function SquadEditor({ squadId, onDone }: { squadId?: string; onDone: () => void }) {
  const existing = useApp(s => squadId ? s.squads.find(x => x.id === squadId) : undefined);
  const createSquad = useApp(s => s.createSquad);
  const updateSquad = useApp(s => s.updateSquad);
  const friends = useApp(useShallow(s => s.friendIds.map(id => s.userById(id))));

  const isEdit = !!existing;
  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '💖');
  // For NEW squads we let the host pick initial members. For EDIT, member
  // management lives in the Members tab; this editor only edits identity.
  const [memberIds, setMemberIds] = useState<string[]>(existing?.memberIds ?? []);

  const toggle = (id: string) =>
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    if (isEdit && existing) {
      updateSquad(existing.id, { name, emoji });
    } else {
      createSquad({ name, emoji, memberIds });
    }
    onDone();
  };

  return (
    <div className="pb-32">
      {/* Hero */}
      <div className="relative h-32 bg-gradient-to-br from-rose-500/30 to-orange-500/30 border-b border-white/5">
        <div className="absolute inset-0 grid place-items-center text-6xl">
          {emoji || '✨'}
        </div>
      </div>

      <div className="px-4 pt-5">
        {/* Name + emoji inputs */}
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-1">
          Identity
        </div>
        <div className="flex gap-2">
          <input
            value={emoji}
            onChange={e => setEmoji(Array.from(e.target.value).slice(0, 4).join(''))}
            placeholder="✨"
            className="w-16 text-center text-2xl bg-white/5 border border-white/10 rounded-2xl py-3 text-white
                       focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
            aria-label="Squad emoji"
          />
          <input
            value={name}
            onChange={e => setName(e.target.value.slice(0, 30))}
            placeholder="Squad name (e.g. Climbing crew)"
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
          />
        </div>

        {/* Initial members — only when creating (edit handles members on the People tab) */}
        {!isEdit && (
          <>
            <div className="flex items-center justify-between mt-5 mb-2 px-1">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Members</div>
              <div className="text-[11px] text-zinc-500">{memberIds.length} of {friends.length}</div>
            </div>
            <div className="flex flex-col gap-2">
              {friends.map(f => {
                const picked = memberIds.includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggle(f.id)}
                    aria-pressed={picked}
                    className={`flex items-center gap-3 p-2.5 rounded-2xl border transition text-left
                                ${picked
                                  ? 'bg-rose-500/15 border-rose-400/40'
                                  : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                  >
                    <Avatar user={f} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{f.name}</div>
                      <div className="text-[11px] text-zinc-400 truncate">@{f.handle}</div>
                    </div>
                    <div className={`h-6 w-6 rounded-full grid place-items-center border-2
                                     ${picked
                                       ? 'bg-gradient-to-br from-rose-500 to-orange-500 border-rose-400'
                                       : 'border-white/20'}`}>
                      {picked && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2,7 5,10 10,3" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
              {friends.length === 0 && (
                <div className="text-zinc-500 text-sm">Add friends first, then group them into squads.</div>
              )}
            </div>
            <div className="text-[11px] text-zinc-500 mt-2 px-1">
              You're automatically the host. Members can leave; only you can add/remove.
            </div>
          </>
        )}

        {isEdit && (
          <div className="mt-5 text-[11px] text-zinc-500 px-1">
            Manage members from the People tab.
          </div>
        )}
      </div>

      {/* Sticky save */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-4
                      bg-[#0a070f]/95 backdrop-blur-md border-t border-white/10">
        <PulseButton onClick={save} disabled={!canSave}>
          {isEdit ? 'Save squad' : 'Create squad'}
        </PulseButton>
      </div>
    </div>
  );
}
