import { motion } from 'framer-motion';
import { ShieldOff } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { useApp } from '../store';

/**
 * Body-only blocked-users content — rendered inside SettingsScreen's page
 * stack so going Settings → Blocked uses the iOS-style push animation
 * without remounting the overlay shell (same pattern as SquadsScreen).
 *
 * Apple Guideline 1.2 requires both a way to block and a way to review /
 * unblock — this is the latter.
 */
export function BlockedUsersBody() {
  const blocked = useApp(s => s.blockedUsers);
  const unblock = useApp(s => s.unblockUser);

  return (
    <div className="px-4 pt-4 pb-32">
        <div className="text-[11px] text-zinc-500 mb-4 px-1 leading-relaxed">
          People you've blocked can't see your plans, find you in search, or
          message you. Unblocking does not restore a previous friendship.
        </div>

        {blocked.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm mt-12">
            <ShieldOff size={28} className="mx-auto mb-3 text-zinc-600" />
            You haven't blocked anyone.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {blocked.map(u => (
              <div
                key={u.id}
                className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10"
              >
                <Avatar user={u} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{u.name}</div>
                  <div className="text-[11px] text-zinc-400 truncate">@{u.handle}</div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => void unblock(u.id)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest
                             text-zinc-200 bg-white/5 border border-white/10 hover:bg-white/10"
                >
                  Unblock
                </motion.button>
              </div>
            ))}
          </div>
        )}
      </div>
  );
}
