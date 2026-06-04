import { AnimatePresence, motion } from 'framer-motion';
import { Pencil, Send, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { isLiveActivity, useApp } from '../store';
import { Avatar } from './Avatar';
import type { User } from '../types';

/**
 * "Ping your friends" rail at the top of the Floats tab — brings back the
 * old Ping-page UX. Same component still owns the presence calculation
 * and friend visibility, but the interaction is now flat:
 *
 *   • Tap an avatar to add/remove it from the selection.
 *   • A preset strip directly below the avatars lets you fire a quick
 *     ping (Wave, WUD?, Coffee?, …) at the selection. With nothing
 *     selected the preset fans to ALL friends — same fall-back rule the
 *     existing pingFriends store action uses.
 *   • A "Custom" chip on the strip expands an inline text input.
 *
 * Presence dots (from the local activity store):
 *   • Live now     — pulsing rose dot, friend is hosting an active plan
 *   • Posted today — steady amber dot, friend posted any plan in the last 24h
 *
 * Sending a ping fires a delightful little burst — a 👋 (or the preset's
 * emoji) flies up from each targeted avatar and fades, while the avatars
 * themselves do a quick spring wiggle. Pure visual sugar so the action
 * FEELS warm and personal.
 */

const TODAY_MS = 24 * 60 * 60 * 1000;

/** Quick-ping presets shown as chips under the rail. Each carries the
 *  text body sent to recipients + the emoji used in the burst animation.
 *  Custom is special-cased below — picks open a text input instead of
 *  firing immediately. */
interface Preset {
  emoji: string;
  label: string;
  body: string;
}

const PRESETS: Preset[] = [
  { emoji: '👋', label: 'Wave',   body: '👋' },
  { emoji: '💬', label: 'WUD?',   body: 'WUD?' },
  { emoji: '☕', label: 'Coffee?', body: 'Coffee? ☕' },
  { emoji: '🍕', label: 'Food?',  body: 'Food? 🍕' },
  { emoji: '🏃', label: 'Run?',   body: 'Run? 🏃' },
  { emoji: '🍻', label: 'Drinks?', body: 'Drinks? 🍻' },
];

interface Presence {
  live: boolean;
  today: boolean;
}

export function FriendsRail() {
  const friends = useApp(useShallow(s => s.friendIds.map(id => s.userById(id))));
  const activities = useApp(s => s.activities);
  const pingFriends = useApp(s => s.pingFriends);

  // Compute presence per friend. Live = currently hosting; today = posted
  // anything in the last 24h. Cheap enough to recompute when activities
  // change — feed-sized data, not chat scale.
  const presence = useMemo<Record<string, Presence>>(() => {
    const map: Record<string, Presence> = {};
    const cutoff = Date.now() - TODAY_MS;
    for (const u of friends) {
      const owned = activities.filter(a => a.hostId === u.id);
      map[u.id] = {
        live: owned.some(isLiveActivity),
        today: owned.some(a => a.createdAt > cutoff),
      };
    }
    return map;
  }, [friends, activities]);

  // Sort: live first, then today, then alphabetical. Keeps the most
  // "around right now" friends at the head of the strip.
  const sorted = useMemo(() => {
    return [...friends].sort((a, b) => {
      const pa = presence[a.id], pb = presence[b.id];
      if (pa.live !== pb.live) return pa.live ? -1 : 1;
      if (pa.today !== pb.today) return pa.today ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [friends, presence]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Per-avatar wrapper refs — drives the burst origin (flying emojis
  // spawn from each targeted avatar's screen position). Typed as
  // HTMLElement so the tile can wrap the avatar in either a button or a
  // div without us re-plumbing the ref signature.
  const avatarRefs = useRef<Map<string, HTMLElement | null>>(new Map());
  // Flying-emoji bursts. Each entry carries an id (AnimatePresence key)
  // plus the (x, y) origin so motion.div lands at the right spot.
  const [flying, setFlying] = useState<{ id: string; x: number; y: number; emoji: string }[]>([]);
  // One-shot wiggle counter per avatar — bumping the value re-keys the
  // motion.div so the same avatar can wiggle multiple times in a row.
  const [wiggleTicks, setWiggleTicks] = useState<Record<string, number>>({});
  // Custom-ping input expansion + draft text. The input mounts inline
  // below the preset strip so the user never leaves the rail.
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');

  // Reset the custom panel whenever the selection drops to zero. Without
  // this, opening Custom → manually deselecting everyone → re-selecting
  // someone would auto-expand the input even though the user didn't
  // re-tap Custom. Cleaner to start fresh on every "you have someone
  // selected now" transition.
  useEffect(() => {
    if (selected.size === 0 && customOpen) {
      setCustomOpen(false);
      setCustomText('');
    }
  }, [selected.size, customOpen]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(friends.map(f => f.id)));
  const clearSelection = () => setSelected(new Set());

  // Compute the actual recipient set for a ping fire. Nothing selected =
  // all friends (matches the old Ping page semantics + the existing
  // pingFriends fallback).
  const recipientsFor = (): string[] =>
    selected.size > 0 ? [...selected] : friends.map(f => f.id);

  /**
   * Spawn flying emojis from each recipient's avatar, bump their wiggle
   * counters, and schedule cleanup of the spawned bursts. Pure visual.
   */
  const burstFromAvatars = (ids: string[], emoji: string) => {
    const now = performance.now();
    const next: { id: string; x: number; y: number; emoji: string }[] = [];
    for (const fid of ids) {
      const el = avatarRefs.current.get(fid);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      next.push({
        id: `${now}-${fid}-${Math.random().toString(36).slice(2, 6)}`,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
        emoji,
      });
    }
    if (next.length === 0) return;
    setFlying(prev => [...prev, ...next]);
    setWiggleTicks(prev => {
      const updated = { ...prev };
      for (const fid of ids) updated[fid] = (updated[fid] ?? 0) + 1;
      return updated;
    });
    window.setTimeout(() => {
      setFlying(prev => prev.filter(e => !next.find(n => n.id === e.id)));
    }, 1200);
  };

  const firePreset = (preset: Preset) => {
    const ids = recipientsFor();
    if (ids.length === 0) return;
    pingFriends(preset.body, ids);
    burstFromAvatars(ids, preset.emoji);
    clearSelection();
    // If the custom panel was open, close it — the user clearly switched
    // to a preset instead.
    if (customOpen) { setCustomOpen(false); setCustomText(''); }
  };

  const fireCustom = () => {
    const body = customText.trim();
    if (!body) return;
    const ids = recipientsFor();
    if (ids.length === 0) return;
    pingFriends(body, ids);
    burstFromAvatars(ids, '💬');
    clearSelection();
    setCustomText('');
    setCustomOpen(false);
  };

  if (friends.length === 0) return null;

  const selectionLabel =
    selected.size === 0 ? 'Tap to pick someone to ping'
    : selected.size === 1 ? '1 friend selected'
    : `${selected.size} friends selected`;

  return (
    <>
      <div className="px-1 mt-1 mb-4">
        {/* Header — title + selection state. Always shows "Ping your
            friends" so the surface's purpose is clear; the right side
            reflects the live selection ("3 selected" + a Clear pill) so
            the user can always see who they're targeting. */}
        <div className="flex items-end justify-between mb-2 px-3 gap-2">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 font-semibold">
              Ping your friends
            </div>
            <div className={`text-[11px] mt-0.5 truncate
                             ${selected.size > 0 ? 'text-rose-300 font-semibold' : 'text-zinc-500'}`}>
              {selectionLabel}
            </div>
          </div>
          {/* Both buttons always rendered. Clear's visibility is a CSS
              opacity + width toggle so the All button doesn't get yanked
              sideways by a layout reflow every time Clear mounts/unmounts.
              All button uses a solid rose tint (no gradient) when active —
              gradients can't tween, so the previous version snapped the
              background while smoothly transitioning the text + border,
              which read as glitchy. Single transition-colors property
              keeps the toggle clean. */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={clearSelection}
              tabIndex={selected.size > 0 ? 0 : -1}
              aria-hidden={selected.size === 0}
              className={`h-7 inline-flex items-center gap-1 rounded-full text-[11px] font-semibold
                          text-zinc-300 bg-white/5 border border-white/10 hover:bg-white/10
                          transition-all duration-150 ease-out overflow-hidden whitespace-nowrap
                          ${selected.size > 0
                            ? 'opacity-100 max-w-[80px] px-2.5'
                            : 'opacity-0 max-w-0 px-0 border-transparent pointer-events-none'}`}
            >
              <X size={11} />
              Clear
            </button>
            <button
              onClick={() => selected.size === friends.length ? clearSelection() : selectAll()}
              className={`h-7 px-2.5 inline-flex items-center gap-1 rounded-full text-[11px] font-bold
                          border transition-colors duration-150 ease-out
                          ${selected.size === friends.length
                            ? 'bg-rose-500/20 text-rose-100 border-rose-400/50'
                            : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
            >
              <Users size={11} />
              All
            </button>
          </div>
        </div>

        {/* The rail itself — horizontal scroll. Tap toggles selection.
            `-mx-5 px-3` pushes the scroll container past the grandparent's
            px-4 + our px-1 so the avatars run all the way to the actual
            phone edge instead of getting cut off short. */}
        <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-3 py-1">
          {sorted.map((u, i) => (
            <FriendTile
              key={u.id}
              user={u}
              presence={presence[u.id]}
              selected={selected.has(u.id)}
              anySelected={selected.size > 0}
              onTap={() => toggle(u.id)}
              registerRef={el => { avatarRefs.current.set(u.id, el); }}
              wiggleTick={wiggleTicks[u.id] ?? 0}
              entryDelay={Math.min(i * 0.03, 0.4)}
            />
          ))}
        </div>

        {/* Preset strip — only mounts when the user has at least one friend
            selected. Slides down with a height transition so the empty
            "no selection" state stays compact. AnimatePresence cleanly
            unmounts the strip (and resets the Custom input) when the
            user clears the selection. */}
        <AnimatePresence initial={false}>
          {selected.size > 0 && (
            <motion.div
              key="presets"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden px-1"
            >
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {PRESETS.map(p => (
                  <motion.button
                    key={p.label}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => firePreset(p)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full
                               bg-white/5 border border-white/10 hover:bg-white/10 transition
                               text-[12px] font-semibold text-zinc-100"
                  >
                    <span className="text-base leading-none">{p.emoji}</span>
                    <span>{p.label}</span>
                  </motion.button>
                ))}
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setCustomOpen(o => !o)}
                  aria-pressed={customOpen}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12px] font-semibold transition border
                              ${customOpen
                                ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-300 shadow-[0_8px_22px_-8px_rgba(244,63,94,0.7)]'
                                : 'bg-white/5 text-zinc-100 border-white/10 hover:bg-white/10'}`}
                >
                  <Pencil size={12} />
                  Custom
                </motion.button>
              </div>

              {/* Custom input — expands inline when "Custom" is tapped. */}
              <AnimatePresence initial={false}>
                {customOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="flex gap-2 px-1">
                      <input
                        autoFocus
                        value={customText}
                        onChange={e => setCustomText(e.target.value.slice(0, 120))}
                        onKeyDown={e => { if (e.key === 'Enter') fireCustom(); }}
                        placeholder="Say something…"
                        className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder:text-zinc-500
                                   focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
                      />
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={fireCustom}
                        disabled={!customText.trim()}
                        className={`h-9 px-4 inline-flex items-center gap-1 rounded-full text-[12px] font-bold transition
                                    ${customText.trim()
                                      ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-[0_8px_22px_-8px_rgba(244,63,94,0.6)]'
                                      : 'bg-white/5 text-zinc-500 border border-white/10 cursor-not-allowed'}`}
                      >
                        <Send size={12} />
                        Send
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Flying emoji burst layer — fixed to the viewport so the elements
          aren't clipped by the rail's overflow-x-auto container. */}
      <div className="fixed inset-0 z-[80] pointer-events-none overflow-hidden">
        <AnimatePresence>
          {flying.map(e => (
            <motion.span
              key={e.id}
              initial={{ x: e.x - 14, y: e.y - 14, opacity: 0, scale: 0.6, rotate: -10 }}
              animate={{
                x: e.x - 14 + (Math.random() * 30 - 15),
                y: e.y - 90,
                opacity: [0, 1, 1, 0],
                scale: [0.6, 1.6, 1.4, 1.2],
                rotate: [0, 12, -8, 0],
              }}
              transition={{ duration: 1.1, ease: 'easeOut', times: [0, 0.2, 0.7, 1] }}
              className="absolute text-[28px] leading-none select-none"
              aria-hidden
            >
              {e.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

/* ───────────────────────────── FriendTile ───────────────────────────── */

function FriendTile({
  user, presence, selected, anySelected, onTap, registerRef,
  wiggleTick, entryDelay,
}: {
  user: User;
  presence: Presence;
  selected: boolean;
  anySelected: boolean;
  onTap: () => void;
  registerRef: (el: HTMLElement | null) => void;
  wiggleTick: number;
  entryDelay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 360, damping: 24, delay: entryDelay }}
      className="shrink-0 flex flex-col items-center gap-1 w-[68px] select-none"
    >
      <button
        ref={registerRef}
        onClick={onTap}
        className="relative"
        aria-pressed={selected}
        aria-label={`Select ${user.name}`}
      >
        <motion.div
          // Wiggle key bumps each preset fire — the spring restarts when
          // the key changes so the same avatar can shake multiple times.
          key={wiggleTick}
          animate={wiggleTick > 0
            ? { rotate: [0, -10, 10, -6, 6, 0], scale: [1, 1.05, 1.05, 1.02, 1.02, 1] }
            : undefined}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          whileTap={{ scale: 0.92 }}
          className={`relative rounded-full transition
                      ${selected ? 'ring-2 ring-rose-400 ring-offset-2 ring-offset-[#07060b]' : ''}
                      ${anySelected && !selected ? 'opacity-55' : ''}`}
        >
          <Avatar user={user} size={52} />
          {selected && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 540, damping: 24 }}
              className="absolute -bottom-0.5 -right-0.5 h-5 w-5 grid place-items-center rounded-full
                         bg-gradient-to-br from-rose-500 to-orange-500 text-white text-[11px] font-black
                         ring-2 ring-[#07060b]"
              aria-hidden
            >
              ✓
            </motion.span>
          )}
          {/* Presence indicator. Live trumps Today; only the more
              important dot renders. Live pulses; Today is steady so it
              doesn't compete for attention. */}
          {!selected && presence.live && (
            <span
              aria-label="Live now"
              className="absolute top-0 right-0 h-3 w-3 rounded-full bg-rose-400 ring-2 ring-[#07060b] live-dot"
            />
          )}
          {!selected && !presence.live && presence.today && (
            <span
              aria-label="Posted today"
              className="absolute top-0 right-0 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-[#07060b]"
            />
          )}
        </motion.div>
      </button>
      <div className="text-[10px] text-zinc-300 truncate w-full text-center font-medium">
        {user.name.split(' ')[0]}
      </div>
    </motion.div>
  );
}
