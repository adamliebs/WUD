import { AnimatePresence, motion } from 'framer-motion';
import { Calendar, Check, ChevronLeft, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { DateWheelPicker } from '../components/DateWheelPicker';
import { PulseButton } from '../components/PulseButton';
import { authApi } from '../api/endpoints';
import { useApp } from '../store';
import { PrivacyBody, TermsBody } from './LegalScreens';

/**
 * Post-signup onboarding — name, handle, DOB, avatar, color. After the
 * rebuild, every input is large-font (16 px+) so iOS can't auto-zoom, and
 * the date picker is a custom three-wheel component instead of the native
 * `<input type="date">` (which was the source of the zoom-in glitch the user
 * was hitting). The screen also gets the atmospheric orb background that
 * the rest of the app uses, so the auth flow feels continuous with the app
 * proper.
 */

const AVATAR_OPTIONS = [
  '🧑‍💻', '🧑‍🎤', '🧑‍🎨', '🧑‍🚀', '🧑‍🍳', '🧑‍🎓',
  '🧔', '👩‍🦰', '👩', '👱‍♀️', '🧝‍♀️', '🦸', '🥷', '🧙',
  '🐱', '🐶', '🦊', '🐻', '🐯', '🦄', '🐙', '🐳',
  '🌈', '✨', '🔥', '🌊', '🌵', '🍕',
];

// Glassy/transparent palette — matches the Floats card + the rest of the
// app's color picker (see EditProfileScreen).
const COLOR_OPTIONS: { label: string; value: string }[] = [
  { label: 'Sunset',   value: 'from-rose-500/25 via-pink-500/15 to-orange-500/10' },
  { label: 'Berry',    value: 'from-pink-500/25 via-rose-500/15 to-rose-500/10' },
  { label: 'Coral',    value: 'from-amber-500/25 via-orange-500/15 to-rose-500/10' },
  { label: 'Aurora',   value: 'from-violet-500/25 via-fuchsia-500/15 to-pink-500/10' },
  { label: 'Ocean',    value: 'from-sky-500/25 via-blue-500/15 to-indigo-500/10' },
  { label: 'Forest',   value: 'from-emerald-500/25 via-teal-500/15 to-cyan-500/10' },
  { label: 'Lagoon',   value: 'from-teal-500/25 via-cyan-500/15 to-sky-500/10' },
  { label: 'Plum',     value: 'from-fuchsia-500/25 via-purple-500/15 to-purple-500/10' },
  { label: 'Storm',    value: 'from-zinc-400/25 via-zinc-500/15 to-zinc-600/10' },
];

/** Apple Guideline 1.3 / COPPA — refuse signups under this age in years. */
const MIN_AGE_YEARS = 13;
/** Oldest plausible signup. The wheel picker uses this to bound the year list. */
const MAX_AGE_YEARS = 100;

function fullYearsBetween(dobIso: string, refDate = new Date()): number {
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return -1;
  let age = refDate.getUTCFullYear() - dob.getUTCFullYear();
  const m = refDate.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && refDate.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

function prettyDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

export function OnboardingScreen() {
  const setAuthState = useApp(s => s.setAuthState);
  const signUp = useApp(s => s.signUp);
  const pendingSignup = useApp(s => s.pendingSignup);
  const isOauthSignup = pendingSignup?.kind === 'firebase';

  // Inline legal panel — global OverlayHost isn't mounted yet pre-signin.
  const [legal, setLegal] = useState<null | 'privacy' | 'terms'>(null);

  const [name, setName] = useState(pendingSignup?.kind === 'firebase' ? pendingSignup.suggestedName ?? '' : '');
  const [handle, setHandle] = useState('');
  const [dob, setDob] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [avatar, setAvatar] = useState(AVATAR_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0].value);

  const sanitize = (h: string) => h.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const effectiveHandle = handle || sanitize(name);

  const ageState: 'empty' | 'ok' | 'tooYoung' | 'future' =
    !dob ? 'empty'
    : fullYearsBetween(dob) < 0 ? 'future'
    : fullYearsBetween(dob) < MIN_AGE_YEARS ? 'tooYoung'
    : 'ok';

  // Live handle availability check (debounced server hit).
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

  const canFinish =
    name.trim().length > 0 &&
    handleState !== 'taken' &&
    handleState !== 'checking' &&
    ageState === 'ok';

  const finish = () => {
    if (!canFinish) return;
    // Convert the ISO date string to epoch ms for the server. Use UTC noon to
    // avoid timezone-boundary off-by-one issues.
    const dateOfBirth = new Date(`${dob}T12:00:00Z`).getTime();
    signUp({ name, handle: effectiveHandle, avatar, color, dateOfBirth });
  };

  const previewUser = useMemo(
    () => ({ id: 'preview', name: name.trim() || 'You', avatar, color }),
    [name, avatar, color],
  );

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      className="absolute inset-0 bg-[#07060b] flex flex-col overflow-hidden"
    >
      <OnboardingBackgroundOrbs />

      {/* Header */}
      <div className="relative pt-status px-3 pb-3 flex items-center justify-between border-b border-white/5">
        <button
          onClick={() => {
            useApp.setState({ pendingSignup: null });
            setAuthState(isOauthSignup ? 'welcome' : 'auth');
          }}
          className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-white hover:bg-white/5"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-base font-bold text-white">
          {isOauthSignup ? 'Finish your profile' : 'Set up your profile'}
        </div>
        <div className="w-9" />
      </div>

      <div className="relative flex-1 overflow-y-auto no-scrollbar pb-36">
        {/* Live preview hero — uses the chosen color + avatar at 84 px. */}
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
            <div className="text-lg font-black text-white inline-flex items-center gap-1.5">
              <Sparkles size={14} className="text-rose-300" />
              Make it yours
            </div>
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
              autoFocus={!isOauthSignup}
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

          {/* Date of birth — custom wheel picker. Tapping the row opens an
              inline wheel below so the user never sees the iOS native sheet. */}
          <Field label="Date of birth">
            <button
              type="button"
              onClick={() => setShowDatePicker(o => !o)}
              className={`auth-input text-left flex items-center justify-between gap-2
                          ${ageState === 'tooYoung' || ageState === 'future'
                            ? 'ring-2 ring-rose-400/60 border-rose-400/30' : ''}`}
            >
              <span className="inline-flex items-center gap-2">
                <Calendar size={14} className="text-zinc-400" />
                <span className={dob ? 'text-white' : 'text-zinc-500'}>
                  {dob ? prettyDate(dob) : 'Tap to pick your birthday'}
                </span>
              </span>
              <span className="text-[11px] uppercase tracking-widest font-bold text-zinc-500">
                {showDatePicker ? 'Done' : 'Edit'}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {showDatePicker && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 rounded-2xl bg-white/[0.03] border border-white/10 px-2 py-2">
                    <DateWheelPicker
                      value={dob}
                      onChange={setDob}
                      minAge={MIN_AGE_YEARS}
                      maxAge={MAX_AGE_YEARS}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="text-[11px] mt-1 px-1 h-3.5">
              {ageState === 'tooYoung' && (
                <span className="text-rose-300">You must be {MIN_AGE_YEARS} or older to use WUD.</span>
              )}
              {ageState === 'future' && (
                <span className="text-rose-300">Pick a valid date in the past.</span>
              )}
              {ageState === 'empty' && (
                <span className="text-zinc-500">We use this to keep WUD age-appropriate.</span>
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
      <div className="absolute bottom-0 left-0 right-0 px-4 pt-3 pb-safe
                      bg-[#0a070f]/95 backdrop-blur-md border-t border-white/10">
        <PulseButton onClick={finish} disabled={!canFinish}>
          {canFinish ? 'Enter WUD' : 'Add your details to continue'}
        </PulseButton>
        <div className="text-[11px] text-zinc-500 text-center mt-2 leading-relaxed">
          By tapping Enter, you agree to our{' '}
          <button
            onClick={() => setLegal('terms')}
            className="text-zinc-300 underline underline-offset-2"
          >
            Terms
          </button>
          {' '}and{' '}
          <button
            onClick={() => setLegal('privacy')}
            className="text-zinc-300 underline underline-offset-2"
          >
            Privacy Policy
          </button>
          .
        </div>
      </div>

      {/* Inline legal modal — covers the onboarding screen because the global
          OverlayHost isn't mounted yet pre-signin. */}
      <AnimatePresence>
        {legal && (
          <motion.div
            key={legal}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 360, damping: 36 }}
            className="absolute inset-0 z-50 bg-[#07060b] flex flex-col"
          >
            <div className="pt-status px-3 pb-3 flex items-center justify-between border-b border-white/5">
              <button
                onClick={() => setLegal(null)}
                className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-white hover:bg-white/5"
                aria-label="Back"
              >
                <ChevronLeft size={22} />
              </button>
              <div className="text-base font-bold text-white">
                {legal === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
              </div>
              <div className="w-9" />
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {legal === 'privacy' ? <PrivacyBody /> : <TermsBody />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

/** Drifting orbs behind the onboarding form — same pattern as the tab pages. */
function OnboardingBackgroundOrbs() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute -top-16 -left-10 h-64 w-64 rounded-full bg-rose-500/12 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 22, 0], x: [0, 14, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut' },
          y: { duration: 22, repeat: Infinity, ease: 'easeInOut' },
          x: { duration: 22, repeat: Infinity, ease: 'easeInOut' },
        }}
      />
      <motion.div
        className="absolute top-1/3 -right-16 h-72 w-72 rounded-full bg-fuchsia-500/10 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -28, 0], x: [0, -16, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut', delay: 0.05 },
          y: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 2 },
          x: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 2 },
        }}
      />
      <motion.div
        className="absolute bottom-24 left-1/4 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -18, 0], x: [0, 10, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut', delay: 0.1 },
          y: { duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 4 },
          x: { duration: 24, repeat: Infinity, ease: 'easeInOut', delay: 4 },
        }}
      />
    </div>
  );
}
