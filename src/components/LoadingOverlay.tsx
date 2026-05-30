import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useApp } from '../store';

/**
 * Full-screen loading overlay shown whenever the store's `authBusy` flag is
 * true. Covers the entire app with a dim backdrop + centered spinner so the
 * user gets clear feedback that a slow auth round-trip is in flight, and so
 * any underlying buttons are physically un-tappable (preventing the
 * double-tap-while-the-network-was-still-going hangs the user reported).
 *
 * Mounted once at the App root.
 */
export function LoadingOverlay() {
  const busy = useApp(s => s.authBusy);
  return (
    <AnimatePresence>
      {busy && (
        <motion.div
          key="loading-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[300] grid place-items-center bg-black/55 backdrop-blur-sm"
          // Block every pointer event underneath — that's the whole point.
          // aria-busy lets screen readers announce the state.
          role="status"
          aria-busy="true"
          aria-live="polite"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            className="flex flex-col items-center gap-3 px-6 py-5 rounded-3xl
                       bg-[#15121b] border border-white/10
                       shadow-[0_30px_60px_-20px_rgba(0,0,0,0.75)]"
          >
            <Loader2 size={28} className="text-rose-300 animate-spin" />
            <div className="text-white text-sm font-semibold">Just a sec…</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
