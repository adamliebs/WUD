import { motion } from 'framer-motion';
import { Clock, Lock, MapPin, Repeat, Users } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { categoryFor } from '../data/categories';
import { useApp, clockTime, isLiveActivity, isPast, recurrenceLabel, relTime } from '../store';
import { mediaUrl } from '../api/client';
import type { Activity } from '../types';
import { Avatar, AvatarStack } from './Avatar';
import { ReactionBar } from './ReactionBar';

interface Props {
  activity: Activity;
}

export function ActivityCard({ activity }: Props) {
  const cat = categoryFor(activity);
  const host = useApp(s => s.userById(activity.hostId));
  const joiners = useApp(useShallow(s => activity.joinerIds.map(id => s.userById(id))));
  const me = useApp(s => s.me());
  const open = useApp(s => s.openActivity);
  const setRsvp = useApp(s => s.setRsvp);
  const isHost = host.id === me.id;
  const hasJoined = activity.joinerIds.includes(me.id);
  const hasMaybe  = activity.maybeIds.includes(me.id);
  const isFoF = useApp(s => !s.isFriend(activity.hostId));
  const startsInMs = activity.startsAt - Date.now();
  const over = isPast(activity);
  const live = isLiveActivity(activity);
  // "Soon" is the pre-window warning: the plan hasn't started yet and is
  // within 15 minutes. Once it crosses startsAt it becomes "Live" instead.
  const soon = !over && !live && startsInMs <= 15 * 60 * 1000 && startsInMs > 0;

  const total = 1 + activity.joinerIds.length;
  const full = activity.maxSize ? total >= activity.maxSize : false;
  const maybeCount = activity.maybeIds.length;

  const buttonState: 'idle' | 'joined' | 'host' | 'full' | 'over' =
    over ? 'over' :
    isHost ? 'host' :
    hasJoined ? 'joined' :
    full ? 'full' :
    'idle';

  return (
    <motion.div
      layout
      whileTap={{ scale: 0.985 }}
      onClick={() => open(activity.id)}
      className={`relative overflow-hidden rounded-3xl glass cursor-pointer ${over ? 'opacity-70' : ''}`}
    >
      {/* Header — banner image if provided, otherwise the category gradient */}
      <div className={`relative h-24 ${activity.bannerUrl ? 'bg-zinc-900' : `bg-gradient-to-br ${cat.gradient}`}`}>
        {activity.bannerUrl ? (
          <>
            <img
              src={mediaUrl(activity.bannerUrl)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            {/* Darken the bottom so the host avatar + chips stay legible. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/30" />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        )}
        <div className="absolute top-3 left-4 flex items-center gap-2">
          <span className="text-2xl drop-shadow">{cat.emoji}</span>
          <span className="text-white/90 text-xs font-semibold uppercase tracking-widest">
            {cat.label}
          </span>
          {activity.isPrivate && (
            <span className="ml-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white bg-black/35 backdrop-blur px-1.5 py-0.5 rounded-full">
              <Lock size={9} strokeWidth={3} />
              Private
            </span>
          )}
          {activity.recurrence && (
            <span className="ml-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white bg-black/35 backdrop-blur px-1.5 py-0.5 rounded-full">
              <Repeat size={9} strokeWidth={3} />
              {recurrenceLabel(activity.recurrence)}
            </span>
          )}
          <SquadChip squadIds={activity.squadIds} />
        </div>
        {live && (
          <div className="absolute top-3 right-4 flex items-center gap-1.5 text-white text-[10px] font-bold uppercase tracking-widest bg-rose-500/85 backdrop-blur px-2 py-1 rounded-full shadow-[0_4px_14px_-4px_rgba(244,63,94,0.7)]">
            <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-white text-white live-dot" />
            Live
          </div>
        )}
        {soon && (
          <div className="absolute top-3 right-4 flex items-center gap-1.5 text-white text-xs font-semibold bg-black/30 backdrop-blur px-2 py-1 rounded-full">
            <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-rose-300 text-rose-300 live-dot" />
            Soon
          </div>
        )}
        {over && (
          <div className="absolute top-3 right-4 text-zinc-100 text-[10px] font-bold uppercase tracking-widest bg-black/45 backdrop-blur px-2 py-1 rounded-full">
            Over
          </div>
        )}
        {isFoF && (
          <div className="absolute bottom-2 right-3 text-[10px] font-medium text-white/90 bg-black/30 backdrop-blur px-2 py-0.5 rounded-full">
            friend of friend
          </div>
        )}

        {/* Host avatar floating */}
        <div className="absolute -bottom-6 left-4">
          <Avatar user={host} size={52} ring />
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pt-8 pb-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-white font-semibold text-base leading-tight">
              {activity.title}
            </div>
            <div className="text-zinc-400 text-xs mt-0.5">
              <span className="text-zinc-200 font-medium">{host.name}</span>
              {' · '}
              {isHost ? 'you\'re hosting' : 'is hosting'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 text-zinc-300 text-xs">
          <div className="flex items-center gap-1.5">
            <Clock size={13} className="text-zinc-400" />
            <span className="font-medium">{clockTime(activity.startsAt)}</span>
            <span className="text-zinc-500">· {relTime(activity.startsAt)}</span>
          </div>
          {activity.place && (
            <div className="flex items-center gap-1.5 min-w-0">
              <MapPin size={13} className="text-zinc-400 shrink-0" />
              <span className="truncate">{activity.place}</span>
            </div>
          )}
        </div>

        {/* Reactions — tappable strip; stops propagation so reacting doesn't open the card */}
        <div className="mt-3" onClick={e => e.stopPropagation()}>
          <ReactionBar
            activityId={activity.id}
            reactions={activity.reactions}
            size="compact"
            stopPropagation
          />
        </div>

        {/* Footer: avatar stack + RSVP actions */}
        <div className="flex items-center justify-between mt-4 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AvatarStack
              users={[host, ...joiners]}
              size={26}
              max={4}
            />
            <div className="text-xs text-zinc-400 truncate">
              <Users size={11} className="inline mr-1 -mt-0.5" />
              {total}{activity.maxSize ? `/${activity.maxSize}` : ''} going
              {maybeCount > 0 && (
                <span className="text-zinc-500"> · {maybeCount} maybe</span>
              )}
            </div>
          </div>

          {/* RSVP actions — Maybe chip + Going button. Hidden for host/over states. */}
          <div className="flex items-center gap-1.5 shrink-0">
            {!isHost && !over && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setRsvp(activity.id, hasMaybe ? 'none' : 'maybe');
                }}
                className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold transition border
                            ${hasMaybe
                              ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'
                              : 'bg-white/5 text-zinc-300 border-white/10 hover:bg-white/10'}`}
              >
                {hasMaybe ? '✓ Maybe' : 'Maybe'}
              </motion.button>
            )}
            <JoinButton
              disabled={buttonState !== 'idle'}
              state={buttonState}
              onClick={(e) => { e.stopPropagation(); setRsvp(activity.id, 'going'); }}
            />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function JoinButton({
  state, disabled, onClick,
}: {
  state: 'idle' | 'joined' | 'host' | 'full' | 'over';
  disabled: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  const label =
    state === 'over'   ? '✓ Over' :
    state === 'host'   ? '👑 Hosting' :
    state === 'joined' ? '✓ Joined' :
    state === 'full'   ? 'Full' :
                         '+ Join';
  const cls =
    state === 'idle'
      ? 'bg-white text-zinc-900 hover:bg-white/90'
      : state === 'joined'
      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
      : state === 'host'
      ? 'bg-amber-400/20 text-amber-200 border border-amber-300/30'
      : state === 'over'
      ? 'bg-zinc-700/40 text-zinc-300 border border-zinc-600'
      : 'bg-zinc-700/40 text-zinc-400 border border-zinc-700';

  return (
    <motion.button
      whileTap={!disabled ? { scale: 0.92 } : undefined}
      disabled={disabled}
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition ${cls}`}
    >
      {label}
    </motion.button>
  );
}


function SquadChip({ squadIds }: { squadIds: string[] }) {
  const tagged = useApp(useShallow(s =>
    squadIds.map(id => s.squads.find(x => x.id === id)).filter(Boolean) as { emoji: string; name: string; id: string }[]
  ));
  if (tagged.length === 0) return null;
  const first = tagged[0];
  const rest = tagged.length - 1;
  return (
    <span className="ml-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white bg-rose-500/40 backdrop-blur px-1.5 py-0.5 rounded-full">
      <span>{first.emoji}</span>
      {first.name}
      {rest > 0 && <span className="text-white/85">+{rest}</span>}
    </span>
  );
}
