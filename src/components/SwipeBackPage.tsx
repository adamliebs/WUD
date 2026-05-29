import { motion, useDragControls, type PanInfo } from 'framer-motion';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isFormControl, isInHorizontalScroller } from './gesture-utils';

interface Props {
  /** Called after the drag commits and the page has slid off-screen. The
   *  caller flips its own state to unmount us; AnimatePresence does the rest. */
  onBack: () => void;
  /** Spring transition shared by entry, snap-back, and commit. Override if a
   *  consumer wants something tighter/looser. */
  transition?: Parameters<typeof motion.div>[0]['transition'];
  className?: string;
  children: ReactNode;
}

/**
 * Page wrapper that lets the user drag rightward from anywhere on the page
 * to dismiss it. The page follows the finger continuously, revealing what
 * sits underneath (the always-mounted main tab pager) — no instant pop.
 *
 * The mental model is iOS's "interactive pop transition." Implementation
 * notes:
 *
 *   • Drag updates write straight to the GPU layer via framer-motion's
 *     internal motion values — no React re-renders per frame.
 *   • `dragDirectionLock` defers committing to a horizontal drag until the
 *     gesture is dominantly horizontal, so vertical scrolls inside the page
 *     are never hijacked.
 *   • Touches starting on a horizontal scroller (e.g. a chip rail) or a
 *     form control bail out of drag so those keep their own gestures.
 *   • Entry/exit animations use the standard `initial / animate / exit`
 *     pattern driven by a `committed` state. When the user releases past
 *     the threshold, we set `committed=true` → animate target flips to
 *     "off-screen" → `onAnimationComplete` fires `onBack`. AnimatePresence
 *     then unmounts; the (already-completed) exit animation is a no-op.
 *
 * Commit rule: projected coast = offset + 0.25 * velocity. Past 25 % of
 * screen width OR velocity > 700 px/s → commit; else snap back.
 */
export function SwipeBackPage({
  onBack, transition, className, children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [committed, setCommitted] = useState(false);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.offsetWidth);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const dragControls = useDragControls();

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (committed) return;
    if (e.button !== 0) return;
    const root = containerRef.current;
    if (!root) return;
    if (isFormControl(e.target)) return;
    if (isInHorizontalScroller(e.target, root)) return;
    dragControls.start(e);
  };

  const onDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    const projected = offset + 0.25 * velocity;
    if (projected > width * 0.25 || velocity > 700) {
      // Past threshold — slide off and fire onBack on animation complete.
      setCommitted(true);
    }
    // Otherwise framer auto-tweens back to the animate target (x: 0).
  };

  const springy = transition ?? {
    type: 'spring' as const, stiffness: 380, damping: 38, mass: 0.9,
  };

  return (
    <motion.div
      ref={containerRef}
      onPointerDown={onPointerDown}
      initial={{ x: '100%' }}
      animate={committed ? { x: '100%' } : { x: 0 }}
      exit={{ x: '100%' }}
      transition={springy}
      onAnimationComplete={() => {
        if (committed) onBack();
      }}
      drag={committed ? false : 'x'}
      dragControls={dragControls}
      dragListener={false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: width }}
      dragElastic={{ left: 0, right: 0.2 }}
      onDragEnd={onDragEnd}
      style={{ willChange: 'transform' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
