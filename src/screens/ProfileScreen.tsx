import { motion } from 'framer-motion';
import { Camera, ChevronRight, History, Pencil, Settings, Users, UserPlus } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../components/Avatar';
import { categoryFor } from '../data/categories';
import { useApp, clockTime, relTime } from '../store';

export function ProfileScreen() {
  const me = useApp(s => s.me());
  const friends = useApp(useShallow(s => s.friendIds.map(id => s.userById(id))));
  const friendRequests = useApp(useShallow(s => s.friendRequests));
  // Upcoming = startsAt >= now. Past plans are surfaced in the History overlay.
  const myUpcomingPosts = useApp(useShallow(s =>
    s.activities.filter(a => a.hostId === s.meId && a.startsAt >= Date.now())));
  const myUpcomingJoins = useApp(useShallow(s =>
    s.activities.filter(a => a.hostId !== s.meId && a.joinerIds.includes(s.meId) && a.startsAt >= Date.now())));
  const pastCount = useApp(s =>
    s.activities.filter(a =>
      a.startsAt < Date.now() && (a.hostId === s.meId || a.joinerIds.includes(s.meId)),
    ).length);
  const openActivity = useApp(s => s.openActivity);
  const openOverlay = useApp(s => s.openOverlay);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {/* Hero gradient — uses the color chosen in Edit profile */}
        <div className={`relative h-44 bg-gradient-to-br ${me.color} transition-colors`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => openOverlay('settings')}
            aria-label="Settings"
            className="absolute top-12 right-4 h-9 w-9 rounded-full grid place-items-center bg-black/30 backdrop-blur text-white"
          >
            <Settings size={16} />
          </motion.button>
        </div>

        {/* Avatar overlap */}
        <div className="px-5 -mt-12">
          <div className="relative inline-block">
            <div className="ring-4 ring-[#07060b] rounded-full">
              <Avatar user={me} size={88} />
            </div>
            {/* Camera badge — opens Edit profile (and prompts photo upload) */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => openOverlay('editProfile')}
              aria-label="Change profile photo"
              className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full grid place-items-center
                         bg-gradient-to-br from-rose-500 to-orange-500 text-white
                         ring-2 ring-[#07060b] shadow-[0_10px_25px_-10px_rgba(244,63,94,0.7)]"
            >
              {me.photoUrl ? <Pencil size={14} /> : <Camera size={14} />}
            </motion.button>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-black text-white">{me.name}</div>
            <div className="text-sm text-zinc-400">@{me.handle}</div>
          </div>

          {/* Edit profile — subtle outlined CTA below identity, full width */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => openOverlay('editProfile')}
            className="mt-4 w-full py-2.5 rounded-2xl text-sm font-semibold text-white
                       bg-white/5 border border-white/15 hover:bg-white/10 transition
                       inline-flex items-center justify-center gap-2"
          >
            <Pencil size={14} />
            Edit profile
          </motion.button>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <Stat label="Friends" value={friends.length} />
            <Stat label="Hosting" value={myUpcomingPosts.length} />
            <Stat label="Joined" value={myUpcomingJoins.length} />
          </div>

          {/* History row — opens the History overlay */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => openOverlay('history')}
            className="mt-3 w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
          >
            <div className="h-9 w-9 rounded-xl grid place-items-center bg-gradient-to-br from-zinc-700 to-zinc-900 text-white">
              <History size={16} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-sm font-bold text-white">History</div>
              <div className="text-[11px] text-zinc-400">
                {pastCount === 0
                  ? 'No past plans yet'
                  : `${pastCount} past plan${pastCount === 1 ? '' : 's'}`}
              </div>
            </div>
            <ChevronRight size={18} className="text-zinc-500" />
          </motion.button>

          {/* Squads row — opens the Squads management overlay */}
          <SquadsRow />
        </div>

        {/* Upcoming plans */}
        <Section title="Upcoming plans">
          {myUpcomingPosts.length === 0 && myUpcomingJoins.length === 0 ? (
            <div className="px-5 text-zinc-500 text-sm">Nothing on the calendar — post a plan!</div>
          ) : (
            <div className="px-4 flex flex-col gap-2">
              {[...myUpcomingPosts, ...myUpcomingJoins].map(a => {
                const cat = categoryFor(a);
                const isHost = a.hostId === me.id;
                return (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    key={a.id}
                    onClick={() => openActivity(a.id)}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 text-left"
                  >
                    <div className={`h-11 w-11 rounded-xl grid place-items-center text-2xl bg-gradient-to-br ${cat.gradient}`}>
                      {cat.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-semibold truncate">{a.title}</div>
                      <div className="text-xs text-zinc-400">
                        {clockTime(a.startsAt)} · {relTime(a.startsAt)}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full
                                     ${isHost
                                       ? 'bg-amber-400/15 text-amber-200 border border-amber-300/30'
                                       : 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30'}`}>
                      {isHost ? 'Host' : 'Joined'}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          )}
        </Section>

        {/* New friend request banner — sits right above the Friends section. */}
        {friendRequests.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => openOverlay('friends')}
            className="mt-6 mx-4 flex w-[calc(100%-2rem)] items-center gap-3 p-3 rounded-2xl
                       bg-gradient-to-br from-rose-500/20 to-orange-500/15 border border-rose-400/35 text-left"
          >
            <div className="h-9 w-9 rounded-full grid place-items-center shrink-0
                            bg-gradient-to-br from-rose-500 to-orange-500 text-white">
              <UserPlus size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">
                {friendRequests.length} new friend request{friendRequests.length === 1 ? '' : 's'}
              </div>
              <div className="text-[11px] text-rose-200/80">Tap to review and respond</div>
            </div>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-[11px] font-black text-white shrink-0">
              {friendRequests.length}
            </span>
          </motion.button>
        )}

        {/* Friends */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2 px-5">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Friends</div>
            <button
              onClick={() => openOverlay('friends')}
              className="text-[11px] uppercase tracking-[0.18em] font-bold text-rose-300"
            >
              Manage
            </button>
          </div>
          <div className="px-4 grid grid-cols-2 gap-2">
            {/* Add-friend CTA tile */}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => openOverlay('friends')}
              className="flex items-center gap-3 p-2.5 rounded-2xl bg-gradient-to-br from-rose-500/20 to-orange-500/20 border border-rose-400/30 text-left"
            >
              <div className="h-9 w-9 rounded-full grid place-items-center bg-gradient-to-br from-rose-500 to-orange-500 text-white">
                <UserPlus size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">Find friends</div>
                <div className="text-[11px] text-zinc-300 truncate">Add or remove</div>
              </div>
            </motion.button>

            {friends.map(u => (
              <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10">
                <Avatar user={u} size={36} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{u.name}</div>
                  <div className="text-[11px] text-zinc-400 truncate">@{u.handle}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SquadsRow() {
  const openOverlay = useApp(s => s.openOverlay);
  const count = useApp(s => s.squads.length);
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={() => openOverlay('squads')}
      className="mt-2 w-full flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
    >
      <div className="h-9 w-9 rounded-xl grid place-items-center bg-gradient-to-br from-rose-500/30 to-orange-500/30 border border-rose-400/30 text-white">
        <Users size={16} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-sm font-bold text-white">Squads</div>
        <div className="text-[11px] text-zinc-400">
          {count === 0 ? 'No squads yet' : `${count} squad${count === 1 ? '' : 's'} · BFFs, work crew, etc.`}
        </div>
      </div>
      <ChevronRight size={18} className="text-zinc-500" />
    </motion.button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-3 text-center">
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-[10.5px] uppercase tracking-widest text-zinc-400 mt-0.5">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-5">
        {title}
      </div>
      {children}
    </div>
  );
}
