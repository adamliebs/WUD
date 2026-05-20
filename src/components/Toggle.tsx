import { motion } from 'framer-motion';

interface Props {
  value: boolean;
  onChange: (v: boolean) => void;
  ariaLabel?: string;
}

/** iOS-style toggle switch — used in the Settings screen. */
export function Toggle({ value, onChange, ariaLabel }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel}
      onClick={() => onChange(!value)}
      className={`relative h-7 w-12 rounded-full transition-colors flex items-center px-0.5
                  ${value
                    ? 'bg-gradient-to-r from-rose-500 to-orange-500 justify-end'
                    : 'bg-white/15 justify-start'}`}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 36 }}
        className="block h-6 w-6 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
      />
    </button>
  );
}
