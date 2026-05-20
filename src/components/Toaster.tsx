import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useApp } from '../store';

export function Toaster() {
  const toasts = useApp(s => s.toasts);
  const dismiss = useApp(s => s.dismissToast);

  useEffect(() => {
    const timers = toasts.map(t =>
      setTimeout(() => dismiss(t.id), 2400)
    );
    return () => { timers.forEach(clearTimeout); };
  }, [toasts, dismiss]);

  return (
    <div className="absolute top-12 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div
            key={t.id}
            initial={{ y: -30, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={`glass-strong px-4 py-2.5 rounded-full text-sm font-medium text-white shadow-xl
                        ${t.tone === 'success' ? 'border-emerald-400/40' :
                          t.tone === 'warn' ? 'border-amber-400/40' : ''}`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
