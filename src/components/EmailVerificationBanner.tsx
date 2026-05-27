import { motion } from 'framer-motion';
import { MailWarning, X } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../store';

/**
 * Banner shown above the feed when the signed-in user hasn't yet verified
 * their email address. Includes a one-tap resend action backed by Firebase.
 *
 * Dismissible per-session — once dismissed it stays hidden until the next
 * cold start. It will also disappear automatically on the next signin once
 * Firebase reports email_verified=true.
 *
 * Legacy users (signed up before the Firebase migration) don't appear in
 * Firebase Auth so emailVerified is undefined on the server, which the
 * client treats as "no banner needed."
 */
export function EmailVerificationBanner() {
  const me = useApp(s => s.me());
  const resend = useApp(s => s.resendEmailVerification);
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  // undefined → legacy user (no Firebase record), don't show
  // true → already verified
  // false → show the banner
  if (me.emailVerified !== false) return null;
  if (dismissed) return null;

  const onResend = async () => {
    setSending(true);
    await resend();
    setSending(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="mx-4 mb-3 mt-1 p-3 rounded-2xl border border-amber-400/30 bg-amber-500/10
                 flex items-center gap-3"
    >
      <MailWarning size={18} className="text-amber-300 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-amber-100 leading-tight">
          Verify your email
        </div>
        <div className="text-[11px] text-amber-200/80 mt-0.5 leading-snug">
          We sent a link to <span className="text-amber-100">{usableEmail(me)}</span>.
          Click it to confirm your account.
        </div>
      </div>
      <button
        onClick={onResend}
        disabled={sending}
        className="text-[11px] uppercase tracking-widest font-bold px-2.5 py-1.5
                   rounded-full text-amber-100 bg-amber-500/20 border border-amber-400/30
                   hover:bg-amber-500/30 disabled:opacity-60 shrink-0"
      >
        {sending ? '…' : 'Resend'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="h-7 w-7 grid place-items-center rounded-full text-amber-200/80 hover:bg-amber-500/15"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

/** The me.handle is the closest thing we have to the registered email at this
 *  point — actual email isn't exposed on the User object. Fallback to a
 *  generic phrase so the banner still reads cleanly. */
function usableEmail(me: { handle: string }): string {
  return `your inbox (@${me.handle})`;
}
