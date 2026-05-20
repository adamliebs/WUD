import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { type ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** "full" pulls just under the notch; "tall" leaves a bit more peek. */
  size?: 'full' | 'tall';
}

export function BottomSheet({ open, onClose, children, size = 'full' }: Props) {
  const top = size === 'full' ? 48 : 96;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="absolute inset-0 z-40 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="absolute left-0 right-0 z-50 glass-strong rounded-t-[28px] shadow-2xl overflow-hidden"
            style={{ top, bottom: 0 }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={handleDragEnd}
          >
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1.5 w-12 rounded-full bg-white/30" />
            </div>
            <div className="h-full overflow-hidden">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
