import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar, AvatarStack } from '../components/Avatar';
import { OverlayShell } from '../components/OverlayShell';
import { categoryFor } from '../data/categories';
import { useApp, clockTime, relTime } from '../store';
import type { Activity } from '../types';

type Filter = 'all' | 'hosted' | 'joined';

export function HistoryScreen() {
  const openOverlay = useApp(s => s.openOverlay);
  const closeOverlay = () => openOverlay(null);
  const openActivity = useApp(s => s.openActivity);
  const meId = useApp(s => s.meId);

  const pastActivities = useApp(useShallow(s =>
    s.activities
      .filter(a => a.startsAt < Date.now())
      .filter(a => a.hostId === s.meId || a.joinerIds.includes(s.meId))
      .sort((a, b) => b.startsAt - a.startsAt),  // newest first
  ));

  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return pastActivities;
    if (filter === 'hosted') return pastActivities.filter(a => a.hostId === meId);
    return pastActivities.filter(a => a.hostId !== meId);
  }, [filter, pastActivities, meId]);

  const groups = useMemo(() => groupByDayBucket(filtered), [filtered]);

  const hostedCount = pastActivities.filter(a => a.hostId === meId).length;
  const joinedCount = pastActivities.length - hostedCount;

  return (
    <OverlayShell title="History" onClose={closeOverlay}>
      <div className="pb-32">
        {/* Top stats */}
        <div className="px-4 mt-3 grid grid-cols-3 gap-2">
          <StatTile label="Past" value={pastActivities.length} accent="white" />
          <StatTile label="Hosted" value={hostedCount} accent="amber" />
          <StatTile label="Joined" value={joinedCount} accent="emerald" />
        </div>

        {/* Filter pills */}
        <div className="px-4 mt-4">
          <div className="grid grid-cols-3 bg-white/5 border border-white/10 rounded-2xl p-1 relative">
            {(['all', 'hosted', 'joined'] as const).map(f => {
              const active = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="relative py-2 rounded-xl text-sm font-semibold text-zinc-300 capitalize"
                >
                  {active && (
                    <motion.div
                      layoutId="historypill"
                      className="absolute inset-0 bg-white rounded-xl"
                      transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                    />
                  )}
                  <span className={`relative ${active ? 'text-zinc-900' : ''}`}>
                    {f}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List grouped by day bucket */}
        <div className="px-4 mt-5">
          {groups.length === 0 ? (
            <div className="text-center mt-16">
              <div className="text-5xl mb-3">🗓️</div>
              <div className="text-white font-semibold">No past plans yet</div>
              <div className="text-sm text-zinc-400 mt-1">
                Once your upcoming plans wrap, they'll show up here.
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {groups.map(g => (
                <motion.div
                  key={g.label}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="mt-5 first:mt-0"
                >
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
                      {g.label}
                    </div>
                    <div className="flex-1 h-px bg-white/5" />
                    <div className="text-[11px] text-zinc-500">{g.items.length}</div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {g.items.map(a => (
                      <HistoryRow key={a.id} activity={a} onOpen={() => openActivity(a.id)} />
                    ))}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </OverlayShell>
  );
}

function HistoryRow({ activity, onOpen }: { activity: Activity; onOpen: () => void }) {
  const cat = categoryFor(activity);
  const meId = useApp(s => s.meId);
  const host = useApp(s => s.userById(activity.hostId));
  const joiners = useApp(useShallow(s => activity.joinerIds.map(id => s.userById(id))));
  const isHost = activity.hostId === meId;
  const total = 1 + activity.joinerIds.length;

  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
    >
      <div className={`relative h-12 w-12 rounded-xl overflow-hidden grid place-items-center text-2xl bg-gradient-to-br ${cat.gradient}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        <span className="relative drop-shadow">{cat.emoji}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{activity.title}</div>
        <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5">
          <Calendar size={11} className="text-zinc-500" />
          {clockTime(activity.startsAt)} · {relTime(activity.startsAt)}
          <span className="text-zinc-600">·</span>
          <span className="truncate">{isHost ? 'you hosted' : `${host.name} hosted`}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <AvatarStack users={[host, ...joiners]} size={20} max={4} />
          <span className="text-[11px] text-zinc-400">
            <Users size={10} className="inline -mt-0.5 mr-1" />
            {total} {total === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>
      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full
                       ${isHost
                         ? 'bg-amber-400/15 text-amber-200 border border-amber-300/30'
                         : 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30'}`}>
        {isHost ? 'Host' : 'Joined'}
      </span>
    </motion.button>
  );
}

function StatTile({ label, value, accent }: { label: string; value: number; accent: 'white' | 'amber' | 'emerald' }) {
  const accents = {
    white:   'text-white',
    amber:   'text-amber-200',
    emerald: 'text-emerald-200',
  };
  return (
    <div className="rounded-2xl bg-white/5 border border-white/10 px-3 py-3 text-center">
      <div className={`text-2xl font-black ${accents[accent]}`}>{value}</div>
      <div className="text-[10.5px] uppercase tracking-widest text-zinc-400 mt-0.5">{label}</div>
    </div>
  );
}

/** Group sorted (newest-first) past activities into human day buckets. */
function groupByDayBucket(items: Activity[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86_400_000;

  const buckets: Record<string, Activity[]> = {};
  const order: string[] = [];

  const labelFor = (ms: number) => {
    const d = new Date(ms);
    const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOfToday - startOfThatDay) / dayMs);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return 'Earlier this week';
    if (diffDays < 14) return 'Last week';
    if (diffDays < 31) return 'This month';
    return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
  };

  for (const a of items) {
    const label = labelFor(a.startsAt);
    if (!buckets[label]) {
      buckets[label] = [];
      order.push(label);
    }
    buckets[label].push(a);
  }

  return order.map(label => ({ label, items: buckets[label] }));
}
