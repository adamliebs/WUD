import { motion } from 'framer-motion';
import { PulseButton } from '../components/PulseButton';
import { useApp } from '../store';

/**
 * Post-splash landing. Big "Get started" CTA in the middle, with a smaller
 * "Already have an account? Log in" link below. Either route opens AuthScreen,
 * but with the right tab preselected via authIntent.
 */
export function WelcomeScreen() {
  const setAuthState = useApp(s => s.setAuthState);
  const setAuthIntent = useApp(s => s.setAuthIntent);
  const loadDemoData = useApp(s => s.loadDemoData);

  const goAuth = (intent: 'signup' | 'login') => {
    setAuthIntent(intent);
    setAuthState('auth');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex flex-col px-6 pt-20 pb-10"
    >
      {/* Top branding */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-col items-center mt-6"
      >
        <div className="text-[72px] font-black text-grad leading-none">WUD</div>
        <div className="text-zinc-300 text-[11px] tracking-[0.2em] uppercase font-semibold mt-2">
          What U Doing?
        </div>
      </motion.div>

      {/* Middle — tagline */}
      <div className="flex-1 grid place-items-center">
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
            Post a plan, hop in, ping the squad — all without the group-chat ping-pong.
          </div>
        </motion.div>
      </div>

      {/* Bottom CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex flex-col gap-3"
      >
        <PulseButton onClick={() => goAuth('signup')}>
          Get started
        </PulseButton>
        <button
          onClick={() => goAuth('login')}
          className="text-zinc-400 text-sm text-center py-2 hover:text-white transition"
        >
          Already have an account?{' '}
          <span className="text-rose-300 font-bold">Log in</span>
        </button>

        {/* Admin / demo entry — loads the full sample dataset */}
        <button
          onClick={loadDemoData}
          className="mt-1 mx-auto flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em]
                     text-zinc-500 hover:text-zinc-300 transition"
        >
          🎬 Admin · view demo data
        </button>
      </motion.div>
    </motion.div>
  );
}
