import { motion } from 'framer-motion';
import { Mail } from 'lucide-react';
import { platform } from '../native';
import { useApp } from '../store';

/**
 * Post-splash landing. Social-signin first (Apple + Google), then an email
 * fallback that routes to the existing email auth screen.
 *
 * Apple Sign In is REQUIRED on iOS App Store apps that offer any other
 * social signin (Apple Guideline 4.8). Google is shown on iOS too — the
 * Firebase plugin handles the OAuth dance on both platforms.
 */
export function WelcomeScreen() {
  const setAuthState = useApp(s => s.setAuthState);
  const setAuthIntent = useApp(s => s.setAuthIntent);
  const loadDemoData = useApp(s => s.loadDemoData);
  const signInWithApple = useApp(s => s.signInWithApple);
  const signInWithGoogle = useApp(s => s.signInWithGoogle);

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
        {/* Apple Sign In is iOS-only. Apple does support a Sign In with Apple
            web flow for Android, but it's a poor UX (browser hop) and most
            Android users don't have Apple IDs — so we hide it entirely off iOS. */}
        {platform === 'ios' && (
          <button
            onClick={() => void signInWithApple()}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl
                       bg-white text-zinc-900 font-semibold text-[15px]
                       active:bg-zinc-200 transition"
          >
            <AppleLogo />
            Continue with Apple
          </button>
        )}

        {/* Google — works on both native and web (via Firebase Web SDK). */}
        <button
          onClick={() => void signInWithGoogle()}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl
                     bg-white text-zinc-900 font-semibold text-[15px]
                     active:bg-zinc-200 transition"
        >
          <GoogleLogo />
          Continue with Google
        </button>

        {/* Email fallback. Routes to the existing AuthScreen with the right
            tab preselected. Sign-up creates a new account, log-in goes
            straight in. */}
        <button
          onClick={() => goAuth('signup')}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl
                     bg-white/5 border border-white/10 text-white font-semibold text-[15px]
                     hover:bg-white/10 transition"
        >
          <Mail size={16} />
          Continue with email
        </button>

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

      {/* The full Terms / Privacy acknowledgement lives on the Onboarding
          screen, where every new account (OAuth or email) sees + agrees to
          it before pressing Enter. */}
    </motion.div>
  );
}

/* ─────────────────────────── Provider logos ─────────────────────────── */

/** Apple logo glyph — matches Apple's HIG for "Sign in with Apple" buttons. */
function AppleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

/** Google "G" logo — full color per Google's branding guidelines. */
function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
