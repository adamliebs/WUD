import { motion } from 'framer-motion';
import { Clock, MapPin, MessageCircle, Radio, UserCheck, UserX } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { BottomSheet } from '../components/BottomSheet';
import { PulseButton } from '../components/PulseButton';
import { isLive, relTime, useApp } from '../store';

/** Bottom sheet showing a friend's live status with their place + "open to join" info. */
export function LiveDetailSheet() {
  const openId = useApp(s => s.openLiveUserId);
  const setOpenLive = useApp(s => s.setOpenLiveUserId);

  return (
    <BottomSheet open={!!openId} onClose={() => setOpenLive(null)} size="tall">
      {openId ? <Inner key={openId} userId={openId} /> : null}
    </BottomSheet>
  );
}

function Inner({ userId }: { userId: string }) {
  const user = useApp(s => s.userById(userId));
  const ping = useApp(s => s.pingFriends);
  const setOpenLive = useApp(s => s.setOpenLiveUserId);

  // If the status expired (or was cleared) while the sheet is open, close out.
  if (!isLive(user) || !user.liveStatus) {
    return (
      <div className="px-4 py-10 text-center">
        <div className="text-zinc-300 text-sm">
          {user.name} just went offline.
        </div>
        <button
          onClick={() => setOpenLive(null)}
          className="mt-4 px-4 py-2 rounded-full bg-white/10 text-white text-sm font-bold"
        >
          Close
        </button>
      </div>
    );
  }

  const live = user.liveStatus;
  const startedAgoMs = Date.now() - live.startedAt;
  const startedAgoMin = Math.max(1, Math.round(startedAgoMs / 60000));
  // expiresAt is in the future for live users, so relTime returns "in Xm/h".
  const endsIn = relTime(live.expiresAt);

  const sayHi = () => {
    ping(`hey ${user.name} 👋 saw you're ${live.text}`, [user.id]);
    setOpenLive(null);
  };
  const askToJoin = () => {
    ping(`mind if i pull up? saw you're ${live.text}`, [user.id]);
    setOpenLive(null);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Hero */}
      <div className="mx-4 mt-2 relative overflow-hidden rounded-2xl h-32
                      bg-gradient-to-br from-rose-500 via-pink-500 to-orange-500">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        <div className="absolute top-3 left-4 flex items-center gap-1.5 text-white/90 text-[11px] uppercase tracking-widest font-bold">
          <Radio size={12} />
          Live now
        </div>
        <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-white text-2xl font-black truncate flex items-center gap-2">
              <span className="text-3xl">{live.emoji}</span>
              <span>{user.name}</span>
            </div>
            <div className="text-white/85 text-sm truncate mt-0.5">{live.text}</div>
          </div>
          <Avatar user={user} size={56} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-4 pb-40">
        {/* Info rows */}
        <InfoRow icon={<Clock size={16} />} label="Started" value={`${startedAgoMin}m ago`} />
        <InfoRow icon={<Clock size={16} />} label="Ends" value={`auto-ends ${endsIn}`} />
        {live.place && (
          <InfoRow icon={<MapPin size={16} />} label="Where" value={live.place} />
        )}
        <InfoRow
          icon={live.openToJoin ? <UserCheck size={16} className="text-emerald-300" /> : <UserX size={16} className="text-zinc-400" />}
          label="Vibe"
          value={live.openToJoin ? 'Open to friends joining' : 'Just sharing — heads-down'}
        />

        {/* Big status callout — friendly tone */}
        <div className={`mt-5 p-4 rounded-2xl border ${
          live.openToJoin
            ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-100'
            : 'bg-white/5 border-white/10 text-zinc-200'
        }`}>
          {live.openToJoin
            ? <>👋 <strong>{user.name}</strong> wants company — say hi or ask to pull up.</>
            : <>🤫 <strong>{user.name}</strong> just wanted to share. A quick ping is still cool.</>
          }
        </div>
      </div>

      {/* Sticky actions */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-4
                      bg-[#0a070f]/95 backdrop-blur-md border-t border-white/10 flex gap-2">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={sayHi}
          className="px-4 py-3.5 rounded-2xl font-bold text-white bg-white/8 border border-white/15
                     inline-flex items-center gap-2"
        >
          <MessageCircle size={16} />
          Say hi
        </motion.button>
        <div className="flex-1">
          {live.openToJoin ? (
            <PulseButton onClick={askToJoin}>
              Ask to pull up
            </PulseButton>
          ) : (
            <PulseButton onClick={sayHi}>
              Send a ping
            </PulseButton>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-white/5">
      <div className="h-8 w-8 grid place-items-center rounded-xl bg-white/5 text-zinc-300">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-[10.5px] uppercase tracking-widest text-zinc-500">{label}</div>
        <div className="text-sm text-zinc-100 font-medium">{value}</div>
      </div>
    </div>
  );
}
