import { motion } from 'framer-motion';
// motion is still used by NotificationRow's "Pass" button; the row list itself
// uses plain divs after Android WebView showed subpixel compositing gaps
// between motion-wrapped children (regression of commit 79af4a7's fix).
import { Bell, BellRing, Check, Clock, Crown, Megaphone, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { useEffect } from 'react';
import { Avatar } from '../components/Avatar';
import { PulseButton } from '../components/PulseButton';
import { useApp, relTime } from '../store';
import type { AppNotification, NotificationType } from '../types';

const ICONS: Record<NotificationType, React.ReactNode> = {
  join:           <Bell size={14} />,
  host_offer:     <Crown size={14} />,
  host_taken:     <Crown size={14} />,
  ping:           <Megaphone size={14} />,
  invite:         <UserPlus size={14} />,
  reminder:       <Clock size={14} />,
  float_received: <Sparkles size={14} />,
  float_keen:     <Check size={14} />,
  float_locked:   <Sparkles size={14} />,
};

const TONES: Record<NotificationType, string> = {
  join:           'from-emerald-400 to-teal-600',
  host_offer:     'from-amber-400 to-orange-600',
  host_taken:     'from-zinc-400 to-zinc-700',
  ping:           'from-rose-500 to-pink-600',
  invite:         'from-sky-400 to-blue-600',
  reminder:       'from-orange-400 to-rose-600',
  float_received: 'from-fuchsia-500 to-rose-600',
  float_keen:     'from-emerald-400 to-teal-600',
  float_locked:   'from-fuchsia-500 to-orange-500',
};

export function NotificationsScreen() {
  const notifications = useApp(s => s.notifications);
  const markAllRead = useApp(s => s.markAllNotificationsRead);
  const clearAll = useApp(s => s.clearAllNotifications);
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
          {/* Clear all — only visible when there's something to clear.
              Auto-purge handles 3-day-old notifications on the server side. */}
          {notifications.length > 0 && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onClearAll}
              aria-label="Clear all notifications"
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                         text-[11px] font-bold uppercase tracking-widest
                         bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition"
            >
              <Trash2 size={11} />
              Clear all
            </motion.button>
          )}
        </motion.div>
      </div>

      <div className="relative flex-1 overflow-y-auto no-scrollbar px-4 pb-32">
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
          <div className="flex flex-col gap-2">
            {notifications.map(n => (
              <NotificationRow key={n.id} n={n} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Drifting orbs behind the Alerts feed — amber / rose / sky so the page reads
 *  warm (incoming), distinct from the Floats and Feed palettes. Same blur-flash
 *  guard (willChange + opacity fade-in) as the other tabs. */
function AlertsBackgroundOrbs() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute -top-24 -right-10 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 24, 0], x: [0, -14, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut' },
          y: { duration: 22, repeat: Infinity, ease: 'easeInOut' },
          x: { duration: 22, repeat: Infinity, ease: 'easeInOut' },
        }}
      />
      <motion.div
        className="absolute top-1/3 -left-16 h-80 w-80 rounded-full bg-rose-500/12 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -28, 0], x: [0, 18, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut', delay: 0.05 },
          y: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 2 },
          x: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 2 },
        }}
      />
      <motion.div
        className="absolute bottom-16 right-1/4 h-64 w-64 rounded-full bg-sky-500/8 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -18, 0], x: [0, 12, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut', delay: 0.1 },
          y: { duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 5 },
          x: { duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 5 },
        }}
      />
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

          {n.activityId && n.type !== 'host_offer' && (
            <button
              onClick={() => n.activityId && openActivity(n.activityId)}
              className="mt-2 text-xs font-semibold text-rose-300"
            >
              View plan →
            </button>
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
