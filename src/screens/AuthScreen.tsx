import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Mail, X } from 'lucide-react';
import { useState } from 'react';
import { PulseButton } from '../components/PulseButton';
import { useApp } from '../store';

/**
 * Auth screen — email + password form plus the same social signin options
 * as the welcome screen (Apple on iOS, Google on iOS/Android). Showing them
 * here too means users who navigated past the welcome social-pivot still
 * have a one-tap path to Apple/Google without having to back out.
 */
/** RFC-pragmatic email check — catches obvious typos without being draconian
 *  about valid-but-rare formats. The real validity check is Firebase's. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Apple/NIST recommend ≥8 chars; Firebase enforces 6 minimum on the server,
 *  but we surface a stricter UX-side floor so weak passwords never reach it. */
const MIN_PASSWORD = 8;

export function AuthScreen() {
  const setAuthState = useApp(s => s.setAuthState);
  const intent = useApp(s => s.authIntent);
  const setIntent = useApp(s => s.setAuthIntent);
  const logIn = useApp(s => s.logIn);
  const signUpWithEmail = useApp(s => s.signUpWithEmail);
  const pushToast = useApp(s => s.pushToast);
  const sendPasswordReset = useApp(s => s.sendPasswordReset);

  const isSignup = intent === 'signup';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Password-reset modal state — local to the screen; the reset call goes
  // through the store so toasts + error handling are consistent.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSending, setResetSending] = useState(false);

  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);
  // Length floor only matters for sign-up; log-in accepts whatever Firebase
  // accepts so we don't lock legitimate users out of weaker legacy passwords.
  const passwordValid = isSignup ? password.length >= MIN_PASSWORD : password.length > 0;

  const openReset = () => {
    setResetEmail(email);  // prefill with whatever they already typed
    setResetOpen(true);
  };
  const submitReset = async () => {
    if (!EMAIL_RE.test(resetEmail.trim())) {
      pushToast('Enter a valid email address', 'warn');
      return;
    }
    setResetSending(true);
    const ok = await sendPasswordReset(resetEmail);
    setResetSending(false);
    if (ok) setResetOpen(false);
  };

  // Sign up → onboarding step; log in → straight into the app.
  const proceedEmail = () => {
    if (!emailValid) {
      pushToast('Enter a valid email address', 'warn');
      return;
    }
    if (!passwordValid) {
      pushToast(isSignup
        ? `Password must be at least ${MIN_PASSWORD} characters`
        : 'Enter your password',
        'warn');
      return;
    }
    if (isSignup) void signUpWithEmail(trimmedEmail, password);
    else          logIn(trimmedEmail, password);
  };

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 36 }}
      className="absolute inset-0 bg-[#07060b] flex flex-col"
    >
      {/* Header */}
      <div className="pt-status px-3 pb-3 flex items-center justify-between border-b border-white/5">
        <button
          onClick={() => setAuthState('welcome')}
          className="h-9 w-9 -ml-1 grid place-items-center rounded-full text-white hover:bg-white/5"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="text-base font-bold text-white">
          {isSignup ? 'Sign up' : 'Log in'}
        </div>
        <div className="w-9" />
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-32 pt-5">
        {/* Branding */}
        <div className="flex flex-col items-center mb-6">
          <div className="text-5xl font-black text-grad leading-none">WUD</div>
          <div className="text-zinc-400 text-sm mt-2">
            {isSignup ? 'Create your account' : 'Welcome back'}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 bg-white/5 border border-white/10 rounded-2xl p-1 relative mb-6">
          {(['signup', 'login'] as const).map(t => {
            const active = intent === t;
            return (
              <button
                key={t}
                onClick={() => setIntent(t)}
                className="relative py-2 rounded-xl text-sm font-semibold text-zinc-300"
              >
                {active && (
                  <motion.div
                    layoutId="authtabpill"
                    className="absolute inset-0 bg-white rounded-xl"
                    transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  />
                )}
                <span className={`relative ${active ? 'text-zinc-900' : ''}`}>
                  {t === 'signup' ? 'Sign up' : 'Log in'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Email / password */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center auth-input gap-2 px-3.5 py-0">
            <Mail size={15} className="text-zinc-400 shrink-0" />
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              autoComplete="email"
              className="flex-1 bg-transparent text-white placeholder:text-zinc-500 focus:outline-none py-3"
            />
          </div>
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={isSignup ? `Password (≥${MIN_PASSWORD} characters)` : 'Password'}
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            className="auth-input"
          />
          {/* Live feedback for signup: green when strong, muted otherwise so
              the user knows when the CTA will unlock without trial-and-error. */}
          {isSignup && password.length > 0 && (
            <div className={`text-[11px] -mt-1 px-1
                             ${password.length >= MIN_PASSWORD ? 'text-emerald-300' : 'text-zinc-500'}`}>
              {password.length >= MIN_PASSWORD
                ? '✓ Strong enough'
                : `${MIN_PASSWORD - password.length} more character${MIN_PASSWORD - password.length === 1 ? '' : 's'}`}
            </div>
          )}
          {!isSignup && (
            <button
              onClick={openReset}
              className="self-end text-[12px] text-rose-300 font-semibold"
            >
              Forgot password?
            </button>
          )}
        </div>

        {/* Primary CTA */}
        <div className="mt-5">
          <PulseButton onClick={proceedEmail} disabled={!emailValid || !passwordValid}>
            {isSignup ? 'Continue' : 'Log in'}
          </PulseButton>
        </div>

        {/* Footer */}
        <div className="text-[11px] text-zinc-500 text-center mt-4 leading-relaxed">
          {isSignup ? (
            <>By continuing you agree to WUD's Terms &amp; Privacy Policy.</>
          ) : (
            <>Demo: <span className="text-zinc-400">admin@wud.app</span> / <span className="text-zinc-400">admin1234</span></>
          )}
        </div>

        <div className="text-center mt-4 text-sm text-zinc-400">
          {isSignup ? (
            <>Already have an account?{' '}
              <button onClick={() => setIntent('login')} className="text-rose-300 font-bold">Log in</button>
            </>
          ) : (
            <>New to WUD?{' '}
              <button onClick={() => setIntent('signup')} className="text-rose-300 font-bold">Sign up</button>
            </>
          )}
        </div>
      </div>

      {/* Password reset modal — overlays the auth screen. Anti-enumeration:
          server responds 200 regardless, so we always show the same
          confirmation. Reset emails only land for accounts that exist in
          Firebase Auth (pre-Firebase email accounts will silently no-op). */}
      <AnimatePresence>
        {resetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !resetSending && setResetOpen(false)}
              className="absolute inset-0 z-50 bg-black/60"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              className="absolute inset-x-5 top-1/2 -translate-y-1/2 z-50 rounded-3xl bg-[#15121b]
                         border border-white/10 p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-base font-bold text-white">Reset password</div>
                <button
                  onClick={() => !resetSending && setResetOpen(false)}
                  aria-label="Close"
                  className="h-8 w-8 grid place-items-center rounded-full bg-white/5 hover:bg-white/10 text-zinc-200"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="text-[13px] text-zinc-400 mb-4 leading-relaxed">
                We'll email you a link to reset your password if this address is registered.
              </div>
              <input
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="auth-input mb-4"
              />
              <PulseButton onClick={submitReset} disabled={resetSending}>
                {resetSending ? 'Sending…' : 'Send reset link'}
              </PulseButton>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
