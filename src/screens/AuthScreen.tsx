import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, Mail, X } from 'lucide-react';
import { useState } from 'react';
import { platform } from '../native';
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
  const signInWithApple = useApp(s => s.signInWithApple);
  const signInWithGoogle = useApp(s => s.signInWithGoogle);
  const pushToast = useApp(s => s.pushToast);
  const sendPasswordReset = useApp(s => s.sendPasswordReset);

  const isSignup = intent === 'signup';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
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
  // Sign-up requires the user to confirm by re-typing — guards against typos
  // that would otherwise lock them out of their own account.
  const passwordMatches = !isSignup || (password === passwordConfirm && passwordConfirm.length > 0);

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
    if (!passwordMatches) {
      pushToast('Passwords must match', 'warn');
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
        <div className="grid grid-cols-2 bg-white/5 border border-white/10 rounded-2xl p-1 relative mb-5">
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

        {/* Social signin — always available on both sign-up and log-in so
            users who land on the wrong tab still have one-tap Apple / Google
            without backing out to the welcome screen. Apple is iOS-only per
            Guideline 4.8 (and isn't useful elsewhere). */}
        <div className="flex flex-col gap-2.5 mb-5">
          {platform === 'ios' && (
            <button
              onClick={() => void signInWithApple()}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl
                         bg-white text-zinc-900 font-semibold text-[15px]
                         active:bg-zinc-200 transition"
            >
              <AppleLogo />
              {isSignup ? 'Sign up with Apple' : 'Continue with Apple'}
            </button>
          )}
          <button
            onClick={() => void signInWithGoogle()}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl
                       bg-white text-zinc-900 font-semibold text-[15px]
                       active:bg-zinc-200 transition"
          >
            <GoogleLogo />
            {isSignup ? 'Sign up with Google' : 'Continue with Google'}
          </button>
        </div>

        {/* Divider — "or with email" */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">
            or with email
          </span>
          <div className="flex-1 h-px bg-white/10" />
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
          {/* Confirm password — sign-up only. Guards against typos that
              would otherwise lock the user out of their own account. */}
          {isSignup && (
            <>
              <input
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                placeholder="Confirm password"
                type="password"
                autoComplete="new-password"
                className={`auth-input ${
                  passwordConfirm.length > 0 && password !== passwordConfirm
                    ? 'ring-2 ring-rose-400/60 border-rose-400/30' : ''
                }`}
              />
              {passwordConfirm.length > 0 && (
                <div className={`text-[11px] -mt-1 px-1
                                 ${password === passwordConfirm
                                   ? 'text-emerald-300'
                                   : 'text-rose-300'}`}>
                  {password === passwordConfirm
                    ? '✓ Passwords match'
                    : "Passwords don't match yet"}
                </div>
              )}
            </>
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
          <PulseButton
            onClick={proceedEmail}
            disabled={!emailValid || !passwordValid || !passwordMatches}
          >
            {isSignup ? 'Continue' : 'Log in'}
          </PulseButton>
        </div>

        {/* Footer */}
        {isSignup && (
          <div className="text-[11px] text-zinc-500 text-center mt-4 leading-relaxed">
            By continuing you agree to WUD's Terms &amp; Privacy Policy.
          </div>
        )}

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

/* ─────────────────────────── Provider logos ───────────────────────────
 * Kept inline here (mirroring the copies on WelcomeScreen) so the auth
 * screen has no cross-screen import for a six-line SVG.
 */
function AppleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

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
