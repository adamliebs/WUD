import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell, BellRing, CalendarPlus, CalendarX, Check, ChevronDown, Clock, Crown,
  Megaphone, MessageSquare, Pencil, Sparkles, Trash2, UserPlus, Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { RefreshButton } from '../components/RefreshButton';
import { PulseButton } from '../components/PulseButton';
import { useApp, relTime } from '../store';
import type { AppNotification, NotificationType } from '../types';

const ICONS: Record<NotificationType, React.ReactNode> = {
  join:               <Bell size={14} />,
  host_offer:         <Crown size={14} />,
  host_taken:         <Crown size={14} />,
  ping:               <Megaphone size={14} />,
  invite:             <UserPlus size={14} />,
  reminder:           <Clock size={14} />,
  float_received:     <Sparkles size={14} />,
  float_keen:         <Check size={14} />,
  float_locked:       <Sparkles size={14} />,
  activity_created:   <CalendarPlus size={14} />,
  chat_message:       <MessageSquare size={14} />,
  friend_accepted:    <Users size={14} />,
  activity_updated:   <Pencil size={14} />,
  activity_cancelled: <CalendarX size={14} />,
  plan_invite:        <UserPlus size={14} />,
  squad_invite:       <Users size={14} />,
};

const TONES: Record<NotificationType, string> = {
  join:               'from-emerald-400 to-teal-600',
  host_offer:         'from-amber-400 to-orange-600',
  host_taken:         'from-amber-400 to-orange-600',
  ping:               'from-rose-500 to-pink-600',
  invite:             'from-sky-400 to-blue-600',
  reminder:           'from-orange-400 to-rose-600',
  float_received:     'from-fuchsia-500 to-rose-600',
  float_keen:         'from-emerald-400 to-teal-600',
  float_locked:       'from-fuchsia-500 to-orange-500',
  activity_created:   'from-rose-500 to-orange-500',
  chat_message:       'from-sky-500 to-indigo-600',
  friend_accepted:    'from-emerald-400 to-teal-600',
  activity_updated:   'from-amber-400 to-orange-500',
  activity_cancelled: 'from-zinc-400 to-zinc-700',
  plan_invite:        'from-sky-400 to-blue-600',
  squad_invite:       'from-violet-400 to-purple-600',
};

