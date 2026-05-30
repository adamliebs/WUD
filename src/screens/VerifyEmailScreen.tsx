import { motion } from 'framer-motion';
import { Mail, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PulseButton } from '../components/PulseButton';
import { useApp } from '../store';

/**
 * Email verification gate — sits between signing up with email and entering
 * the app. The flow:
 *   1. User signs up with email → Firebase creates the account, sends a
 *      verification link, we land here.
 *   2. The screen polls every 4 s by calling `syncFirebaseUser` (refresh
 *      Firebase ID token → re-post to /auth/firebase → server updates the
 *      email_verified flag locally) so we auto-advance the second the user
 *      taps the link.
 *   3. "I've verified" button runs the same sync on demand. "Resend email"
 *      re-fires the verification email. "Back" signs them out so they can
 *      use a different account / method.
 *
 * OAuth users (Apple/Google) skip this screen entirely — their accounts are
 * verified from the moment they're created.
 */
const POLL_INTERVAL_MS = 4_000;

export function VerifyEmailScreen() {
  const me = useApp(s => s.me());
  const setAuthState = useApp(s => s.setAuthState);
  const syncFirebaseUser = useApp(s => s.syncFirebaseUser);
  const resendEmailVerification = useApp(s => s.resendEmailVerification);
  const signOut = useApp(s => s.signOut);

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  // Throttle the resend button so accidental double-taps don't trip
  // Firebase's "too many requests" floor.
  const [resentRecently, setResentRecently] = useState(false);

  // Auto-advance the moment the server reports we're verified.
  useEffect(() => {
    if (me.emailVerified) setAuthState('app');
  }, [me.emailVerified, setAuthState]);

  // Poll Firebase + server for verification status. Cleans up on unmount,
  // and skips runs while a manual check is already in flight to avoid
  // overlapping requests.
  const inFlight = useRef(false);
  useEffect(() => {
    const tick = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await syncFirebaseUser();
      } finally {
        inFlight.current = false;
      }
    };
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    // First tick happens 1.5 s after mount so a near-instant verifier
    // doesn't have to wait the full interval.
    const first = setTimeout(tick, 1500);
    return () => {
      clearInterval(interval);
      clearTimeout(first);
    };
  }, [syncFirebaseUser]);

  const manualCheck = async () => {
    setChecking(true);
    const verified = await syncFirebaseUser();
    setChecking(false);
    if (verified) setAuthState('app');
  };

  const resend = async () => {
    setResending(true);
    const ok = await resendEmailVerification();
    setResending(false);
    if (ok) {
      setResentRecently(true);
      setTimeout(() => setResentRecently(false), 30_000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 bg-[#07060b] flex flex-col px-6 pt-status-lg pb-10 overflow-hidden"
    >
      <BackgroundOrbs />

      {/* Animated envelope — floats gently with a soft halo. */}
      <div className="relative flex-1 grid place-items-center">
        <div className="text-center max-w-[320px]">
          <div className="relative inline-block">
            <motion.span
              aria-hidden
              className="absolute inset-0 rounded-full bg-rose-500/40 blur-2xl pointer-events-none"
              animate={{ scale: [1, 1.15, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeOut' }}
            />
            <motion.div
              animate={{ y: [0, -6, 0], rotate: [0, 3, 0, -3, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="relative h-20 w-20 mx-auto rounded-full grid place-items-center
                         bg-gradient-to-br from-rose-500 to-orange-500
                         text-white shadow-[0_24px_50px_-18px_rgba(244,63,94,0.65)]
                         ring-1 ring-white/15"
            >
              <Mail size={32} />
            </motion.div>
          </div>

          <h1 className="text-[26px] font-black text-white leading-tight mt-6">
            Verify your email
          </h1>
          <div className="text-sm text-zinc-400 mt-3 leading-relaxed">
            We sent a verification link to
            <br />
            <span className="text-white font-semibold break-all">{me.name ? me.handle : 'your email'}</span>.
            <br />
            Tap the link, then come back here — we'll let you in automatically.
          </div>

          {/* Auto-check indicator. Hidden during the first second so the row
              doesn't blink visible-then-gone before the first poll fires. */}
          <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-zinc-500 font-semibold">
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw size={11} />
            </motion.span>
            Checking automatically…
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="relative flex flex-col gap-3">
        <PulseButton onClick={() => void manualCheck()} disabled={checking}>
          {checking ? 'Checking…' : "I've verified"}
        </PulseButton>

        <button
          onClick={() => void resend()}
          disabled={resending || resentRecently}
          className={`w-full py-3 rounded-2xl text-[14px] font-semibold transition border
                      ${resending || resentRecently
                        ? 'bg-white/5 text-zinc-500 border-white/5 cursor-not-allowed'
                        : 'bg-white/5 text-zinc-200 border-white/10 hover:bg-white/10'}`}
        >
          {resending ? 'Sending…' :
            resentRecently ? 'Sent — check your inbox' :
            'Resend verification email'}
        </button>

        <button
          onClick={() => signOut()}
          className="text-[12px] text-zinc-400 hover:text-zinc-200 text-center mt-1"
        >
          Use a different email or method
        </button>
      </div>
    </motion.div>
  );
}

function BackgroundOrbs() {
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div
        className="absolute -top-16 -left-10 h-64 w-64 rounded-full bg-fuchsia-500/12 blur-3xl"
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
        className="absolute top-1/3 -right-16 h-72 w-72 rounded-full bg-rose-500/12 blur-3xl"
        style={{ willChange: 'filter, transform' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, y: [0, -28, 0], x: [0, -16, 0] }}
        transition={{
          opacity: { duration: 0.7, ease: 'easeOut', delay: 0.05 },
          y: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 2 },
          x: { duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 2 },
        }}
      />
    </div>
  );
}
