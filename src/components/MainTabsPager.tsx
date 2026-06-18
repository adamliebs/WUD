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
 * Horizontal pager for the four main tabs, with Instagram-style two-mode
 * behaviour:
 *
 *   • **Tap on TabBar** → instant snap to the new tab, no transition.
 *     Matches Instagram, X, and most modern social apps — the user has
 *     already chosen a destination, so an animated slide between far-apart
 *     tabs is wasted motion (and the prior attempt to add a pop overlay
 *     surfaced a dark flash through opacity 0).
 *   • **Swipe** → the pager translates with the finger and spring-snaps to
 *     the next tab on release.
 *
 * A `lastChangeFromDrag` ref tells the idx-watching effect which mode to use:
 *   - true → smooth spring to the new x target
 *   - false → instant x.set()
 *
 * All four tabs stay mounted across switches so scroll positions / UI state
 * survive — better than the previous AnimatePresence behaviour which
 * unmounted on every tab change.
 *
 * Performance:
 *   • Drag writes straight to the GPU layer via motion value (no React
 *     re-renders per frame).
 *   • `dragDirectionLock` defers commit until horizontal motion dominates,
 *     so vertical scrolls inside tabs aren't hijacked.
 *   • Touches that begin inside a horizontal scroller (live strip, day
 *     pills) or a form control bail entirely.
 */
export function MainTabsPager() {
  const tab = useApp(s => s.tab) as TabKey;
  const setTab = useApp(s => s.setTab);
  const idx = Math.max(0, TABS.indexOf(tab));

  // Measure the viewport so the pager works on any device width.
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

  // Motion value driving the translate. Drag writes to it directly; we
  // either snap or animate it on idx changes (see useEffect below).
  const x = useMotionValue(0);

  // True when the most recent idx change came from a drag-snap rather than a
  // TabBar tap. Drives the tap-vs-drag distinction in the effect below.
  const lastChangeFromDrag = useRef(false);

  useEffect(() => {
    if (width === 0) return;
    const target = -idx * width;
    if (lastChangeFromDrag.current) {
      // Drag-driven: smooth slide to the new tab.
      const controls = animate(x, target, {
        type: 'spring',
        stiffness: 380,
        damping: 38,
        mass: 0.9,
      });
      lastChangeFromDrag.current = false;
      return () => controls.stop();
    }
    // Tap-driven (or initial mount): instant snap. No transition shown.
    x.set(target);
  }, [idx, width, x]);

  // Manual drag control so we can decide whether to engage based on touch
  // origin. Default listener is disabled; we start drag in onPointerDown when
  // the touch isn't on a scrollable child / form control.
  const dragControls = useDragControls();

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
    let nextIdx = idx;
    if (projected < -width / 4) nextIdx = Math.min(idx + 1, TABS.length - 1);
    else if (projected > width / 4) nextIdx = Math.max(idx - 1, 0);
    if (nextIdx !== idx) {
      lastChangeFromDrag.current = true;
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
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      onPointerDown={onPointerDown}
      // Pane positioning is done entirely via the translateX below, so this
      // container must never carry a scroll offset of its own. An overflow:hidden
      // box is still PROGRAMMATICALLY scrollable (e.g. a descendant calling
      // scrollIntoView), which would shove panes out of place and wedge the
      // pager. Snap any such scroll straight back to zero.
      onScroll={e => {
        if (e.currentTarget.scrollLeft !== 0) e.currentTarget.scrollLeft = 0;
        if (e.currentTarget.scrollTop !== 0) e.currentTarget.scrollTop = 0;
      }}
    >
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
