import { useEffect, useRef } from 'react';

/**
 * Global gesture: a downward swipe anywhere on the screen dismisses the
 * on-screen keyboard. Mirrors the iOS Messages / Mail behavior the user
 * already expects from a native app.
 *
 * Detection strategy:
 *   • Listen for touchstart / touchend on the document.
 *   • Compute vertical delta; ignore if it's too short (accidental scrolls)
 *     or too horizontal (a real horizontal swipe).
 *   • Only fire when the keyboard is actually visible — checked via
 *     `visualViewport.height < window.innerHeight - threshold`. Without this
 *     guard the gesture would steal taps that weren't meant for it.
 *   • To dismiss, blur the currently-focused input. iOS hides the keyboard
 *     as a side effect of the blur.
 *
 * Returns nothing — purely a side-effect mount.
 */
export function DismissKeyboardOnSwipe() {
  // Track the touchstart Y per active touch so a multi-touch gesture doesn't
  // confuse us. We only care about the first finger.
  const startY = useRef<number | null>(null);

  useEffect(() => {
    const isKeyboardVisible = (): boolean => {
      const vv = window.visualViewport;
      if (!vv) return false;
      // 150px is well above the rounding wobble (a few px between visual and
      // layout viewport on iOS) and well below the smallest software keyboard.
      return window.innerHeight - vv.height > 150;
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startY.current = t ? t.clientY : null;
    };

    const onEnd = (e: TouchEvent) => {
      const start = startY.current;
      startY.current = null;
      if (start === null) return;
      if (!isKeyboardVisible()) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const dy = t.clientY - start;
      // Need at least 50px of downward movement to count as a deliberate
      // dismiss. Below that and a tap on an input nearby would dismiss it
      // accidentally, which is awful.
      if (dy < 50) return;
      const active = document.activeElement as HTMLElement | null;
      if (active && typeof active.blur === 'function') active.blur();
    };

    // Passive listeners — we never preventDefault, so the page still
    // scrolls normally. The blur is fire-and-forget.
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, []);

  return null;
}
