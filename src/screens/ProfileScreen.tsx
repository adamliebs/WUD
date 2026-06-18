import { AnimatePresence, motion } from 'framer-motion';
import { Camera, ChevronRight, History, Pencil, Settings, Users, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../components/Avatar';
import { ImageViewer } from '../components/ImageViewer';
import { categoryFor } from '../data/categories';
import { mediaUrl } from '../api/client';
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
  // Full-screen viewer for tapping your own profile photo.
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <MeBackgroundOrbs />
      <div className="relative flex-1 overflow-y-auto overscroll-none no-scrollbar pb-32">
        {/* Hero gradient — uses the color chosen in Edit profile */}
        <div className={`relative h-44 bg-gradient-to-br ${me.color} transition-colors`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        </div>

        {/* Avatar overlap */}
        <div className="px-5 -mt-12">
          <div className="relative inline-block">
            {/* Tap the photo to view it full-screen (only when a real photo is
                set — the emoji avatar has nothing to enlarge). */}
            <button
              type="button"
              onClick={me.photoUrl ? () => setViewerSrc(mediaUrl(me.photoUrl) ?? null) : undefined}
              disabled={!me.photoUrl}
              aria-label={me.photoUrl ? 'View profile photo' : undefined}
              className="ring-4 ring-[#07060b] rounded-full block"
            >
              <Avatar user={me} size={88} />
            </button>
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

          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-2xl font-black text-white truncate">{me.name}</div>
              <div className="text-sm text-zinc-400 truncate">@{me.handle}</div>
            </div>
            {/* Settings — moved out of the hero so the colored banner reads
                cleaner. Lives at name-level on the right so it stays a
                glanceable affordance without dominating. */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => openOverlay('settings')}
              aria-label="Settings"
              className="shrink-0 h-10 w-10 grid place-items-center rounded-full
                         bg-white/5 border border-white/10 text-zinc-200 hover:bg-white/10 transition"
            >
              <Settings size={16} />
            </motion.button>
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

        {/* New friend request banner — sits directly below the Edit /
            Squads block so the user spots a pending request before they
            even scroll to Upcoming plans. */}
        {friendRequests.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => openOverlay('friends')}
            className="mt-4 mx-4 flex w-[calc(100%-2rem)] items-center gap-3 p-3 rounded-2xl
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

        {/* Upcoming plans */}
        <Section title="Upcoming plans">
          {myUpcomingPosts.length === 0 && myUpcomingJoins.length === 0 ? (
            <div className="px-5 text-center pt-2 pb-1">
              <motion.div
                animate={{ y: [0, -6, 0], rotate: [0, 4, 0, -4, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="text-3xl"
              >
                📭
              </motion.div>
              <div className="text-sm text-zinc-300 font-medium mt-1.5">
                Nothing on the calendar
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Post a plan or float an idea to get something rolling.
              </div>
            </div>
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

      {/* Full-screen profile-photo viewer. */}
      <AnimatePresence>
        {viewerSrc && (
          <ImageViewer src={viewerSrc} onClose={() => setViewerSrc(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Background orbs for the Me tab — emerald · violet · sky for a quieter,
 *  more personal feel that doesn't compete with the user's chosen hero color. */
function MeBackgroundOrbs() {
  // Static orbs — see FeedScreen's FeedBackgroundOrbs comment for why
  // the looping drift was dropped across every tab.
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute top-1/2 -left-16 h-72 w-72 rounded-full bg-emerald-500/8 blur-3xl"
        style={{ willChange: 'filter' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      />
      <motion.div
        className="absolute top-1/4 -right-12 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl"
        style={{ willChange: 'filter' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.05 }}
      />
      <motion.div
        className="absolute bottom-10 left-1/3 h-56 w-56 rounded-full bg-sky-500/8 blur-3xl"
        style={{ willChange: 'filter' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
      />
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
