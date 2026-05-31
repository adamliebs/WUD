/**
 * Lazy wrapper around canvas-confetti.
 *
 * canvas-confetti is ~10KB minified and is only fired in 3 places (RSVP
 * join, float send, float lock-in) — none of which happen on first
 * render. Wrapping it behind a dynamic import keeps it OUT of the
 * initial bundle; the first burst pays a one-frame import cost, every
 * subsequent burst is instant (browser caches the module).
 *
 * Same signature as canvas-confetti's default export, so callers can
 * just swap `import confetti from 'canvas-confetti'` →
 * `import { burst as confetti } from '@/lib/confetti'`.
 */

import type confetti from 'canvas-confetti';

type Opts = Parameters<typeof confetti>[0];

// Cache the loaded module so we don't re-import on every burst.
let mod: typeof confetti | null = null;

export function burst(opts?: Opts): void {
  if (mod) {
    mod(opts);
    return;
  }
  // Fire-and-forget — the first call returns immediately, the burst
  // happens ~1 frame later once the module resolves. Subsequent calls
  // hit the cached `mod` synchronously.
  void import('canvas-confetti').then(m => {
    mod = m.default;
    mod(opts);
  });
}
