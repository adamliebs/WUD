import { motion, useMotionValue, useTransform } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

/**
 * iOS-style pull-to-refresh wrapper. The scrollable content is the immediate
 * child; we track touch deltas on the wrapper itself and only engage when
 * the scroll container is at the very top.
 *
 * Design choices:
 *   • Pure touch events — no library. framer-motion's `drag` would intercept
 *     vertical scroll initiation and we'd lose native momentum + bounce.
 *   • A square-root curve dampens the pull so it feels rubbery instead of
 *     1:1 (matches iOS spring resistance).
 *   • The indicator is anchored at the top of the wrapper and slides down
 *     with the content. While refreshing, it pins at `HOLD_Y` so the user
 *     sees the spinner even after they let go.
 *   • The wrapper is a fragment-style container — children are translated
 *     via a motion.div so existing scroll behaviour inside is untouched.
 *
 * Usage: wrap whatever's currently a `overflow-y-auto` scroll area and pass
 * `onRefresh` (returns a Promise; we await it before retracting).
 */

const TRIGGER = 70;
const MAX_PULL = 110;
const HOLD_Y = 56;

interface Props {
  onRefresh: () => void | Promise<unknown>;
  /** Forwarded to the scrollable container. */
  className?: string;
  /** Style overrides for the inner scroll container. */
  style?: React.CSSProperties;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, className, style, children }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // pullY is the drag distance after damping (0 → MAX_PULL). It feeds into
  // both the indicator transform and the content translate.
  const pullY = useMotionValue(0);

  // Indicator visuals derived from pullY so we don't re-render React on
  // every touchmove — only the GPU layer updates.
  const indicatorOpacity = useTransform(pullY, [0, 35, TRIGGER], [0, 0.5, 1]);
  const indicatorScale = useTransform(pullY, [0, TRIGGER], [0.6, 1]);
  const indicatorRotate = useTransform(pullY, [0, TRIGGER, MAX_PULL], [0, 180, 270]);

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (refreshing) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop > 0) return;       // only engage when pinned to top
    startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (startY.current === null) return;
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop > 0) {
      // User scrolled down mid-gesture; abandon.
      startY.current = null;
      pullY.set(0);
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      pullY.set(0);
      return;
    }
    // Square-root resistance so the pull tapers as it stretches.
    const damped = Math.min(MAX_PULL, Math.sqrt(dy) * 9);
    pullY.set(damped);
  };

  const onTouchEnd = async () => {
    if (startY.current === null) return;
    startY.current = null;
    const settled = pullY.get();
    if (settled >= TRIGGER && !refreshing) {
      setRefreshing(true);
      pullY.set(HOLD_Y);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        pullY.set(0);
      }
    } else {
      pullY.set(0);
    }
  };

  return (
    <div
      ref={scrollRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={className}
      style={style}
    >
      {/* Indicator — sits above the content, follows the pull. */}
      <motion.div
        style={{
          opacity: indicatorOpacity,
          y: pullY,
          willChange: 'transform, opacity',
        }}
        className="absolute top-2 left-0 right-0 grid place-items-center pointer-events-none z-10"
      >
        <motion.div
          style={{ scale: indicatorScale, rotate: refreshing ? 0 : indicatorRotate }}
          animate={refreshing ? { rotate: 360 } : undefined}
          transition={refreshing ? { duration: 0.9, repeat: Infinity, ease: 'linear' } : undefined}
          className="h-9 w-9 rounded-full grid place-items-center
                     bg-white/10 backdrop-blur border border-white/15 text-white"
        >
          <RefreshCw size={16} />
        </motion.div>
      </motion.div>

      {/* Content translates with the pull so the indicator "lifts" the page. */}
      <motion.div style={{ y: pullY, willChange: 'transform' }}>
        {children}
      </motion.div>
    </div>
  );
}
