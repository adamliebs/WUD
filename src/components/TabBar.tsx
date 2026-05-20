import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Home, Megaphone, Plus, User } from 'lucide-react';
import { useApp } from '../store';

type Tab = 'feed' | 'ping' | 'notifications' | 'profile';

const tabs: { key: Tab; label: string; Icon: React.ElementType }[] = [
  { key: 'feed',          label: 'Feed',  Icon: Home },
  { key: 'ping',          label: 'Ping',  Icon: Megaphone },
  { key: 'notifications', label: 'Alerts', Icon: Bell },
  { key: 'profile',       label: 'Me',    Icon: User },
];

export function TabBar() {
  const tab = useApp(s => s.tab);
  const setTab = useApp(s => s.setTab);
  const unread = useApp(s => s.unreadCount());
  const setShowPostSheet = useApp(s => s.setShowPostSheet);

  // Position the "+" button between Ping and Notifications visually,
  // but in our layout we render it as a floating center button.
  return (
    <div className="absolute bottom-0 left-0 right-0 pb-5 pt-3 px-4 z-30 pointer-events-none">
      <div className="relative pointer-events-auto">
        {/* Floating create button */}
        <div className="absolute left-1/2 -translate-x-1/2 -top-8 z-10">
          <div className="relative h-16 w-16">
            {/* Soft pulsing halos behind the button */}
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-rose-500/40 blur-md"
              animate={{ scale: [1, 1.6, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-orange-400/30 blur-lg"
              animate={{ scale: [1, 1.9, 1], opacity: [0.45, 0, 0.45] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
            />
            <motion.button
              whileTap={{ scale: 0.92 }}
              whileHover={{ y: -2 }}
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              onClick={() => setShowPostSheet(true)}
              className="relative h-16 w-16 rounded-full grid place-items-center
                         text-white shadow-[0_18px_40px_-10px_rgba(244,63,94,0.7)]
                         ring-1 ring-white/15
                         bg-gradient-to-br from-rose-500 via-pink-500 to-orange-500"
              aria-label="Post activity"
            >
              <Plus size={28} strokeWidth={3} />
            </motion.button>
          </div>
        </div>

        {/* Glass tab bar */}
        <div className="glass-strong rounded-[28px] px-3 py-2 grid grid-cols-5 gap-1 relative">
          {/* index 0,1, [center], 3, 4 → render with a spacer in the middle */}
          {tabs.slice(0, 2).map(t => (
            <TabItem
              key={t.key}
              tab={t}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
            />
          ))}

          {/* spacer for the floating button */}
          <div aria-hidden className="h-12" />

          {tabs.slice(2).map(t => (
            <TabItem
              key={t.key}
              tab={t}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
              badge={t.key === 'notifications' ? unread : 0}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TabItem({
  tab, active, onClick, badge,
}: {
  tab: { key: Tab; label: string; Icon: React.ElementType };
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  const { Icon, label } = tab;
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl"
    >
      {active && (
        <motion.div
          layoutId="tabpill"
          className="absolute inset-0 bg-white/10 rounded-2xl"
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      <div className="relative">
        <Icon size={22} className={active ? 'text-white' : 'text-zinc-400'} />
        <AnimatePresence>
          {!!badge && badge > 0 && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full
                         bg-rose-500 text-white text-[10px] font-bold grid place-items-center"
            >
              {badge}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <span className={`text-[10.5px] font-medium relative ${active ? 'text-white' : 'text-zinc-500'}`}>
        {label}
      </span>
    </motion.button>
  );
}
