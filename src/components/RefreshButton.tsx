import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';

/**
 * Small circular refresh button used in the headers of the Feed, Floats,
 * and Notifications pages. Replaces the old pull-to-refresh gesture,
 * which was too sensitive on iOS — accidental over-scrolls kept firing
 * refreshes the user didn't intend.
 *
 * Behaviour:
 *   • Tap → run `onRefresh()`. The icon spins for the duration of the
 *     promise; the button is disabled while spinning so a double-tap
 *     can't queue overlapping requests.
 *   • Guarantees a minimum spin duration (`MIN_SPIN_MS`) — without it,
 *     fast network calls feel like the tap didn't register because the
 *     spinner blinks for ~50ms and disappears.
 *
 * Matches the existing `h-9 w-9` icon-button look used elsewhere in page
 * headers (Search button on Feed, etc.) so it slots in without extra
 * design work.
 */

const MIN_SPIN_MS = 400;

interface Props {
  onRefresh: () => void | Promise<unknown>;
  ariaLabel?: string;
  className?: string;
}

export function RefreshButton({ onRefresh, ariaLabel = 'Refresh', className = '' }: Props) {
  const [spinning, setSpinning] = useState(false);
  // Cooldown guard — set when a tap fires; cleared when both the refresh
  // promise has settled AND the minimum spin duration has elapsed.
  const inFlight = useRef(false);

  const onTap = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSpinning(true);
    const start = performance.now();
    try {
      await onRefresh();
    } finally {
      const elapsed = performance.now() - start;
      const wait = Math.max(0, MIN_SPIN_MS - elapsed);
      window.setTimeout(() => {
        setSpinning(false);
        inFlight.current = false;
      }, wait);
    }
  };

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={() => void onTap()}
      disabled={spinning}
      aria-label={ariaLabel}
      className={`h-9 w-9 grid place-items-center rounded-full bg-white/5 border border-white/10
                  text-zinc-200 hover:bg-white/10 transition disabled:opacity-70 ${className}`}
    >
      <motion.span
        animate={spinning ? { rotate: 360 } : { rotate: 0 }}
        transition={spinning
          ? { duration: 0.9, repeat: Infinity, ease: 'linear' }
          : { duration: 0.2 }}
        className="grid place-items-center"
      >
        <RefreshCw size={16} className={spinning ? 'text-rose-300' : ''} />
      </motion.span>
    </motion.button>
  );
}
