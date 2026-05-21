import { AnimatePresence, motion } from 'framer-motion';
import { Search, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../components/Avatar';
import { OverlayShell } from '../components/OverlayShell';
import { socialApi } from '../api/endpoints';
import { useApp } from '../store';
import type { User } from '../types';

type Tab = 'friends' | 'discover';

export function FriendsScreen() {
  const openOverlay = useApp(s => s.openOverlay);
  const closeOverlay = () => openOverlay(null);
  const friends = useApp(useShallow(s => s.friendIds.map(id => s.userById(id))));

  const [tab, setTab] = useState<Tab>('friends');
  const [q, setQ] = useState('');
  // Discover results come from the server (the store only caches known users).
  const [discoverResults, setDiscoverResults] = useState<User[]>([]);

  // Fetch the discover list whenever the Discover tab is active and the query
  // changes (lightly debounced).
  useEffect(() => {
    if (tab !== 'discover') return;
    let cancelled = false;
    const t = setTimeout(() => {
      socialApi.discover(q.trim())
        .then(r => { if (!cancelled) setDiscoverResults(r.users); })
        .catch(() => { if (!cancelled) setDiscoverResults([]); });
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [tab, q]);

  const filtered = useMemo(() => {
    if (tab === 'discover') return discoverResults;
    const needle = q.trim().toLowerCase();
    if (!needle) return friends;
    return friends.filter(u =>
      u.name.toLowerCase().includes(needle) || u.handle.toLowerCase().includes(needle),
    );
  }, [tab, friends, discoverResults, q]);

  return (
    <OverlayShell title="Friends" onClose={closeOverlay}>
      <div className="px-4 pt-4 pb-32">
        {/* Search */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={tab === 'friends' ? 'Search your friends' : 'Find people to add'}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white text-sm placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
          />
        </div>

        {/* Tab switch */}
        <div className="mt-3 grid grid-cols-2 bg-white/5 border border-white/10 rounded-2xl p-1 relative">
          {(['friends', 'discover'] as const).map(t => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="relative py-2 rounded-xl text-sm font-semibold text-zinc-300"
              >
                {active && (
                  <motion.div
                    layoutId="friendspill"
                    className="absolute inset-0 bg-white rounded-xl"
                    transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  />
                )}
                <span className={`relative inline-flex items-center gap-1.5 ${active ? 'text-zinc-900' : ''}`}>
                  {t === 'friends' ? <Users size={13} /> : <UserPlus size={13} />}
                  {t === 'friends' ? `Friends · ${friends.length}` : 'Discover'}
                </span>
              </button>
            );
          })}
        </div>

        {/* List — outer div is keyed by `tab` so swapping tabs cleanly remounts the
            list (no per-row exit/enter cascading from the old tab). Within a tab,
            AnimatePresence still gives a soft fade when a row is added/removed
            (e.g. removing a friend), without any layout-driven sliding. */}
        <motion.div
          key={tab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="mt-4 flex flex-col gap-2"
        >
          <AnimatePresence initial={false}>
            {filtered.map(u => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <PersonRow user={u} mode={tab} />
              </motion.div>
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div className="text-center text-zinc-500 text-sm mt-12">
              {tab === 'friends'
                ? (q ? 'No friends match.' : 'You haven\'t added any friends yet.')
                : (q ? 'No one to add by that name.' : 'No new people to discover.')}
            </div>
          )}
        </motion.div>
      </div>
    </OverlayShell>
  );
}

function PersonRow({ user, mode }: { user: User; mode: Tab }) {
  const addFriend = useApp(s => s.addFriend);
  const removeFriend = useApp(s => s.removeFriend);
  const friendIds = useApp(s => s.friendIds);

  const isFriend = friendIds.includes(user.id);

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10">
      <Avatar user={user} size={42} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{user.name}</div>
        <div className="text-[11px] text-zinc-400 truncate">@{user.handle}</div>
      </div>

      {mode === 'friends' ? (
        <RemoveButton onClick={() => removeFriend(user.id)} />
      ) : isFriend ? (
        <span className="text-[10.5px] font-bold uppercase tracking-widest text-emerald-300 bg-emerald-400/10 border border-emerald-400/30 px-2 py-1 rounded-full">
          ✓ Friend
        </span>
      ) : (
        <AddButton onClick={() => addFriend(user.id)} />
      )}
    </div>
  );
}

function AddButton({ onClick }: { onClick: () => void }) {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <span className="text-[10.5px] font-bold uppercase tracking-widest text-zinc-300 bg-white/5 border border-white/10 px-2 py-1 rounded-full">
        Requested
      </span>
    );
  }
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={() => { onClick(); setSent(true); }}
      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-white bg-gradient-to-br from-rose-500 to-orange-500 shadow-[0_8px_24px_-12px_rgba(244,63,94,0.7)]"
    >
      <UserPlus size={12} />
      Add
    </motion.button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-zinc-300 bg-white/5 border border-white/10 hover:bg-white/10"
      >
        <UserMinus size={12} />
        Remove
      </motion.button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={onClick}
        className="px-2.5 py-1.5 rounded-full text-[11px] font-bold text-white bg-rose-500"
      >
        Confirm
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={() => setConfirming(false)}
        className="px-2.5 py-1.5 rounded-full text-[11px] font-bold text-zinc-300 bg-white/5 border border-white/10"
      >
        Cancel
      </motion.button>
    </div>
  );
}
