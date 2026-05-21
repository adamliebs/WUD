import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Clock, Crown, Megaphone, UserPlus } from 'lucide-react';
import { useEffect } from 'react';
import { Avatar } from '../components/Avatar';
import { PulseButton } from '../components/PulseButton';
import { useApp, relTime } from '../store';
import type { AppNotification, NotificationType } from '../types';

const ICONS: Record<NotificationType, React.ReactNode> = {
  join:        <Bell size={14} />,
  host_offer:  <Crown size={14} />,
  host_taken:  <Crown size={14} />,
  ping:        <Megaphone size={14} />,
  invite:      <UserPlus size={14} />,
  reminder:    <Clock size={14} />,
};

const TONES: Record<NotificationType, string> = {
  join:        'from-emerald-400 to-teal-600',
  host_offer:  'from-amber-400 to-orange-600',
  host_taken:  'from-zinc-400 to-zinc-700',
  ping:        'from-rose-500 to-pink-600',
  invite:      'from-sky-400 to-blue-600',
  reminder:    'from-orange-400 to-rose-600',
};

export function NotificationsScreen() {
  const notifications = useApp(s => s.notifications);
  const markAllRead = useApp(s => s.markAllNotificationsRead);

  useEffect(() => {
    // Mark as read shortly after viewing
    const t = setTimeout(markAllRead, 1200);
    return () => clearTimeout(t);
  }, [markAllRead]);

  return (
    <div className="h-full flex flex-col">
      <div className="pt-14 pb-3 px-5">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">Inbox</div>
        <h1 className="text-[34px] font-black leading-none mt-1">
          <span className="text-grad">Alerts</span>
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-32">
        <AnimatePresence>
          {notifications.length === 0 ? (
            <div className="text-center text-zinc-500 mt-16">All caught up ✨</div>
          ) : (
            <motion.div
              className="flex flex-col gap-2"
              initial="hidden" animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            >
              {notifications.map(n => (
                <motion.div
                  key={n.id}
                  variants={{
                    hidden: { opacity: 0, x: 16 },
                    show:   { opacity: 1, x: 0 },
                  }}
                >
                  <NotificationRow n={n} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function NotificationRow({ n }: { n: AppNotification }) {
  const from = useApp(s => s.userById(n.fromId));
  const activity = useApp(s => n.activityId ? s.activities.find(a => a.id === n.activityId) : undefined);
  const openActivity = useApp(s => s.openActivity);
  const openOverlay = useApp(s => s.openOverlay);
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
        </div>
      </div>
    </div>
  );
}
