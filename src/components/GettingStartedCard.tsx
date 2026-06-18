import { motion, AnimatePresence } from 'framer-motion';
import { CalendarPlus, Check, ChevronDown, Compass, Megaphone, RotateCcw, Send, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { burst } from '../lib/confetti';
import { shareInvite } from '../lib/share-invite';
import { BUDDY_ID, useApp } from '../store';

/**
 * Getting Started checklist — the hub of the onboarding flow. Pinned to the
 * top of the Feed for new accounts; each row launches an interactive,
 * click-by-click coach tour over the REAL UI (see components/CoachMarks.tsx).
 * Completion is mostly derived from live store data, so quests tick
 * themselves off no matter where the user did the thing:
 *
 *   friend — a non-Buddy friend exists, or 3 invite-link shares fired
 *   post   — any activity hosted by me (incl. history)
 *   float  — any float I sent
 *   squad  — any squad I host
 *   ping   — flagged by the store on the first successful ping send
 *
 * This component also kicks off the auto-played welcome intro tour on first
 * launch (it owns the spotlight target for the intro's final slide), and is
 * collapsible down to its header. All five done → confetti, then it dismisses
 * itself for good. Skipping is recoverable from Settings → Getting started.
 */
export function GettingStartedCard() {
  const meId = useApp(s => s.meId);
  const me = useApp(s => s.me());
  const flags = useApp(s => s.questFlags);
  const dismiss = useApp(s => s.dismissQuests);
  const pushToast = useApp(s => s.pushToast);
  const recordInvite = useApp(s => s.recordInviteShared);
  const startQuest = useApp(s => s.startQuest);
  const setCollapsed = useApp(s => s.setQuestsCollapsed);
  const coachActive = useApp(s => s.coach !== null);
  // Was the checklist explicitly reopened from Settings? If so it stays open
  // (even when fully done) and every step is replayable.
  const reopened = useApp(s => s.questsReopened);

  // Derived quest completion — primitive selectors so re-renders stay cheap.
  const hasRealFriend = useApp(s => s.friendIds.some(id => id !== BUDDY_ID));
  const hasPosted = useApp(s => s.activities.some(a => a.hostId === s.meId));
  const hasFloated = useApp(s => s.floats.some(f => f.senderId === s.meId));
  const hasSquad = useApp(s => s.squads.some(sq => sq.hostId === s.meId));

  const friendDone = hasRealFriend || flags.invitesSent >= 3;
  const exploreDone = flags.exploredPlan;
  const quests = [
    {
      key: 'friend' as const,
      done: friendDone,
      icon: <UserPlus size={14} />,
      label: 'Add your first friend',
      hint: hasRealFriend
        ? undefined
        : flags.invitesSent > 0
          ? `Invites shared: ${Math.min(flags.invitesSent, 3)}/3`
          : 'Contacts first — invite if nobody’s here yet',
    },
    {
      key: 'explore' as const,
      done: exploreDone,
      icon: <Compass size={14} />,
      label: 'Join and explore a plan',
      hint: 'Open WUD Buddy’s plan, RSVP, and peek at the chat',
    },
    {
      key: 'post' as const,
      done: hasPosted,
      icon: <CalendarPlus size={14} />,
      label: 'Post your first plan',
      hint: 'Even "coffee in 30min" counts',
    },
    {
      key: 'float' as const,
      done: hasFloated,
      icon: <Send size={14} />,
      label: 'Float an idea',
      hint: 'Reply to one from WUD Buddy, then float your own',
    },
    {
      key: 'squad' as const,
      done: hasSquad,
      icon: <Users size={14} />,
      label: 'Make your first squad',
      hint: 'Group your crew — WUD Buddy will stand in',
    },
    {
      key: 'ping' as const,
      done: flags.pingDone,
      icon: <Megaphone size={14} />,
      label: 'Ping a friend',
      hint: 'Try it on WUD Buddy 🤖 — he pings back',
    },
  ];

  const doneCount = quests.filter(q => q.done).length;
  const allDone = doneCount === quests.length;
  const collapsed = flags.collapsed;

  // Auto-play the welcome intro once, the first time a real (not yet onboarded)
  // account lands on the feed. Skipped if the card is already dismissed, and
  // held while a deferred invite is being redeemed so the intro's dim doesn't
  // bury the "you're now friends" toast (then it plays right after).
  const inviteConsuming = useApp(s => s.pendingInviteConsuming);
  useEffect(() => {
    if (!meId || flags.introSeen || flags.dismissed || coachActive || inviteConsuming) return;
    const t = setTimeout(() => useApp.getState().startQuest('intro'), 400);
    return () => clearTimeout(t);
  }, [meId, flags.introSeen, flags.dismissed, coachActive, inviteConsuming]);

  // Auto-hide on completion — but NEVER when explicitly reopened (then the
  // user wants to see the finished list + replay steps).
  // Accounts that were already "done" before the card ever rendered get a
  // silent dismiss — fanfare for work they did months ago would be weird.
  // Lazy useState pins the first-render answer without re-evaluating.
  const [initiallyAllDone] = useState(allDone);
  useEffect(() => {
    if (!meId || reopened) return;
    if (!allDone || flags.dismissed) return;
    if (initiallyAllDone) { dismiss(); return; }
    burst({ particleCount: 140, spread: 90, origin: { y: 0.4 } });
    const t = setTimeout(dismiss, 3200);
    return () => clearTimeout(t);
  }, [allDone, flags.dismissed, meId, dismiss, initiallyAllDone, reopened]);

  if (!meId) return null;
  // When not reopened, hide if dismissed or if it was already all-done on mount.
  if (!reopened && (flags.dismissed || (allDone && initiallyAllDone))) return null;

  return (
    <motion.div
      data-coach="getting-started"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mb-4 rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden"
    >
      {/* Header — progress, collapse, skip. Tapping the title area toggles
          collapse so the whole header is a big hit target. */}
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex-1 min-w-0 text-left"
          aria-expanded={!collapsed}
        >
          <div className="text-[11px] uppercase tracking-[0.2em] text-rose-300 font-bold">
            Getting started
          </div>
          <div className="text-sm font-semibold text-white mt-0.5">
            {allDone ? "You're all set 🎉" : `${doneCount} of ${quests.length} done`}
          </div>
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand checklist' : 'Collapse checklist'}
          className="h-8 w-8 grid place-items-center rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10"
        >
          <motion.span animate={{ rotate: collapsed ? -90 : 0 }} transition={{ duration: 0.18 }}>
            <ChevronDown size={15} />
          </motion.span>
        </button>
        <button
          onClick={() => {
            dismiss();
            // Never trap the user — the card is recoverable, and we say where.
            pushToast('Bring this back anytime: Me → Settings → Getting started', 'default');
          }}
          aria-label="Dismiss the getting-started checklist"
          className="h-8 w-8 grid place-items-center rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10"
        >
          <X size={14} />
        </button>
      </div>

      {/* Progress bar — always visible, even when collapsed. */}
      <div className="mx-4 h-1 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-500"
          initial={false}
          animate={{ width: `${(doneCount / quests.length) * 100}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 30 }}
        />
      </div>

      {/* Collapsible body. */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            {/* Quest rows */}
            <div className="flex flex-col gap-1.5 p-3">
              {quests.map(q => (
                // Every row is tappable — done steps replay their tour.
                <button
                  key={q.key}
                  onClick={() => startQuest(q.key)}
                  className="flex items-center gap-3 px-2.5 py-2 rounded-2xl text-left transition
                             hover:bg-white/5 active:bg-white/10"
                >
                  <span className={`h-7 w-7 shrink-0 grid place-items-center rounded-full
                                    ${q.done
                                      ? 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white'
                                      : 'bg-white/5 border border-white/10 text-zinc-300'}`}>
                    {q.done ? <Check size={14} /> : q.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-semibold truncate ${q.done ? 'text-zinc-400' : 'text-white'}`}>
                      {q.label}
                    </span>
                    <span className="block text-[11px] text-zinc-500 truncate">
                      {q.done ? 'Done — tap to replay' : q.hint}
                    </span>
                  </span>
                  {q.done
                    ? <RotateCcw size={13} className="text-zinc-500 shrink-0" />
                    : <span className="text-zinc-500 text-xs">→</span>}
                </button>
              ))}
            </div>

            {/* No-friends fallback: the share-link path to completing quest #1.
                Three shares count as done — you can't force an accept, but you
                can do your part. */}
            {!friendDone && (
              <div className="px-3 pb-3">
                <button
                  onClick={() => {
                    void shareInvite(me).then(shared => { if (shared) recordInvite(); });
                  }}
                  className="w-full py-2.5 rounded-2xl text-xs font-bold uppercase tracking-widest text-white
                             bg-gradient-to-br from-rose-500 to-orange-500
                             shadow-[0_12px_30px_-12px_rgba(244,63,94,0.55)]"
                >
                  {flags.invitesSent > 0
                    ? `Invite ${3 - Math.min(flags.invitesSent, 2)} more friend${3 - flags.invitesSent === 1 ? '' : 's'} →`
                    : 'No friends on WUD yet? Invite 3 →'}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
