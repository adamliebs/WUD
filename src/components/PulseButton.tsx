import { motion } from 'framer-motion';
import { type ReactNode } from 'react';

interface Props {
  onClick?: (e: React.MouseEvent) => void;
  children: ReactNode;
  disabled?: boolean;
  /** "primary" — rose→orange gradient (default). "amber" — for "take over hosting" */
  tone?: 'primary' | 'amber';
  /** "round" = circle-friendly halo (for the floating + button). "wide" = rectangle. */
  shape?: 'wide' | 'round';
  className?: string;
  ariaLabel?: string;
}

/**
 * Primary CTA with the soft pulsing halo + gentle breathe — same treatment
 * as the floating "+" tab-bar button. Use for any prominent action.
 */
export function PulseButton({
  onClick, children, disabled, tone = 'primary', shape = 'wide', className = '', ariaLabel,
}: Props) {
  const haloA =
    tone === 'amber' ? 'bg-amber-500/40' : 'bg-rose-500/40';
  const haloB =
    tone === 'amber' ? 'bg-orange-400/30' : 'bg-orange-400/30';
  const gradient =
    tone === 'amber'
      ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500'
      : 'bg-gradient-to-r from-rose-500 via-pink-500 to-orange-500';
  const shadow =
    tone === 'amber'
      ? 'shadow-[0_18px_40px_-10px_rgba(251,146,60,0.6)]'
      : 'shadow-[0_18px_40px_-10px_rgba(244,63,94,0.6)]';

  const radius = shape === 'round' ? 'rounded-full' : 'rounded-2xl';
  // Smaller halo expansion for wide buttons so it doesn't bloom too far horizontally.
  const haloAExpand = shape === 'round' ? 1.6 : 1.04;
  const haloBExpand = shape === 'round' ? 1.9 : 1.07;
  const breathe     = shape === 'round' ? 1.03 : 1.015;

  return (
    <div className={`relative inline-block ${shape === 'wide' ? 'w-full' : ''} ${className}`}>
      {!disabled && (
        <>
          <motion.span
            aria-hidden
            className={`absolute inset-0 ${radius} ${haloA} blur-md pointer-events-none`}
            animate={{ scale: [1, haloAExpand, 1], opacity: [0.55, 0, 0.55] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut' }}
          />
          <motion.span
            aria-hidden
            className={`absolute inset-0 ${radius} ${haloB} blur-lg pointer-events-none`}
            animate={{ scale: [1, haloBExpand, 1], opacity: [0.45, 0, 0.45] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: 0.6 }}
          />
        </>
      )}
      <motion.button
        whileTap={!disabled ? { scale: 0.97 } : undefined}
        animate={!disabled ? { scale: [1, breathe, 1] } : undefined}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`relative w-full py-3.5 ${radius} font-bold text-white text-base ring-1 ring-white/15
                    ${disabled ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed ring-0' : `${gradient} ${shadow}`}`}
      >
        {children}
      </motion.button>
    </div>
  );
}
