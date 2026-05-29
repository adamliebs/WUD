import { animate, motion, useDragControls, useMotionValue, type PanInfo } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { FeedScreen } from '../screens/FeedScreen';
import { FloatsScreen } from '../screens/FloatsScreen';
import { NotificationsScreen } from '../screens/NotificationsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { isFormControl, isInHorizontalScroller } from './gesture-utils';

type TabKey = 'feed' | 'floats' | 'notifications' | 'profile';
const TABS: TabKey[] = ['feed', 'floats', 'notifications', 'profile'];

/**
 * Horizontal pager for the four main tabs. Swipe left/right anywhere on the
 * page (except over a horizontal scroller or form control) to move between
 * tabs; the active page follows the finger and the adjacent page peeks in.
 *
 * Why this is fast:
 *   • All four tabs render once and stay mounted, so swiping never triggers
 *     a remount — scroll positions and component state survive. The initial
 *     cold mount of four lightweight screens is the only one-time cost.
 *   • A motion value drives the transform, so drag updates write straight
 *     to the GPU layer (translate3d) without re-rendering React.
 *   • `dragDirectionLock` defers committing to a horizontal drag until the
 *     gesture is clearly horizontal, so vertical scrolls inside tabs aren't
 *     hijacked.
 *   • Touches that begin inside a horizontal scroller (live strip, day
 *     pills, etc.) skip the drag entirely so those keep working.
 *
 * Tapping a tab in the TabBar still works — it sets `tab` in the store, and
 * we animate the motion value to the new index.
 */
export function MainTabsPager() {
  const tab = useApp(s => s.tab) as TabKey;
  const setTab = useApp(s => s.setTab);
  const idx = Math.max(0, TABS.indexOf(tab));

  // Measure the viewport so the pager works on any device width. ResizeObserver
  // is cheap and fires only on real layout changes (rotation, splitview, etc.).
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.offsetWidth);
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Motion value driving the translate. We animate it on tab change (from
  // tap-on-tabbar) and let framer's drag write to it directly during gestures.
  const x = useMotionValue(0);

  // Keep `x` in sync with the active tab whenever the index or width changes.
  // The user-initiated drag-snap also calls setTab → this effect → animate.
  useEffect(() => {
    if (width === 0) return;
    const target = -idx * width;
    const controls = animate(x, target, {
      type: 'spring',
      stiffness: 380,
      damping: 38,
      mass: 0.9,
    });
    return () => controls.stop();
  }, [idx, width, x]);

  // Manual drag control so we can decide whether to engage based on touch
  // origin. Default listener is disabled; we start drag in onPointerDown when
  // the touch isn't on a scrollable child / form control.
  const dragControls = useDragControls();

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only handle primary pointer (left mouse or first touch).
    if (e.button !== 0) return;
    const root = containerRef.current;
    if (!root) return;
    if (isFormControl(e.target)) return;
    if (isInHorizontalScroller(e.target, root)) return;
    // Hand off to framer's drag system. It still applies dragDirectionLock,
    // so a clearly-vertical gesture won't engage horizontal drag.
    dragControls.start(e);
  };

  const onDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const offset = info.offset.x;
    const velocity = info.velocity.x;
    // Project where the gesture would land if the user "flicked" — combines
    // displacement with momentum. Threshold = quarter of a screen.
    const projected = offset + 0.25 * velocity;
    let nextIdx = idx;
    if (projected < -width / 4) nextIdx = Math.min(idx + 1, TABS.length - 1);
    else if (projected > width / 4) nextIdx = Math.max(idx - 1, 0);
    if (nextIdx !== idx) {
      setTab(TABS[nextIdx]);
    } else {
      // Snap back to the current tab.
      animate(x, -idx * width, {
        type: 'spring',
        stiffness: 380,
        damping: 38,
        mass: 0.9,
      });
    }
  };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" onPointerDown={onPointerDown}>
      <motion.div
        drag={width > 0 ? 'x' : false}
        dragControls={dragControls}
        dragListener={false}
        dragDirectionLock
        dragConstraints={{ left: -(TABS.length - 1) * width, right: 0 }}
        dragElastic={0.12}
        onDragEnd={onDragEnd}
        style={{ x, width: TABS.length * width || '100%', willChange: 'transform' }}
        className="absolute top-0 left-0 h-full flex"
      >
        <Pane width={width}><FeedScreen /></Pane>
        <Pane width={width}><FloatsScreen /></Pane>
        <Pane width={width}><NotificationsScreen /></Pane>
        <Pane width={width}><ProfileScreen /></Pane>
      </motion.div>
    </div>
  );
}

function Pane({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <div style={{ width: width || '100%' }} className="h-full relative shrink-0">
      {children}
    </div>
  );
}
