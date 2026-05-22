import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { Check, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../components/Avatar';
import { PulseButton } from '../components/PulseButton';
import { useApp } from '../store';

const PRESETS = [
  { emoji: '😩', text: "i'm booored" },
  { emoji: '👀', text: 'WUD tonight?' },
  { emoji: '🍕', text: 'food run?' },
  { emoji: '🏖️', text: 'beach day?' },
  { emoji: '🎮', text: 'game night?' },
  { emoji: '☕', text: 'coffee?' },
];

export function PingScreen() {
  const ping = useApp(s => s.pingFriends);
  const friends = useApp(useShallow(s => s.friendIds.map(id => s.userById(id))));
  const squads = useApp(s => s.squads);
  const [text, setText] = useState('');

  // Default = everyone selected. Stay in sync with the friends list (new friends
  // auto-join the selection; removed friends drop out).
  const [selectedIds, setSelectedIds] = useState<string[]>(() => friends.map(u => u.id));
  useEffect(() => {
    setSelectedIds(prev => {
      const next = [...prev];
      for (const f of friends) if (!next.includes(f.id)) next.push(f.id);
      return next.filter(id => friends.some(f => f.id === id));
    });
  }, [friends]);

  const allSelected = selectedIds.length === friends.length;
  const noneSelected = selectedIds.length === 0;

  const toggleFriend = (id: string) =>
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  const toggleAll = () =>
    setSelectedIds(allSelected ? [] : friends.map(u => u.id));

  // Sort friends so selected ones appear first — feels nice as you toggle.
  const sortedFriends = useMemo(
    () => [...friends].sort((a, b) => {
      const aSel = selectedIds.includes(a.id) ? 0 : 1;
      const bSel = selectedIds.includes(b.id) ? 0 : 1;
      return aSel - bSel;
    }),
    [friends, selectedIds],
  );

  const recipientLabel =
    allSelected ? 'all friends'
    : noneSelected ? 'no one yet'
    : selectedIds.length === 1
      ? friends.find(f => f.id === selectedIds[0])!.name
      : `${selectedIds.length} of ${friends.length} friends`;

  const send = (msg: string) => {
    if (!msg.trim()) return;
    if (noneSelected) return;
    ping(msg, allSelected ? undefined : selectedIds);
    confetti({
      particleCount: 50, spread: 80, startVelocity: 30,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#fb7185', '#fbbf24', '#a78bfa', '#34d399', '#ffffff'],
    });
    setText('');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="pt-status-lg pb-3 px-5">
        <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">Broadcast</div>
        <h1 className="text-[34px] font-black leading-none mt-1">
          <span className="text-grad">Ping</span>{' '}
          <span className="text-white/80 text-base font-medium">your squad</span>
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-36">
        {/* Empty state — no friends means nothing to ping */}
        {friends.length === 0 ? (
          <div className="text-center mt-16">
            <div className="text-5xl mb-3">📣</div>
            <div className="text-white font-semibold">No one to ping yet</div>
            <div className="text-sm text-zinc-400 mt-1 max-w-[260px] mx-auto">
              Add friends to broadcast a quick "WUD?" or "I'm bored" to the squad.
            </div>
          </div>
        ) : (
        <>
        {/* Squad shortcuts — tap to select all members of a saved squad */}
        {squads.length > 0 && (
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2 px-1">
              Squads
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
              {squads.map(sq => {
                const sqIds = sq.memberIds.filter(id => friends.some(f => f.id === id));
                const active = sqIds.length > 0 && sqIds.every(id => selectedIds.includes(id))
                  && selectedIds.length === sqIds.length;
                return (
                  <motion.button
                    key={sq.id}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setSelectedIds(sqIds)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border transition
                                ${active
                                  ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white border-rose-400 shadow-[0_8px_24px_-10px_rgba(244,63,94,0.6)]'
                                  : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
                  >
                    <span>{sq.emoji}</span>
                    <span>{sq.name}</span>
                    <span className={`text-[10px] tabular-nums ${active ? 'text-white/80' : 'text-zinc-400'}`}>
                      {sqIds.length}
                    </span>
                  </motion.button>
                );
              })}
            </div>
          </div>
        )}

        {/* Recipient selector */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 flex items-center gap-1.5">
            <Users size={11} />
            Sending to <span className={`normal-case tracking-normal font-semibold ${noneSelected ? 'text-amber-300' : 'text-rose-300'}`}>{recipientLabel}</span>
          </div>
          <button
            onClick={toggleAll}
            className="text-[11px] uppercase tracking-[0.18em] font-bold text-rose-300 hover:text-rose-200"
          >
            {allSelected ? 'Clear' : 'All'}
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
          {sortedFriends.map(u => {
            const selected = selectedIds.includes(u.id);
            return (
              <motion.button
                key={u.id}
                layout
                whileTap={{ scale: 0.92 }}
                onClick={() => toggleFriend(u.id)}
                className="shrink-0 flex flex-col items-center w-[68px] py-2"
                aria-pressed={selected}
              >
                <div className={`relative transition-opacity ${selected ? '' : 'opacity-40'}`}>
                  <div className={`rounded-full p-[2px] ${selected ? 'bg-gradient-to-br from-rose-500 to-orange-500' : 'bg-transparent'}`}>
                    <div className="rounded-full ring-2 ring-[#07060b]">
                      <Avatar user={u} size={48} />
                    </div>
                  </div>
                  {selected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                      className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-gradient-to-br from-rose-500 to-orange-500 grid place-items-center ring-2 ring-[#07060b]"
                    >
                      <Check size={11} strokeWidth={3} className="text-white" />
                    </motion.div>
                  )}
                </div>
                <span className={`mt-1.5 text-[11px] font-medium truncate max-w-[60px] ${selected ? 'text-white' : 'text-zinc-500'}`}>
                  {u.name}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* Big bold preset — halo+breathe like the + button */}
        <div className="relative w-full mt-5">
          {!noneSelected && (
            <>
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-3xl bg-rose-500/40 blur-md pointer-events-none"
                animate={{ scale: [1, 1.04, 1], opacity: [0.55, 0, 0.55] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
              />
              <motion.span
                aria-hidden
                className="absolute inset-0 rounded-3xl bg-orange-400/30 blur-lg pointer-events-none"
                animate={{ scale: [1, 1.07, 1], opacity: [0.45, 0, 0.45] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
              />
            </>
          )}
          <motion.button
            whileTap={!noneSelected ? { scale: 0.97 } : undefined}
            animate={!noneSelected ? { scale: [1, 1.015, 1] } : undefined}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            disabled={noneSelected}
            onClick={() => send("i'm booored 😩 — WUD?")}
            className={`relative w-full overflow-hidden rounded-3xl p-6 text-left ring-1 ring-white/15
                       ${noneSelected
                         ? 'bg-zinc-700/40 cursor-not-allowed'
                         : 'bg-gradient-to-br from-rose-500 via-pink-500 to-orange-500 shadow-[0_30px_60px_-20px_rgba(244,63,94,0.6)]'}`}
          >
            <div className="absolute -top-10 -right-10 text-[180px] opacity-25 select-none">😩</div>
            <div className="relative">
              <div className={`${noneSelected ? 'text-zinc-400' : 'text-white/85'} text-xs uppercase tracking-widest font-semibold`}>
                One-tap blast
              </div>
              <div className={`${noneSelected ? 'text-zinc-300' : 'text-white'} text-3xl font-black mt-1`}>I'm bored</div>
              <div className={`${noneSelected ? 'text-zinc-400' : 'text-white/85'} text-sm mt-1`}>
                {noneSelected
                  ? 'Pick at least one friend above.'
                  : allSelected
                    ? `Sends "WUD?" to all ${friends.length} friends.`
                    : `Sends "WUD?" to ${recipientLabel}.`}
              </div>
            </div>
          </motion.button>
        </div>

        {/* Presets grid */}
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-6 mb-2 px-1">
          Quick pings
        </div>
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map(p => (
            <motion.button
              key={p.text}
              whileTap={!noneSelected ? { scale: 0.95 } : undefined}
              disabled={noneSelected}
              onClick={() => send(`${p.text} ${p.emoji}`)}
              className={`p-3 rounded-2xl border text-left transition
                          ${noneSelected
                            ? 'bg-white/[0.02] border-white/5 text-zinc-500 cursor-not-allowed'
                            : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
            >
              <div className="text-2xl">{p.emoji}</div>
              <div className={`text-sm font-semibold mt-1 ${noneSelected ? 'text-zinc-500' : 'text-white'}`}>
                {p.text}
              </div>
            </motion.button>
          ))}
        </div>

        {/* Custom */}
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mt-6 mb-2 px-1">
          Or write your own
        </div>
        <div className="flex gap-2 items-stretch">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(text); }}
            placeholder="Say something..."
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder:text-zinc-500
                       focus:outline-none focus:ring-2 focus:ring-rose-400/60 focus:border-rose-400/30"
          />
          <div className="w-[96px]">
            <PulseButton onClick={() => send(text)} disabled={!text.trim() || noneSelected}>
              Send
            </PulseButton>
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