export function NotificationsScreen() {
  const notifications = useApp(s => s.notifications);
  const markAllRead = useApp(s => s.markAllNotificationsRead);
  const clearAll = useApp(s => s.clearAllNotifications);
  const refreshAll = useApp(s => s.refreshAll);
  // MainTabsPager keeps every tab mounted, so the mark-read timer can't fire
  // just because we mounted — it needs to wait until the user is *actually*
  // looking at this tab. Hooks into the store's active-tab signal.
  const isActiveTab = useApp(s => s.tab === 'notifications');

  useEffect(() => {
    if (!isActiveTab) return;
    // Mark as read shortly after viewing
    const t = setTimeout(markAllRead, 1200);
    return () => clearTimeout(t);
  }, [isActiveTab, markAllRead]);

  const onClearAll = () => {
    if (notifications.length === 0) return;
    if (confirm(`Clear all ${notifications.length} notifications? This can't be undone.`)) {
      clearAll();
    }
  };

  const unread = notifications.filter(n => !n.read).length;

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <AlertsBackgroundOrbs />

      <div className="relative pt-status-lg pb-3 px-5">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-end justify-between gap-3"
        >
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.2em] text-zinc-400 inline-flex items-center gap-1.5">
              <BellRing size={12} className="text-amber-300" />
              Inbox
              {unread > 0 && (
                <span className="ml-1 normal-case tracking-normal font-bold text-amber-200">
                  · {unread} new
                </span>
              )}
            </div>
            <h1 className="text-[34px] font-black leading-none mt-1">
              <span className="text-grad">Alerts</span>
            </h1>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <RefreshButton onRefresh={refreshAll} ariaLabel="Refresh notifications" />
            {/* Clear all — only visible when there's something to clear.
                Auto-purge handles 7-day-old notifications on the server side. */}
            {notifications.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={onClearAll}
                aria-label="Clear all notifications"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                           text-[11px] font-bold uppercase tracking-widest
                           bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition"
              >
                <Trash2 size={11} />
                Clear all
              </motion.button>
            )}
          </div>
        </motion.div>
      </div>

      <div className="relative flex-1 overflow-y-auto overscroll-none no-scrollbar px-4 pb-32">
        {notifications.length === 0 ? (
          <div className="text-center mt-16 pb-6">
            <motion.div
              animate={{ y: [0, -8, 0], rotate: [0, 6, 0, -6, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="text-6xl"
            >
              ✨
            </motion.div>
            <div className="text-white font-semibold mt-3">All caught up</div>
            <div className="text-sm text-zinc-400 mt-1 max-w-[280px] mx-auto">
              No new pings, joins, or reminders. The next one will land right here.
            </div>
          </div>
        ) : (
          <GroupedNotifications notifications={notifications} />
        )}
      </div>
    </div>
  );
}

/** Drifting orbs behind the Alerts feed — amber / rose / sky so the page reads
 *  warm (incoming), distinct from the Floats and Feed palettes. Same blur-flash
 *  guard (willChange + opacity fade-in) as the other tabs. */
function AlertsBackgroundOrbs() {
  // Static orbs — see FeedScreen's FeedBackgroundOrbs comment.
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute -top-24 -right-10 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl"
        style={{ willChange: 'filter' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
      <motion.div
        className="absolute top-1/3 -left-16 h-80 w-80 rounded-full bg-rose-500/12 blur-3xl"
        style={{ willChange: 'filter' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.05 }}
      />
      <motion.div
        className="absolute bottom-16 right-1/4 h-64 w-64 rounded-full bg-sky-500/8 blur-3xl"
        style={{ willChange: 'filter' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
      />
    </div>
  );
}

/* ─────────────────────────── Grouping ─────────────────────────── */

type Entry =
  | { kind: 'single'; at: number; notif: AppNotification }
  | { kind: 'group'; at: number; key: string; type: 'chat' | 'pings'; items: AppNotification[] };

/**
 * Bundle notifications into chat-per-activity groups and an all-pings
 * group; everything else (friend events, host transfers, reminders,
 * floats, plan updates) renders as individual rows. Entries are sorted
 * by their most-recent timestamp so a fresh ping in an old group
 * surfaces it back to the top.
 */
function groupForUI(notifs: AppNotification[]): Entry[] {
  const chatBuckets = new Map<string, AppNotification[]>();   // keyed by activityId
  const pings: AppNotification[] = [];
  const singles: AppNotification[] = [];
  for (const n of notifs) {
    if (n.type === 'chat_message' && n.activityId) {
      const arr = chatBuckets.get(n.activityId) ?? [];
      arr.push(n);
      chatBuckets.set(n.activityId, arr);
    } else if (n.type === 'ping') {
      pings.push(n);
    } else {
      singles.push(n);
    }
  }
  const entries: Entry[] = [];
  for (const [activityId, items] of chatBuckets) {
    // Single chat → render as a regular row (no group chrome).
    if (items.length === 1) {
      entries.push({ kind: 'single', notif: items[0], at: items[0].at });
    } else {
      const at = Math.max(...items.map(i => i.at));
      entries.push({ kind: 'group', key: `chat:${activityId}`, type: 'chat', items, at });
    }
  }
  if (pings.length === 1) {
    entries.push({ kind: 'single', notif: pings[0], at: pings[0].at });
  } else if (pings.length > 1) {
    const at = Math.max(...pings.map(i => i.at));
    entries.push({ kind: 'group', key: 'pings', type: 'pings', items: pings, at });
  }
  for (const n of singles) {
    entries.push({ kind: 'single', notif: n, at: n.at });
  }
  entries.sort((a, b) => b.at - a.at);
  return entries;
}

function GroupedNotifications({ notifications }: { notifications: AppNotification[] }) {
  const entries = useMemo(() => groupForUI(notifications), [notifications]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Track the bucket of the last rendered entry so we only emit a heading
  // when it actually changes. Entries are sorted newest → oldest, so this
  // produces Today → Yesterday → weekday → date in order.
  let lastBucket: string | null = null;
  return (
    <div className="flex flex-col gap-2">
      {entries.map(e => {
        const bucket = dayBucketLabel(e.at);
        const showHeading = bucket !== lastBucket;
        lastBucket = bucket;
        const headingKey = `heading:${bucket}`;
        return (
          <div key={e.kind === 'single' ? e.notif.id : e.key} className="contents">
            {showHeading && <SectionHeading key={headingKey} label={bucket} />}
            {e.kind === 'single'
              ? <NotificationRow n={e.notif} />
              : <NotificationGroup group={e} open={expanded.has(e.key)} onToggle={() => toggle(e.key)} />}
          </div>
        );
      })}
    </div>
  );
}

/** Day bucket label for the alerts feed — relative names for the last week,
 *  short date past that, with the year suffix only when it disambiguates. */
function dayBucketLabel(ts: number): string {
  const d = new Date(ts);
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const startOfDay = new Date(d);  startOfDay.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfToday.getTime() - startOfDay.getTime()) / dayMs);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  if (d.getFullYear() === startOfToday.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Sticky-styled day divider that sits between alert rows. */
function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-3 pb-1 px-1 first:pt-0">
      <div className="text-[10px] uppercase tracking-[0.22em] font-bold text-zinc-400">
        {label}
      </div>
      <div className="flex-1 h-px bg-white/5" />
    </div>
  );
}

/** Header row for a chat-per-activity / all-pings bundle. Collapsed shows
 *  count + last-message preview + chevron; expanded reveals the full list
 *  of NotificationRows inside. */
function NotificationGroup({
  group, open, onToggle,
}: {
  group: Extract<Entry, { kind: 'group' }>;
  open: boolean;
  onToggle: () => void;
}) {
  const userById = useApp(s => s.userById);
  const activity = useApp(s =>
    group.type === 'chat'
      ? s.activities.find(a => a.id === group.items[0].activityId)
      : undefined,
  );
  const unread = group.items.filter(n => !n.read).length;
  const newest = group.items[0]; // already sorted desc by store
  const tone = TONES[newest.type];
  const icon = group.type === 'chat'
    ? <MessageSquare size={14} />
    : <Megaphone size={14} />;
  const title = group.type === 'chat'
    ? (activity?.title ?? 'Activity chat')
    : 'Pings';
  // Last sender for the preview avatar — for pings it's the most recent
  // pinger; for chats it's the latest message author.
  const lastSender = userById(newest.fromId);

  return (
    <div className={`rounded-2xl border overflow-hidden
                     ${unread > 0 ? 'bg-white/8 border-white/10' : 'bg-white/[0.03] border-white/5'}`}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left p-3 flex items-start gap-3 hover:bg-white/[0.02] transition"
      >
        <div className="relative">
          <Avatar user={lastSender} size={40} />
          <div className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full grid place-items-center text-white bg-gradient-to-br ${tone} ring-2 ring-[#0a070f]`}>
            {icon}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-100 font-semibold truncate inline-flex items-center gap-1.5">
            {title}
            <span className="text-[11px] font-medium text-zinc-400">
              · {group.items.length} {group.type === 'chat' ? 'messages' : 'pings'}
            </span>
            {unread > 0 && (
              <span className="text-[10px] uppercase tracking-widest font-bold text-rose-200
                                bg-rose-500/20 border border-rose-400/30 rounded-full px-1.5 py-0.5">
                {unread} new
              </span>
            )}
          </div>
          {/* Collapsed preview — latest message body, truncated. */}
          {!open && (
            <div className="text-[12px] text-zinc-400 mt-0.5 truncate">
              {newest.text}
            </div>
          )}
          <div className="text-[11px] text-zinc-500 mt-0.5">{relTime(newest.at)}</div>
        </div>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="text-zinc-400 shrink-0 mt-1"
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
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 flex flex-col gap-2 border-t border-white/5 pt-2">
              {group.items.map(n => (
                <NotificationRow key={n.id} n={n} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NotificationRow({ n }: { n: AppNotification }) {
  const from = useApp(s => s.userById(n.fromId));
  const activity = useApp(s => n.activityId ? s.activities.find(a => a.id === n.activityId) : undefined);
  const openActivity = useApp(s => s.openActivity);
  const openOverlay = useApp(s => s.openOverlay);
  const setTab = useApp(s => s.setTab);
  const accept = useApp(s => s.acceptHostOffer);
  const decline = useApp(s => s.declineHostOffer);
  const acceptSquad = useApp(s => s.acceptSquadInvite);
  const declineSquad = useApp(s => s.declineSquadInvite);

  const tone = TONES[n.type];

  return (
    <div className={`p-3 rounded-2xl border ${n.read ? 'bg-white/[0.03] border-white/5' : 'bg-white/8 border-white/10'} relative overflow-hidden`}>
      {!n.read && (
        <span className="absolute top-3 right-3 h-2 w-2 rounded-full bg-rose-400" />
      )}
      <div className="flex items-start gap-3">
        <div className="relative">
          <Avatar user={from} size={40} />
          <div className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full grid place-items-center text-white bg-gradient-to-br ${tone} ring-2 ring-[#0a070f]`}>
            {ICONS[n.type]}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-zinc-100 leading-snug">
            <span className="font-semibold">{from.name}</span>{' '}
            <span className="text-zinc-300">{n.text}</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-0.5">{relTime(n.at)}</div>

          {/* Host-transfer call-to-action */}
          {n.type === 'host_offer' && !n.resolved && activity && (
            <div className="mt-3 flex gap-2 items-stretch">
              <div className="flex-1">
                <PulseButton onClick={() => accept(n.id)} tone="amber">
                  👑 Take over hosting
                </PulseButton>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => decline(n.id)}
                className="px-4 py-3.5 rounded-2xl text-sm font-bold text-zinc-300 bg-white/5 border border-white/10"
              >
                Pass
              </motion.button>
            </div>
          )}

          {/* Plan link — applies to anything carrying an activityId EXCEPT
              host_offer (which has its own CTA) and activity_cancelled
              (the plan is dissolved server-side; tapping would 404). */}
          {n.activityId
            && n.type !== 'host_offer'
            && n.type !== 'activity_cancelled' && (
            <button
              onClick={() => n.activityId && openActivity(n.activityId)}
              className="mt-2 text-xs font-semibold text-rose-300"
            >
              View plan →
            </button>
          )}

          {/* Squad invite — join (also auto-friends the inviter) or pass. */}
          {n.type === 'squad_invite' && !n.resolved && (
            <div className="mt-3 flex gap-2 items-stretch">
              <div className="flex-1">
                <PulseButton onClick={() => acceptSquad(n.id)} tone="violet">
                  🤝 Join the squad
                </PulseButton>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => declineSquad(n.id)}
                className="px-4 py-3.5 rounded-2xl text-sm font-bold text-zinc-300 bg-white/5 border border-white/10"
              >
                Pass
              </motion.button>
            </div>
          )}

          {/* Friend request — jump to the Friends overlay to accept/decline. */}
          {n.type === 'invite' && (
            <button
              onClick={() => openOverlay('friends')}
              className="mt-2 text-xs font-semibold text-rose-300"
            >
              {n.resolved ? 'View friends →' : 'Respond →'}
            </button>
          )}

          {/* Friend request accepted — jump to your friend list. */}
          {n.type === 'friend_accepted' && (
            <button
              onClick={() => openOverlay('friends')}
              className="mt-2 text-xs font-semibold text-emerald-300"
            >
              View friends →
            </button>
          )}

          {/* Float events — jump to the Floats tab, or to the locked-in
              activity when there is one. */}
          {(n.type === 'float_received' || n.type === 'float_keen') && (
            <button
              onClick={() => setTab('floats')}
              className="mt-2 text-xs font-semibold text-fuchsia-300"
            >
              View float →
            </button>
          )}
          {n.type === 'float_locked' && n.activityId && (
            <button
              onClick={() => n.activityId && openActivity(n.activityId)}
              className="mt-2 text-xs font-semibold text-fuchsia-300"
            >
              See the plan →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
