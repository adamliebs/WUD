import { useEffect, useRef } from 'react';

/**
 * iOS-style left-edge swipe-back gesture. Attach the returned ref to the
 * back-able container. A horizontal drag that starts within `edgePx` of the
 * left screen edge and travels at least `distancePx` to the right invokes
 * `onBack`.
 *
 * Why edge-only? An anywhere-on-screen swipe-right would compete with
 * content-level gestures (horizontal chip rails, the live strip, calendar
 * day picker, sheet drag handles) and feel buggy. Edge anchoring is the
 * compromise iOS itself uses for the same reason.
 */
export function useSwipeBack<T extends HTMLElement = HTMLDivElement>(
  onBack: () => void,
  opts: { edgePx?: number; distancePx?: number; enabled?: boolean } = {},
) {
  const ref = useRef<T>(null);
  const { edgePx = 28, distancePx = 64, enabled = true } = opts;

  useEffect(() => {
    const node = ref.current;
    if (!node || !enabled) return;

    let tracking = false;
    let startX = 0, startY = 0, startTime = 0;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      // Only count drags that begin near the left edge so horizontal
      // scrollables in the middle of the screen aren't hijacked.
      if (t.clientX > edgePx) { tracking = false; return; }
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Once the gesture clearly commits to horizontal motion, suppress the
      // browser's default (rubber-banding, native history nav on PWAs).
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) e.preventDefault();
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startTime;
      // Must be far enough, dominantly horizontal, and finished within ~half
      // a second — a slow zigzag isn't a swipe-back.
      if (dx > distancePx && dx > 2 * Math.abs(dy) && dt < 600) {
        onBack();
      }
    };

    const onCancel = () => { tracking = false; };

    node.addEventListener('touchstart', onStart, { passive: true });
    node.addEventListener('touchmove', onMove, { passive: false });
    node.addEventListener('touchend', onEnd);
    node.addEventListener('touchcancel', onCancel);
    return () => {
      node.removeEventListener('touchstart', onStart);
      node.removeEventListener('touchmove', onMove);
      node.removeEventListener('touchend', onEnd);
      node.removeEventListener('touchcancel', onCancel);
    };
  }, [onBack, edgePx, distancePx, enabled]);

  return ref;
}
