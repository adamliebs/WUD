import { motion } from 'framer-motion';
import { ChevronLeft, Mail } from 'lucide-react';
import { useState } from 'react';
import { AppleIcon, FacebookIcon, GoogleIcon } from '../components/BrandIcons';
import { PulseButton } from '../components/PulseButton';
import { useApp } from '../store';

/**
 * Real-looking auth screen — social providers up top, email/password below.
 * Sign up routes to the Onboarding step (avatar / colour / name); Log in goes
 * straight into the app. All providers are mockup-grade — any tap proceeds.
 */
export function AuthScreen() {
  const setAuthState = useApp(s => s.setAuthState);
  const intent = useApp(s => s.authIntent);
  const setIntent = useApp(s => s.setAuthIntent);
  const logIn = useApp(s => s.logIn);

  const isSignup = intent === 'signup';

  // Where "continue" goes: sign up → onboarding, log in → straight into the app.
  const proceed = () => {
    if (isSignup) setAuthState('onboarding');
    else logIn();
  };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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

        {/* Social providers */}
        <div className="flex flex-col gap-2.5">
          <SocialButton
            onClick={proceed}
            className="bg-white text-zinc-900 hover:bg-white/90"
            icon={<GoogleIcon />}
            label={`Continue with Google`}
          />
          <SocialButton
            onClick={proceed}
            className="bg-black text-white border border-white/15 hover:bg-zinc-900"
            icon={<AppleIcon size={18} />}
            label={`Continue with Apple`}
          />
          <SocialButton
            onClick={proceed}
            className="bg-[#1877F2] text-white hover:brightness-110"
            icon={<FacebookIcon />}
            label={`Continue with Facebook`}
          />
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[11px] uppercase tracking-widest text-zinc-500">or</span>
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
          <PulseButton onClick={proceed}>
            {isSignup ? 'Continue' : 'Log in'}
          </PulseButton>
        </div>

        {/* Footer */}
        <div className="text-[11px] text-zinc-500 text-center mt-4 leading-relaxed">
          {isSignup ? (
            <>By continuing you agree to WUD's Terms &amp; Privacy Policy.</>
          ) : (
            <>Mockup — any email and password will log you in.</>
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

function SocialButton({
  onClick, className, icon, label,
}: {
  onClick: () => void;
  className: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={`w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 transition ${className}`}
    >
      <span className="grid place-items-center">{icon}</span>
      {label}
    </motion.button>
  );
}
