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
 *   • A stiff square-root resistance curve makes a long pull feel deliberate
 *     — accidental scroll-bounce won't reach the trigger. Tuned against
 *     iOS Mail's behaviour: ~165px of finger travel to arm a refresh.
 *   • The indicator is anchored at the top of the wrapper and slides down
 *     with the content. While refreshing, it pins at `HOLD_Y` so the user
 *     sees the spinner even after they let go.
 *   • An "armed" visual (rose tint + scale bump + bg fill) flips on the
 *     moment pullY crosses TRIGGER so the user gets clear "release now to
 *     refresh" feedback instead of guessing whether they pulled far enough.
 *   • The wrapper is a fragment-style container — children are translated
 *     via a motion.div so existing scroll behaviour inside is untouched.
 *
 * Usage: wrap whatever's currently a `overflow-y-auto` scroll area and pass
 * `onRefresh` (returns a Promise; we await it before retracting).
 */

/** Damped pull distance at which a refresh arms. Was 70 — felt too light,
 *  fired on accidental over-scrolls. 90 lines up with iOS Mail's threshold
 *  in practice once the resistance curve below is taken into account. */
const TRIGGER = 90;
const MAX_PULL = 150;
const HOLD_Y = 56;
/** Resistance multiplier applied to `sqrt(rawDy)` to get the damped pull.
 *  Lower = stiffer (each finger pixel produces less indicator movement).
 *  At 7, hitting the 90-damped trigger requires ~165px of raw finger
 *  travel — a deliberate, unmistakable gesture. */
const DAMPING = 7;
/** Visual height of the spinner pill (h-9 = 36px). Used to offset the
 *  indicator's translate so its bottom aligns with the bottom of the
 *  pull gap instead of jutting past it into the content below. */
const INDICATOR_HEIGHT = 36;

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
  // True the moment pullY crosses TRIGGER; flips off when pullY drops back
  // below TRIGGER. Drives the "armed" visual so the user sees the indicator
  // change state at exactly the moment a release would trigger.
  const [armed, setArmed] = useState(false);
  // pullY is the drag distance after damping (0 → MAX_PULL). It feeds into
  // both the indicator transform and the content translate.
  const pullY = useMotionValue(0);

  // Indicator visuals derived from pullY so we don't re-render React on
  // every touchmove — only the GPU layer updates. Opacity ramps up over
  // the first chunk of the pull so the indicator is faint while the user
  // is still committing to the gesture, full opacity by the trigger.
  const indicatorOpacity = useTransform(pullY, [0, 40, TRIGGER], [0, 0.4, 1]);
  const indicatorScale = useTransform(pullY, [0, TRIGGER], [0.6, 1]);
  const indicatorRotate = useTransform(pullY, [0, TRIGGER, MAX_PULL], [0, 180, 270]);
  // Indicator descends with the pull but offset by its own height so its
  // BOTTOM tracks the bottom of the gap the content opens up. Without this
  // offset, the spinner sat at top:2+pullY which crashed past the gap and
  // overlapped the first row of content when refreshing.
  const indicatorY = useTransform(pullY, v => v - INDICATOR_HEIGHT - 2);

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
      if (armed) setArmed(false);
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      pullY.set(0);
      if (armed) setArmed(false);
      return;
    }
    // Square-root resistance with a stiff multiplier — the pull feels
    // progressively harder, so reaching the trigger requires a deliberate
    // commitment rather than an accidental fingertip drift.
    const damped = Math.min(MAX_PULL, Math.sqrt(dy) * DAMPING);
    pullY.set(damped);
    // Flip the armed state as the user crosses the trigger. Using setState
    // here is fine — it only fires on the crossing, not every frame.
    const shouldArm = damped >= TRIGGER;
    if (shouldArm !== armed) setArmed(shouldArm);
  };

  const onTouchEnd = async () => {
    if (startY.current === null) return;
    startY.current = null;
    const settled = pullY.get();
    if (settled >= TRIGGER && !refreshing) {
      setRefreshing(true);
      setArmed(false);
      pullY.set(HOLD_Y);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        pullY.set(0);
      }
    } else {
      pullY.set(0);
      if (armed) setArmed(false);
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
      {/* Indicator — sits just above the content. As the user pulls, the
          spinner descends into the gap that opens up (using `indicatorY`,
          which is pullY offset by the spinner's own height so it never
          spills past the bottom of the gap). At rest the spinner is
          translated above the container and clipped out of view. */}
      <motion.div
        style={{
          opacity: indicatorOpacity,
          y: indicatorY,
          willChange: 'transform, opacity',
        }}
        className="absolute top-2 left-0 right-0 grid place-items-center pointer-events-none z-10"
      >
        <motion.div
          style={{ scale: indicatorScale, rotate: refreshing ? 0 : indicatorRotate }}
          animate={refreshing
            ? { rotate: 360, scale: 1 }
            : armed
              // Armed state: pop the spinner up to telegraph "release now
              // and it'll refresh". Combined with the bg/border swap below,
              // this is the user's only feedback that they've pulled far
              // enough — without it the gesture feels guess-y.
              ? { scale: 1.18 }
              : undefined}
          transition={refreshing
            ? { duration: 0.9, repeat: Infinity, ease: 'linear' }
            : { type: 'spring', stiffness: 380, damping: 22 }}
          className={`h-9 w-9 rounded-full grid place-items-center backdrop-blur border transition-colors
                      ${armed || refreshing
                        ? 'bg-gradient-to-br from-rose-500 to-orange-500 border-rose-300 text-white shadow-[0_8px_22px_-8px_rgba(244,63,94,0.7)]'
                        : 'bg-white/10 border-white/15 text-white'}`}
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
