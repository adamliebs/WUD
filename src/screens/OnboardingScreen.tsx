import { motion } from 'framer-motion';
import { Check, ChevronLeft, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { PulseButton } from '../components/PulseButton';
import { authApi } from '../api/endpoints';
import { useApp } from '../store';

const AVATAR_OPTIONS = [
  '🧑‍💻', '🧑‍🎤', '🧑‍🎨', '🧑‍🚀', '🧑‍🍳', '🧑‍🎓',
  '🧔', '👩‍🦰', '👩', '👱‍♀️', '🧝‍♀️', '🦸', '🥷', '🧙',
  '🐱', '🐶', '🦊', '🐻', '🐯', '🦄', '🐙', '🐳',
  '🌈', '✨', '🔥', '🌊', '🌵', '🍕',
];

const COLOR_OPTIONS: { label: string; value: string }[] = [
  { label: 'Sunset', value: 'from-rose-400 to-orange-500' },
  { label: 'Berry',  value: 'from-pink-400 to-rose-600' },
  { label: 'Coral',  value: 'from-amber-400 to-orange-600' },
  { label: 'Aurora', value: 'from-violet-500 to-fuchsia-600' },
  { label: 'Ocean',  value: 'from-sky-400 to-indigo-600' },
  { label: 'Forest', value: 'from-emerald-400 to-teal-600' },
  { label: 'Lagoon', value: 'from-teal-400 to-cyan-700' },
  { label: 'Plum',   value: 'from-fuchsia-400 to-purple-700' },
  { label: 'Storm',  value: 'from-zinc-500 to-zinc-800' },
];

/**
 * Post-signup onboarding — the user sets their display name, handle, avatar
 * emoji and colour. Completing it calls signUp() and enters the app.
 */
export function OnboardingScreen() {
  const setAuthState = useApp(s => s.setAuthState);
  const signUp = useApp(s => s.signUp);

  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0].value);

  const sanitize = (h: string) => h.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const effectiveHandle = handle || sanitize(name);

  // Live handle-availability check (handles are unique; names are not).
  const [handleState, setHandleState] = useState<'idle' | 'checking' | 'free' | 'taken'>('idle');
  useEffect(() => {
    const h = effectiveHandle;
    if (h.length < 2) { setHandleState('idle'); return; }
    setHandleState('checking');
    let cancelled = false;
    const t = setTimeout(() => {
      authApi.handleAvailable(h)
        .then(r => { if (!cancelled) setHandleState(r.available ? 'free' : 'taken'); })
        .catch(() => { if (!cancelled) setHandleState('idle'); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [effectiveHandle]);

  const canFinish = name.trim().length > 0 && handleState !== 'taken' && handleState !== 'checking';

  const finish = () => {
    if (!canFinish) return;
    signUp({ name, handle: effectiveHandle, avatar, color });
  };

  const previewUser = { id: 'preview', name: name.trim() || 'You', avatar, color };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      className="absolute inset-0 bg-[#07060b] flex flex-col"
    >
      {/* Header */}
      <div className="pt-12 px-3 pb-3 flex items-center justify-between border-b border-white/5">
        <button
          onClick={() => setAuthState('auth')}
          className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-white hover:bg-white/5"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-base font-bold text-white">Set up your profile</div>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {/* Live preview hero */}
        <div className={`relative h-40 bg-gradient-to-br ${color} transition-colors`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              key={avatar + color}
              initial={{ scale: 0.7, rotate: -8, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              className="ring-4 ring-[#07060b] rounded-full"
            >
              <Avatar user={previewUser} size={84} />
            </motion.div>
            <div className="text-white font-black text-xl mt-2 drop-shadow">
              {name.trim() || 'Your name'}
            </div>
            <div className="text-white/85 text-xs">@{effectiveHandle || 'handle'}</div>
          </div>
        </div>

        <div className="px-4 pt-5">
          <div className="text-center mb-4">
            <div className="text-lg font-black text-white">Make it yours ✨</div>
            <div className="text-[13px] text-zinc-400 mt-0.5">
              This is how friends will see you on WUD.
            </div>
          </div>

          {/* Name */}
          <Field label="Display name">
            <input
              value={name}
              onChange={e => setName(e.target.value.slice(0, 30))}
              placeholder="Your name"
              autoFocus
              className="auth-input"
            />
          </Field>

          {/* Handle */}
          <Field label="Handle">
            <div className={`flex items-center auth-input gap-1 px-3.5 py-0
                            ${handleState === 'taken' ? 'ring-2 ring-rose-400/60 border-rose-400/30' : ''}`}>
              <span className="text-zinc-500">@</span>
              <input
                value={handle}
                onChange={e => setHandle(sanitize(e.target.value))}
                placeholder={sanitize(name) || 'handle'}
                className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none py-3"
              />
              {handleState === 'checking' && <Loader2 size={15} className="text-zinc-400 animate-spin" />}
              {handleState === 'free' && <Check size={15} className="text-emerald-400" />}
              {handleState === 'taken' && <X size={15} className="text-rose-400" />}
            </div>
            <div className="text-[11px] mt-1 px-1 h-3.5">
              {handleState === 'taken' && (
                <span className="text-rose-300">That handle is taken — try another.</span>
              )}
              {handleState === 'free' && (
                <span className="text-emerald-300">@{effectiveHandle} is available.</span>
              )}
            </div>
          </Field>

          {/* Avatar */}
          <Field label="Pick an avatar">
            <div className="grid grid-cols-7 gap-2">
              {AVATAR_OPTIONS.map(emoji => {
                const active = emoji === avatar;
                return (
                  <motion.button
                    key={emoji}
                    whileTap={{ scale: 0.88 }}
                    onClick={() => setAvatar(emoji)}
                    className={`aspect-square rounded-2xl grid place-items-center text-2xl transition
                                ${active
                                  ? 'bg-white text-zinc-900 ring-2 ring-rose-400'
                                  : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                  >
                    {emoji}
                  </motion.button>
                );
              })}
            </div>
          </Field>

          {/* Color */}
          <Field label="Pick a color">
            <div className="grid grid-cols-3 gap-2">
              {COLOR_OPTIONS.map(c => {
                const active = c.value === color;
                return (
                  <motion.button
                    key={c.value}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setColor(c.value)}
                    className={`relative h-16 rounded-2xl overflow-hidden border transition
                                ${active ? 'border-white ring-2 ring-white/60' : 'border-white/10'}`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${c.value}`} />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.35),transparent_60%)]" />
                    <div className="relative h-full w-full flex items-end justify-center pb-1.5">
                      <span className="text-[10.5px] uppercase tracking-widest font-bold text-white/95 drop-shadow">
                        {c.label}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </Field>
        </div>
      </div>

      {/* Sticky finish */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-5
                      bg-[#0a070f]/95 backdrop-blur-md border-t border-white/10">
        <PulseButton onClick={finish} disabled={!canFinish}>
          {canFinish ? 'Enter WUD' : 'Add your name to continue'}
        </PulseButton>
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-1.5 px-1">
        {label}
      </div>
      {children}
    </div>
  );
}
