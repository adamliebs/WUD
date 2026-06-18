import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { track } from '../lib/analytics';
import { useApp } from '../store';

/**
 * Post-splash landing. Big WUD branding, an atmospheric drift of sparkle
 * particles around the bottom, and two CTAs — Sign up / Log in — that route
 * into AuthScreen (where Apple, Google, and email all live).
 *
 * Why the buttons aren't here anymore: bundling sign-up / log-in into a
 * single landing screen was making the welcome read like a settings page.
 * The pivot is now: welcome shows the brand, the auth screen shows the
 * actual options.
 */
export function WelcomeScreen() {
  const setAuthState = useApp(s => s.setAuthState);
  const setAuthIntent = useApp(s => s.setAuthIntent);

  const goAuth = (intent: 'signup' | 'login') => {
    track(intent === 'signup' ? 'signup_started' : 'login_started');
    setAuthIntent(intent);
    setAuthState('auth');
  };

  // Generate sparkle positions once per mount so they don't reshuffle on
  // every render. Each sparkle floats up with a slightly different delay
  // and duration to feel organic.
  const sparkles = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({
      id: i,
      x: 6 + Math.random() * 88,           // % from left
      delay: Math.random() * 6,            // s before first cycle
      duration: 6 + Math.random() * 5,     // s per cycle
      size: 4 + Math.random() * 8,         // px
      hue: ['bg-fuchsia-400', 'bg-rose-400', 'bg-amber-300', 'bg-sky-300'][i % 4],
    })),
    [],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex flex-col px-6 pt-20 pb-10 overflow-hidden"
    >
      <BackgroundOrbs />

      {/* Top branding */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="relative flex flex-col items-center mt-6"
      >
        <div className="text-[72px] font-black text-grad leading-none">WUD</div>
        <div className="text-zinc-300 text-[11px] tracking-[0.2em] uppercase font-semibold mt-2">
          What U Doing?
        </div>
      </motion.div>

      {/* Middle — tagline */}
      <div className="relative flex-1 grid place-items-center">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-center max-w-[280px]"
        >
          <div className="text-[26px] font-black text-white leading-tight">
            See what your friends are doing.
          </div>
          <div className="text-sm text-zinc-400 mt-3 leading-relaxed">
            Post a plan, hop in, float an idea — all without the group-chat ping-pong.
          </div>
        </motion.div>
      </div>

      {/* Bottom — animated CTA cluster */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="relative"
      >
        {/* Sparkle field — drifts upward through the CTA area. Pointer-events
            disabled so the cluster stays tappable through the particles. */}
        <div aria-hidden className="absolute inset-x-0 -top-24 bottom-0 pointer-events-none">
          {sparkles.map(s => (
            <motion.span
              key={s.id}
              className={`absolute rounded-full ${s.hue}`}
              style={{
                left: `${s.x}%`,
                bottom: 0,
                width: s.size,
                height: s.size,
                filter: 'blur(1px)',
                willChange: 'transform, opacity',
              }}
              initial={{ opacity: 0, y: 0 }}
              animate={{
                opacity: [0, 0.9, 0.9, 0],
                y: -180,
              }}
              transition={{
                duration: s.duration,
                delay: s.delay,
                repeat: Infinity,
                ease: 'easeOut',
              }}
            />
          ))}
        </div>

        {/* Sign up — primary pill with a slow breathing halo (same trick as
            the floating create button). The halo sells the "tap me" energy
            without screaming. */}
        <div className="relative">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-rose-500/45 blur-xl pointer-events-none"
            animate={{ scale: [1, 1.08, 1], opacity: [0.55, 0, 0.55] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-2xl bg-orange-400/30 blur-2xl pointer-events-none"
            animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            animate={{ scale: [1, 1.015, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            onClick={() => goAuth('signup')}
            className="relative w-full py-4 rounded-2xl text-[15px] font-bold text-white tracking-wide
                       bg-gradient-to-br from-rose-500 to-orange-500
                       shadow-[0_24px_50px_-18px_rgba(244,63,94,0.7)] ring-1 ring-white/15"
          >
            Sign up
          </motion.button>
        </div>

        {/* Log in — quieter ghost pill. */}
        <button
          onClick={() => goAuth('login')}
          className="relative w-full mt-3 py-3 rounded-2xl text-[14px] font-semibold text-zinc-200
                     bg-white/5 border border-white/10 hover:bg-white/10 transition"
        >
          Already have an account? <span className="text-rose-300 font-bold">Log in</span>
        </button>
      </motion.div>

      {/* Legal acknowledgement lives on the Onboarding screen. */}
    </motion.div>
  );
}

/** Same drifting orbs treatment used elsewhere, tuned to a warmer palette
 *  so the welcome page feels distinct from the tabs. */
function BackgroundOrbs() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute -top-20 -left-10 h-72 w-72 rounded-full bg-fuchsia-500/12 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, 22, 0], x: [0, 12, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut' },
          y: { duration: 22, repeat: Infinity, ease: 'easeInOut' },
          x: { duration: 22, repeat: Infinity, ease: 'easeInOut' },
        }}
      />
      <motion.div
        className="absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-rose-500/12 blur-3xl"
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
        className="absolute bottom-32 left-1/4 h-64 w-64 rounded-full bg-amber-400/10 blur-3xl"
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
