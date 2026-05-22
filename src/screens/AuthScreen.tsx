import { motion } from 'framer-motion';
import { ChevronLeft, Mail } from 'lucide-react';
import { useState } from 'react';
import { PulseButton } from '../components/PulseButton';
import { useApp } from '../store';

/**
 * Email/password auth screen. Sign up routes to the Onboarding step
 * (avatar / colour / name); Log in goes straight into the app.
 */
export function AuthScreen() {
  const setAuthState = useApp(s => s.setAuthState);
  const intent = useApp(s => s.authIntent);
  const setIntent = useApp(s => s.setAuthIntent);
  const logIn = useApp(s => s.logIn);
  const beginEmailSignup = useApp(s => s.beginEmailSignup);
  const pushToast = useApp(s => s.pushToast);

  const isSignup = intent === 'signup';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Sign up → onboarding step; log in → straight into the app.
  const proceedEmail = () => {
    if (!email.trim() || !password) {
      pushToast('Enter your email and password', 'warn');
      return;
    }
    if (isSignup) beginEmailSignup(email.trim(), password);
    else logIn(email.trim(), password);
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
            placeholder="Password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            className="auth-input"
          />
          {!isSignup && (
            <button className="self-end text-[12px] text-rose-300 font-semibold">
              Forgot password?
            </button>
          )}
        </div>

        {/* Primary CTA */}
        <div className="mt-5">
          <PulseButton onClick={proceedEmail}>
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
    </motion.div>
  );
}
