import { motion } from 'framer-motion';
import { Calendar, Check, Clock, Loader2, MapPin, UserMinus, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar, AvatarStack } from './Avatar';
import { BottomSheet } from './BottomSheet';
import { ImageViewer } from './ImageViewer';
import { socialApi, type ProfilePlan, type UserProfileResp } from '../api/endpoints';
import { mediaUrl } from '../api/client';
import { categoryFor } from '../data/categories';
import { clockTime, relTime, useApp } from '../store';

/**
 * Full-page, swipe-to-dismiss profile for any user (tap an avatar / person
 * row). Shows their identity + social stats, their recent plans you can see,
 * and their friends (with Add buttons to friend their friends). Add / unfriend
 * actions live here too. Stacks above the activity detail sheet so it can be
 * opened from an event's people list.
 */
export function UserProfileSheet() {
  const id = useApp(s => s.openProfileId);
  const close = useApp(s => s.openProfile);
  return (
    <BottomSheet open={!!id} onClose={() => close(null)} elevated>
      {id ? <Body key={id} userId={id} onClose={() => close(null)} /> : null}
    </BottomSheet>
  );
}

function Body({ userId, onClose }: { userId: string; onClose: () => void }) {
  const fallback = useApp(s => s.userById(userId));
  const meId = useApp(s => s.meId);
  const addFriend = useApp(s => s.addFriend);
  const removeFriend = useApp(s => s.removeFriend);
  const openProfile = useApp(s => s.openProfile);
  const openOverlay = useApp(s => s.openOverlay);

  const [data, setData] = useState<UserProfileResp | null>(null);
  const [loading, setLoading] = useState(true);
  // Local relationship overrides so add/unfriend reflect instantly without a
  // refetch (the sheet holds a fetched snapshot).
  const [localAction, setLocalAction] = useState<null | 'added' | 'removed'>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [viewerSrc, setViewerSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    socialApi.profile(userId)
      .then(r => { if (!cancelled) setData(r); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const user = data?.user ?? fallback;
  const isMe = data?.isMe ?? (userId === meId);
  const rel: 'friend' | 'requested' | 'incoming' | 'none' =
    localAction === 'added' ? 'requested'
    : localAction === 'removed' ? 'none'
    : data
      ? (data.isFriend ? 'friend'
        : data.requestState === 'outgoing' ? 'requested'
        : data.requestState === 'incoming' ? 'incoming' : 'none')
      : 'none';

  const onAddFriendOfFriend = (id: string) => {
    addFriend(id);
    setAddedIds(prev => new Set(prev).add(id));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Pinned scroll region (absolute inset + overscroll-contain) so the
          body can't rubber-band/wobble against the sheet's drag — same
          pattern as the activity detail sheet. */}
      <div className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 overflow-y-auto overscroll-contain no-scrollbar pb-10">
        {/* Hero — color band + overlapping avatar */}
        <div className={`relative h-24 bg-gradient-to-br ${user.color}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.3),transparent_55%)]" />
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-2 right-3 h-8 w-8 grid place-items-center rounded-full bg-black/30 text-white backdrop-blur"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 -mt-12">
          {/* Tap the photo to view it full-screen (only when a real photo is set). */}
          <button
            onClick={user.photoUrl ? () => setViewerSrc(mediaUrl(user.photoUrl) ?? null) : undefined}
            disabled={!user.photoUrl}
            className="relative z-10 inline-block rounded-full ring-4 ring-[#140d1f] bg-[#140d1f] overflow-hidden"
            aria-label={user.photoUrl ? 'View photo' : undefined}
          >
            <Avatar user={user} size={88} />
          </button>

          <div className="mt-3">
            <div className="text-2xl font-black text-white">{user.name}</div>
            <div className="text-sm text-zinc-400">@{user.handle}</div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-8 mt-4">
            <Stat label="Friends" value={data?.friendCount ?? 0} loading={loading && !data} />
            {!isMe && <Stat label="Mutual" value={data?.mutualCount ?? 0} loading={loading && !data} />}
          </div>

          {/* Mutual friends preview */}
          {!isMe && data && data.mutuals.length > 0 && (
            <div className="mt-3 inline-flex items-center gap-2">
              <AvatarStack users={data.mutuals} size={22} max={5} />
              <span className="text-[12px] text-zinc-300">
                {data.mutualCount === 1
                  ? <><span className="font-semibold">{data.mutuals[0].name}</span> is a mutual friend</>
                  : <><span className="font-semibold">{data.mutualCount}</span> mutual friends</>}
              </span>
            </div>
          )}

          {/* Relationship action */}
          {data && !isMe && (
            <div className="mt-5">
              {rel === 'friend' ? (
                confirmingRemove ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { removeFriend(userId); setLocalAction('removed'); setConfirmingRemove(false); }}
                      className="flex-1 py-3 rounded-2xl font-bold text-white bg-rose-500 text-sm"
                    >
                      Unfriend {user.name}
                    </button>
                    <button
                      onClick={() => setConfirmingRemove(false)}
                      className="px-4 py-3 rounded-2xl font-bold text-zinc-300 bg-white/5 border border-white/10 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold
                                    bg-emerald-500/15 border border-emerald-400/30 text-emerald-200">
                      <Check size={15} /> Friends
                    </div>
                    <button
                      onClick={() => setConfirmingRemove(true)}
                      className="px-4 py-3 rounded-2xl text-sm font-bold text-zinc-300 bg-white/5 border border-white/10 inline-flex items-center gap-1.5"
                    >
                      <UserMinus size={14} /> Remove
                    </button>
                  </div>
                )
              ) : rel === 'requested' ? (
                <div className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold
                                bg-white/5 border border-white/10 text-zinc-300">
                  <Clock size={14} /> Request sent
                </div>
              ) : rel === 'incoming' ? (
                <button
                  onClick={() => { onClose(); openOverlay('friends'); }}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-white inline-flex items-center justify-center gap-2
                             bg-gradient-to-br from-rose-500 to-orange-500 shadow-[0_14px_30px_-12px_rgba(244,63,94,0.55)]"
                >
                  <UserPlus size={16} /> Respond to request
                </button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { addFriend(userId); setLocalAction('added'); }}
                  className="w-full py-3 rounded-2xl text-sm font-bold text-white inline-flex items-center justify-center gap-2
                             bg-gradient-to-br from-rose-500 to-orange-500 shadow-[0_14px_30px_-12px_rgba(244,63,94,0.55)]"
                >
                  <UserPlus size={16} /> Add friend
                </motion.button>
              )}
            </div>
          )}

          {/* Recent plans — display only (not tappable), 3 most recent */}
          {data && data.recentPlans.length > 0 && (
            <Section title="Recent plans">
              <div className="flex flex-col gap-2">
                {data.recentPlans.slice(0, 3).map(p => (
                  <PlanRow key={p.id} plan={p} />
                ))}
              </div>
            </Section>
          )}

          {/* Their friends — tap to view, Add to friend their friends */}
          {data && data.friends.length > 0 && (
            <Section title={`Friends${data.friendCount > data.friends.length ? ` · ${data.friendCount}` : ''}`}>
              <div className="flex flex-col gap-2">
                {data.friends.map(f => {
                  const requested = addedIds.has(f.id);
                  return (
                    <button
                      key={f.id}
                      onClick={() => openProfile(f.id)}
                      className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10
                                 hover:bg-white/10 active:bg-white/[0.13] transition text-left"
                    >
                      <Avatar user={f} size={36} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{f.name}</div>
                        <div className="text-[11px] text-zinc-400 truncate">@{f.handle}</div>
                      </div>
                      {f.id !== meId && (
                        f.isFriend ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/80 px-2 py-1">Friends</span>
                        ) : requested ? (
                          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 px-2 py-1">Sent</span>
                        ) : (
                          <span
                            role="button"
                            onClick={(e) => { e.stopPropagation(); onAddFriendOfFriend(f.id); }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold text-white
                                       bg-gradient-to-br from-rose-500 to-orange-500"
                          >
                            <UserPlus size={12} /> Add
                          </span>
                        )
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>
          )}

          {loading && !data && (
            <div className="mt-10 text-center text-sm text-zinc-500 inline-flex items-center gap-2 w-full justify-center">
              <Loader2 size={15} className="animate-spin" /> Loading profile…
            </div>
          )}
        </div>
        </div>
      </div>

      <ImageViewer src={viewerSrc} onClose={() => setViewerSrc(null)} />
    </div>
  );
}

function Stat({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div>
      <div className="text-2xl font-black text-white h-8 flex items-center">
        {loading ? <Loader2 size={16} className="animate-spin text-zinc-500" /> : value}
      </div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-7">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">{title}</div>
      {children}
    </div>
  );
}

function PlanRow({ plan }: { plan: ProfilePlan }) {
  const cat = categoryFor(plan);
  return (
    <div className="w-full flex items-center gap-3 p-2.5 rounded-2xl bg-white/5 border border-white/10 text-left">
      <div className={`h-10 w-10 shrink-0 grid place-items-center rounded-xl text-lg bg-gradient-to-br ${cat.gradient} ${plan.isPast ? 'opacity-60' : ''}`}>
        {cat.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold truncate ${plan.isPast ? 'text-zinc-400' : 'text-white'}`}>{plan.title}</div>
        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 min-w-0">
          <Calendar size={10} className="shrink-0" />
          <span className="shrink-0">{plan.isPast ? relTime(plan.startsAt) : `${clockTime(plan.startsAt)} · ${relTime(plan.startsAt)}`}</span>
          {plan.place && (
            <>
              <span className="text-white/20 shrink-0">·</span>
              <MapPin size={10} className="shrink-0" />
              <span className="truncate">{plan.place}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
