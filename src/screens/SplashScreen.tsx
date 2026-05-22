import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { tokens } from '../api/client';
import { useApp } from '../store';

/**
 * Splash shown on cold open. Three things animate in sequence:
 *  • Category emojis float around behind the logo (background mood)
 *  • The "WUD" wordmark drops in with a spring + bounces letter-by-letter
 *  • A pulsing-dot loader hints at activity
 * After ~2.4s, transitions to the welcome screen.
 */
const FLOATING_EMOJIS: { emoji: string; x: string; y: string; size: number; delay: number }[] = [
  { emoji: '🏄', x: '12%', y: '18%', size: 42, delay: 0.0 },
  { emoji: '🎮', x: '78%', y: '14%', size: 38, delay: 0.2 },
  { emoji: '☕', x: '20%', y: '78%', size: 40, delay: 0.4 },
  { emoji: '🍔', x: '82%', y: '74%', size: 38, delay: 0.1 },
  { emoji: '🏋️', x: '10%', y: '48%', size: 34, delay: 0.5 },
  { emoji: '🎉', x: '85%', y: '46%', size: 36, delay: 0.3 },
  { emoji: '🏃', x: '50%', y: '12%', size: 32, delay: 0.6 },
  { emoji: '🌊', x: '50%', y: '85%', size: 32, delay: 0.7 },
];

const LETTERS = ['W', 'U', 'D'];

export function SplashScreen() {
  const setAuthState = useApp(s => s.setAuthState);

  useEffect(() => {
    // If a saved session exists, App.init() is resuming it — don't auto-advance
    // to Welcome (it would flash before bootstrap lands on the app).
    if (tokens.hasSession) return;
    const t = setTimeout(() => setAuthState('welcome'), 2400);
    return () => clearTimeout(t);
  }, [setAuthState]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="absolute inset-0 overflow-hidden grid place-items-center"
    >
      {/* Floating category emojis in the background */}
      {FLOATING_EMOJIS.map((f, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.5, y: 10 }}
          animate={{
            opacity: [0, 0.55, 0.55],
            scale: [0.5, 1, 1],
            y: [10, -8, 10],
          }}
          transition={{
            opacity: { duration: 1.2, delay: f.delay, times: [0, 0.4, 1] },
            scale:   { duration: 1.2, delay: f.delay, type: 'spring', stiffness: 220, damping: 14 },
            y:       { duration: 3 + (i % 3) * 0.5, delay: f.delay, repeat: Infinity, ease: 'easeInOut' },
          }}
          className="absolute pointer-events-none select-none"
          style={{
            left: f.x,
            top: f.y,
            transform: 'translate(-50%, -50%)',
            fontSize: f.size,
          }}
        >
          {f.emoji}
        </motion.div>
      ))}

      {/* Centered branding */}
      <div className="relative flex flex-col items-center gap-3">
        <div className="flex items-end leading-none">
          {LETTERS.map((ch, i) => (
            <motion.span
              key={ch}
              initial={{ opacity: 0, y: -40, scale: 0.6, rotate: -8 }}
              animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
              transition={{
                type: 'spring',
                stiffness: 240,
                damping: 14,
                delay: 0.15 + i * 0.12,
              }}
              className="text-[110px] font-black text-grad"
              style={{ fontKerning: 'normal' }}
            >
              {ch}
            </motion.span>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.4 }}
          className="text-zinc-300 text-sm tracking-[0.15em] uppercase font-semibold"
        >
          What U Doing?
        </motion.div>

        {/* Pulsing dots */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="flex gap-1.5 mt-8"
          aria-label="Loading"
        >
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              className="h-2 w-2 rounded-full bg-rose-400"
              animate={{ scale: [1, 1.6, 1], opacity: [0.5, 1, 0.5] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                delay: i * 0.18,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
