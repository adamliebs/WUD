import { motion } from 'framer-motion';
import { Calendar, MapPin, Search, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../components/Avatar';
import { OverlayShell } from '../components/OverlayShell';
import { CATEGORIES, categoryFor } from '../data/categories';
import { clockTime, relTime, useApp } from '../store';
import type { Activity, CategoryKey, User } from '../types';

const PLAN_LIMIT = 8;
const PEOPLE_LIMIT = 6;

export function SearchScreen() {
  const openOverlay = useApp(s => s.openOverlay);
  const closeOverlay = () => openOverlay(null);
  const openActivity = useApp(s => s.openActivity);
  const setFeedFilter = useApp(s => s.setFeedFilter);
  const meId = useApp(s => s.meId);

  const allUsers = useApp(s => s.users);
  const friendIds = useApp(s => s.friendIds);
  // Search within plans I can actually see (open invite + my squads + my own + FoF).
  const visiblePlans = useApp(useShallow(s => s.activities.filter(a => s.canSeeActivity(a))));

  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount so search-as-you-type starts immediately.
  useEffect(() => { inputRef.current?.focus(); }, []);

  const needle = q.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!needle) return { plans: [], people: [], categories: [] as { key: CategoryKey; label: string; emoji: string }[] };

    const planMatch = (a: Activity) => {
      const cat = categoryFor(a);
      return [a.title, a.place, a.description, cat.label, cat.emoji]
        .some(s => s && s.toLowerCase().includes(needle));
    };
    const personMatch = (u: User) =>
      u.id !== meId && (u.name.toLowerCase().includes(needle) || u.handle.toLowerCase().includes(needle));

    const plans = visiblePlans
      .filter(planMatch)
      .sort((a, b) => a.startsAt - b.startsAt)
      .slice(0, PLAN_LIMIT);

    // Prioritize friends over discoverable users; cap.
    const friends = allUsers.filter(u => friendIds.includes(u.id)).filter(personMatch);
    const others  = allUsers.filter(u => !friendIds.includes(u.id) && u.id !== meId).filter(personMatch);
    const people = [...friends, ...others].slice(0, PEOPLE_LIMIT);

    const categories = CATEGORIES.filter(c =>
      c.label.toLowerCase().includes(needle) || c.emoji.includes(needle)
    );

    return { plans, people, categories };
  }, [needle, visiblePlans, allUsers, friendIds, meId]);

  const empty = needle.length > 0
    && matches.plans.length === 0
    && matches.people.length === 0
    && matches.categories.length === 0;

  const pickCategory = (k: CategoryKey) => {
    setFeedFilter({ category: k });
    closeOverlay();
  };
  const openPlan = (a: Activity) => {
    openActivity(a.id);
    closeOverlay();
  };

  return (
    <OverlayShell title="Search" onClose={closeOverlay}>
      <div className="px-4 pt-4 pb-32">
        {/* Search input */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search plans, friends, categories…"
            className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/10 rounded-2xl text-white text-sm placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
          />
          {q && (
            <button
              onClick={() => { setQ(''); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-full text-zinc-400 hover:bg-white/5"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Empty / placeholder / results */}
        {needle.length === 0 ? (
          <Placeholder onPickCategory={pickCategory} />
        ) : empty ? (
          <div className="text-center mt-12">
            <div className="text-5xl mb-2">🔍</div>
            <div className="text-white font-semibold">No matches for "{q}"</div>
            <div className="text-sm text-zinc-400 mt-1">
              Try a category like Surf, a friend's name, or a place.
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-6">
            {matches.plans.length > 0 && (
              <Section icon={<Calendar size={12} />} title={`Plans · ${matches.plans.length}`}>
                <div className="flex flex-col gap-2">
                  {matches.plans.map(a => <PlanRow key={a.id} activity={a} onOpen={() => openPlan(a)} />)}
                </div>
              </Section>
            )}
            {matches.people.length > 0 && (
              <Section icon={<Users size={12} />} title={`People · ${matches.people.length}`}>
                <div className="flex flex-col gap-2">
                  {matches.people.map(u => (
                    <PersonRow key={u.id} user={u} isFriend={friendIds.includes(u.id)}
                      onTap={() => { openOverlay('friends'); }}
                    />
                  ))}
                </div>
              </Section>
            )}
            {matches.categories.length > 0 && (
              <Section icon={<span>#</span>} title={`Categories · ${matches.categories.length}`}>
                <div className="flex flex-wrap gap-2">
                  {matches.categories.map(c => (
                    <motion.button
                      key={c.key}
                      whileTap={{ scale: 0.94 }}
                      onClick={() => pickCategory(c.key as CategoryKey)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold bg-white/5 border border-white/10 text-white hover:bg-white/10"
                    >
                      <span>{c.emoji}</span>
                      <span>{c.label}</span>
                    </motion.button>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </OverlayShell>
  );
}

/* ─── Placeholder shown when the input is empty ─── */
function Placeholder({ onPickCategory }: { onPickCategory: (k: CategoryKey) => void }) {
  return (
    <div className="mt-5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-1">
        Jump in by category
      </div>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.slice(0, 8).map(c => (
          <motion.button
            key={c.key}
            whileTap={{ scale: 0.94 }}
            onClick={() => onPickCategory(c.key as CategoryKey)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold bg-white/5 border border-white/10 text-white hover:bg-white/10"
          >
            <span>{c.emoji}</span>
            <span>{c.label}</span>
          </motion.button>
        ))}
      </div>
      <div className="text-[11px] text-zinc-500 mt-4 px-1">
        Or type to fuzzy-match plans, friends, and places you can see.
      </div>
    </div>
  );
}

/* ─── Result rows ─── */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-1 flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function PlanRow({ activity, onOpen }: { activity: Activity; onOpen: () => void }) {
  const cat = categoryFor(activity);
  const host = useApp(s => s.userById(activity.hostId));
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onOpen}
      className="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
    >
      <div className={`relative h-11 w-11 rounded-xl overflow-hidden grid place-items-center text-2xl bg-gradient-to-br ${cat.gradient}`}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        <span className="relative drop-shadow">{cat.emoji}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{activity.title}</div>
        <div className="text-[11px] text-zinc-400 truncate flex items-center gap-1.5">
          <span>{host.name}</span>
          <span className="text-zinc-600">·</span>
          <span>{clockTime(activity.startsAt)} · {relTime(activity.startsAt)}</span>
          {activity.place && (
            <>
              <span className="text-zinc-600">·</span>
              <span className="inline-flex items-center gap-0.5 truncate"><MapPin size={9} />{activity.place}</span>
            </>
          )}
        </div>
      </div>
    </motion.button>
  );
}

function PersonRow({
  user, isFriend, onTap,
}: {
  user: User; isFriend: boolean; onTap: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.985 }}
      onClick={onTap}
      className="w-full text-left flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition"
    >
      <Avatar user={user} size={36} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{user.name}</div>
        <div className="text-[11px] text-zinc-400 truncate">@{user.handle}</div>
      </div>
      <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border
                       ${isFriend
                         ? 'bg-emerald-500/10 text-emerald-300 border-emerald-400/30'
                         : 'bg-white/5 text-zinc-300 border-white/10'}`}>
        {isFriend ? 'Friend' : 'Add'}
      </span>
    </motion.button>
  );
}
