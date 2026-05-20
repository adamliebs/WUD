import { motion } from 'framer-motion';
import { Radio } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { isLive, useApp } from '../store';
import { Avatar } from './Avatar';

/**
 * Horizontal scroll at the top of the Feed showing:
 *   1. A "You" card — either "Go live" prompt or current status
 *   2. Each currently-live friend
 *
 * Tapping your own card opens the GoLiveSheet. Tapping a friend's card sends a
 * lightweight ping to them.
 */
export function LiveNowStrip() {
  const me = useApp(s => s.me());
  const setShowGoLive = useApp(s => s.setShowGoLiveSheet);
  const setOpenLive = useApp(s => s.setOpenLiveUserId);

  // Live friends (not me).
  const liveFriends = useApp(useShallow(s =>
    s.friendIds
      .map(id => s.userById(id))
      .filter(u => isLive(u))
  ));

  const meLive = isLive(me);

  // Hide entirely if nothing live AND user toggled off? Always show — it's the
  // primary CTA for "What are YOU doing right now?".
  return (
    <div className="px-4 mt-1 mb-3">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-rose-400 text-rose-400 live-dot" />
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
          Live now
          {liveFriends.length > 0 && (
            <span className="text-rose-300 normal-case tracking-normal font-bold ml-1">
              · {liveFriends.length + (meLive ? 1 : 0)}
            </span>
          )}
        </span>
      </div>

      <div className="flex gap-2.5 overflow-x-auto no-scrollbar -mx-2 px-2 pb-1">
        {/* You — either Go Live prompt or current status */}
        <YouCard
          live={meLive}
          onTap={() => setShowGoLive(true)}
        />

        {liveFriends.map(f => (
          <FriendLiveCard
            key={f.id}
            user={f}
            onTap={() => setOpenLive(f.id)}
          />
        ))}

        {liveFriends.length === 0 && (
          <div className="self-center pl-1 text-[11px] text-zinc-500">
            No friends live right now — be the spark.
          </div>
        )}
      </div>
    </div>
  );
}

function YouCard({ live, onTap }: { live: boolean; onTap: () => void }) {
  const me = useApp(s => s.me());

  if (live && me.liveStatus) {
    return (
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onTap}
        className="shrink-0 w-[148px] rounded-2xl p-3 text-left
                   bg-gradient-to-br from-rose-500/20 to-orange-500/20 border border-rose-400/40"
      >
        <div className="flex items-center gap-2">
          <Avatar user={me} size={36} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-rose-200 font-bold">You · live</div>
            <div className="text-sm font-bold text-white truncate">tap to edit</div>
          </div>
        </div>
        <div className="mt-2 text-xs text-zinc-200 truncate">
          <span className="mr-1">{me.liveStatus.emoji}</span>
          {me.liveStatus.text}
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className="shrink-0 w-[148px] rounded-2xl p-3 text-left
                 bg-white/5 border border-dashed border-white/20 hover:bg-white/10 transition"
    >
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-full grid place-items-center bg-gradient-to-br from-rose-500 to-orange-500 text-white">
          <Radio size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-bold">You</div>
          <div className="text-sm font-bold text-white truncate">Go live</div>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-zinc-400 truncate">
        Tell friends what you're up to right now.
      </div>
    </motion.button>
  );
}

function FriendLiveCard({
  user, onTap,
}: {
  user: { id: string; name: string; handle: string; avatar: string; color: string; photoUrl?: string; liveStatus?: { emoji: string; text: string; expiresAt: number } };
  onTap: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className="shrink-0 w-[148px] rounded-2xl p-3 text-left bg-white/5 border border-white/10 hover:bg-white/10 transition"
    >
      <div className="flex items-center gap-2">
        <Avatar user={user} size={36} />
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{user.name}</div>
          <div className="text-[10px] uppercase tracking-widest text-rose-300 font-bold">live</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-zinc-200 truncate">
        <span className="mr-1">{user.liveStatus!.emoji}</span>
        {user.liveStatus!.text}
      </div>
    </motion.button>
  );
}
