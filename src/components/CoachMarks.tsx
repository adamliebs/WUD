import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { burst } from '../lib/confetti';
import { COACH_STEPS, questDone, useApp, type QuestKey } from '../store';

/**
 * Coach-mark overlay — the interactive half of the Getting Started flow.
 *
 * While a tour is active the screen dims, a cutout spotlights the real
 * control (tagged with [data-coach="<key>"]), and a tooltip with an arrow
 * explains the move. Steps advance when the user actually performs the
 * action (store-state checks / control signals) or via "Got it" for
 * free-form steps; "Skip tour" is always present so nobody gets trapped.
 *
 * The dim layer is four rectangles around the cutout — they swallow taps so
 * attention stays on the highlighted control, while the hole itself stays
 * fully interactive (the user taps the REAL button; nothing is simulated).
 * Targets are re-measured on a short interval so scrolling, sheet
 * animations, and layout shifts keep the spotlight glued to the control.
 *
 * Sits at z-[60]: above tabs/sheets/overlays (z-30..50), below the contacts
 * modal (z-[70]) and the replayable screenshot tutorial (z-[90]).
 */
export function CoachMarks() {
  const coach = useApp(s => s.coach);
  // Pause while the contacts-finder modal owns the screen — it has its own
  // guidance and sits in a layer the coach would render on top of.
  const contactsOpen = useApp(s => s.contactsSheetOpen);
  if (!coach || contactsOpen) return null;
  return (
    <ActiveCoach
      key={`${coach.quest}-${coach.step}`}
      quest={coach.quest}
      stepIdx={coach.step}
      replay={coach.replay}
    />
  );
}

interface Hole { x: number; y: number; w: number; h: number }
const PAD = 8; // breathing room between the control and the cutout edge

/**
 * Scroll a target into view by adjusting ONLY the nearest vertical scroll
 * container's scrollTop — never any horizontal scroll. Using the native
 * `el.scrollIntoView()` could scroll a horizontally-overflowing ancestor
 * (including the transform-based tab pager, whose overflow:hidden box is
 * still programmatically scrollable), which slid panes out of place and
 * wedged the pager. This keeps the fix surgical: vertical only.
 */
function scrollVerticalOnly(el: HTMLElement): void {
  let sc: HTMLElement | null = el.parentElement;
  while (sc) {
    const oy = getComputedStyle(sc).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight + 1) break;
    sc = sc.parentElement;
  }
  if (!sc) return;
  const scRect = sc.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  const delta = (elRect.top + elRect.height / 2) - (scRect.top + scRect.height / 2);
  sc.scrollBy({ top: delta, behavior: 'smooth' });
}

function ActiveCoach({ quest, stepIdx, replay }: { quest: QuestKey; stepIdx: number; replay: boolean }) {
  const steps = COACH_STEPS[quest];
  const step = steps[stepIdx];
  const advance = useApp(s => s.advanceCoach);
  const end = useApp(s => s.endCoach);

  // Auto-advance for "do the thing" steps the moment the store reflects it.
  const stateAdvanced = useApp(s =>
    step.advance.kind === 'state' ? step.advance.check(s) : false);
  useEffect(() => {
    if (stateAdvanced) advance();
  }, [stateAdvanced, advance]);

  // The tour's real-world goal landed (posted / floated / pinged / …) —
  // close out with a small celebration regardless of which step we're on.
  // Skipped on a replay (the goal was already done at launch, so this would
  // fire on step 0 and slam the tour shut before it could play).
  const goalDone = useApp(s => questDone(s, quest));
  useEffect(() => {
    if (!goalDone || replay) return;
    burst({ particleCount: 80, spread: 75, origin: { y: 0.5 } });
    end();
  }, [goalDone, replay, end]);

  // ---- target measurement ----------------------------------------------
  const rootRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hole, setHole] = useState<Hole | null>(null);
  // Counts consecutive measurements with no target in the DOM — after a few
  // we fall back to a centered card instead of an invisible dead overlay.
  const [missingTicks, setMissingTicks] = useState(0);

  useEffect(() => {
    // One-time per step: if the target sits outside the visible frame
    // (e.g. the ping rail below the fold), bring it into view first.
    let scrolled = false;
    const measure = () => {
      const root = rootRef.current;
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      setFrame(prev => (prev.w === rootRect.width && prev.h === rootRect.height)
        ? prev : { w: rootRect.width, h: rootRect.height });
      // Empty target = intentional centered card (intro slides) — no spotlight.
      if (!step.target) { setHole(null); return; }
      const el = document.querySelector(`[data-coach="${step.target}"]`) as HTMLElement | null;
      if (!el) {
        setHole(null);
        setMissingTicks(t => t + 1);
        return;
      }
      setMissingTicks(0);
      if (!scrolled) {
        scrolled = true;
        const r0 = el.getBoundingClientRect();
        if (r0.top < rootRect.top || r0.bottom > rootRect.bottom) {
          // Vertical-only scroll. NOT el.scrollIntoView() — that can scroll an
          // ancestor HORIZONTALLY, and the tab pager positions panes with a
          // translateX inside an overflow-hidden box (still programmatically
          // scrollable), so scrollIntoView shoved the Floats pane sideways into
          // the Feed slot and wedged the pager.
          scrollVerticalOnly(el);
        }
      }
      const r = el.getBoundingClientRect();
      const next = { x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height };
      setHole(prev =>
        prev &&
        Math.abs(prev.x - next.x) < 1 && Math.abs(prev.y - next.y) < 1 &&
        Math.abs(prev.w - next.w) < 1 && Math.abs(prev.h - next.h) < 1
          ? prev : next);
    };
    // Measure every animation frame rather than on a 200ms timer. The old
    // interval couldn't keep up with a smooth scroll, so the spotlight lurched
    // in coarse steps; per-frame tracking makes it glide with the target. The
    // diff check below skips setState when nothing moved, so an idle overlay
    // doesn't re-render — only getBoundingClientRect runs each frame (cheap).
    let raf = 0;
    const loop = () => { measure(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
  }, [step.target]);

  // ---- layout maths -------------------------------------------------------
  const hx = hole ? hole.x - PAD : 0;
  const hy = hole ? hole.y - PAD : 0;
  const hw = hole ? hole.w + PAD * 2 : 0;
  const hh = hole ? hole.h + PAD * 2 : 0;

  const tooltipW = Math.min(300, frame.w - 24);
  // Place the tooltip wherever there's room. A tall target (e.g. the whole
  // Getting Started card) left almost no space below it, so the old
  // center-based rule pushed the tooltip off the bottom edge; choose the side
  // with more room instead.
  const TOOLTIP_EST = 150;
  const spaceBelow = hole ? frame.h - (hy + hh) : frame.h;
  const spaceAbove = hole ? hy : 0;
  const below = hole ? (spaceBelow >= TOOLTIP_EST || spaceBelow >= spaceAbove) : true;
  const tooltipLeft = hole
    ? Math.min(Math.max(hx + hw / 2 - tooltipW / 2, 12), Math.max(frame.w - tooltipW - 12, 12))
    : (frame.w - tooltipW) / 2;
  const arrowX = hole
    ? Math.min(Math.max(hx + hw / 2 - tooltipLeft, 22), tooltipW - 22)
    : tooltipW / 2;

  const waitingForTap = step.advance.kind !== 'manual';
  // Centered card: intentional (empty target) or a target that never showed.
  const centered = !hole && (!step.target || missingTicks > 3);

  return (
    <div ref={rootRef} className="absolute inset-0 z-[60] pointer-events-none">
      <AnimatePresence>
        {hole && (
          <motion.div
            key="spot"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0"
          >
            {/* Dim layer — four panels around the cutout. On focused steps
                they intercept taps so the only interactive pixels are the
                spotlighted control; `free` steps keep everything tappable
                (the user is filling in a whole form) and dim more lightly. */}
            {[
              { left: 0, top: 0, right: 0, height: Math.max(hy, 0) },
              { left: 0, top: hy + hh, right: 0, bottom: 0 },
              { left: 0, top: hy, width: Math.max(hx, 0), height: hh },
              { left: hx + hw, top: hy, right: 0, height: hh },
            ].map((style, i) => (
              <div
                key={i}
                className={step.free
                  ? 'absolute bg-black/25 pointer-events-none'
                  : 'absolute bg-black/60 pointer-events-auto'}
                style={style}
              />
            ))}

            {/* Pulsing highlight ring around the cutout. */}
            <motion.div
              className="absolute rounded-[22px] border-2 border-rose-400 pointer-events-none"
              style={{ left: hx, top: hy, width: hw, height: hh }}
              animate={{
                boxShadow: [
                  '0 0 0 0 rgba(244,63,94,0.45)',
                  '0 0 0 10px rgba(244,63,94,0)',
                ],
              }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
            />

            {/* Tooltip bubble + arrow. */}
            <div
              className="absolute pointer-events-auto"
              style={below
                ? { left: tooltipLeft, top: hy + hh + 14, width: tooltipW }
                : { left: tooltipLeft, bottom: frame.h - hy + 14, width: tooltipW }}
            >
              <div
                className={`absolute h-3.5 w-3.5 rotate-45 bg-zinc-900 border-rose-400/40
                            ${below ? '-top-[7px] border-l border-t' : '-bottom-[7px] border-r border-b'}`}
                style={{ left: arrowX - 7 }}
              />
              <TooltipCard
                title={step.title}
                text={step.text}
                cta={step.cta}
                stepIdx={stepIdx}
                stepCount={steps.length}
                waitingForTap={waitingForTap}
                onGotIt={advance}
                onSkip={end}
              />
            </div>
          </motion.div>
        )}

        {/* Centered card — intentional intro slides (no target) or a target
            that never appeared (sheet still animating). Full dim, no spotlight. */}
        {centered && (
          <motion.div
            key="centered"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 pointer-events-auto grid place-items-center px-6"
          >
            <div style={{ width: tooltipW }}>
              <TooltipCard
                title={step.title}
                text={step.text}
                cta={step.cta}
                stepIdx={stepIdx}
                stepCount={steps.length}
                waitingForTap={false}
                // Centered intro slides (no spotlight target) get the big,
                // hero-style title; the missing-target fallback stays compact.
                large={!step.target}
                onGotIt={advance}
                onSkip={end}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TooltipCard({
  title, text, cta, stepIdx, stepCount, waitingForTap, large, onGotIt, onSkip,
}: {
  title: string;
  text: string;
  cta?: string;
  stepIdx: number;
  stepCount: number;
  waitingForTap: boolean;
  large?: boolean;
  onGotIt: () => void;
  onSkip: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-zinc-900 border border-rose-400/40 shadow-2xl ${large ? 'p-5 text-center' : 'p-4'}`}
    >
      {stepCount > 1 && (
        <div className={`flex items-center gap-1.5 mb-2 ${large ? 'justify-center' : ''}`}>
          {Array.from({ length: stepCount }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all
                          ${i === stepIdx ? 'w-5 bg-rose-400' : 'w-1.5 bg-white/20'}`}
            />
          ))}
        </div>
      )}
      <div className={large ? 'text-[26px] font-black text-grad leading-tight' : 'text-sm font-bold text-white'}>{title}</div>
      <div className={`text-zinc-300 leading-relaxed mt-1 ${large ? 'text-sm' : 'text-[13px]'}`}>{text}</div>
      <div className="flex items-center justify-between gap-3 mt-3">
        <button
          onClick={onSkip}
          className="text-xs font-semibold text-zinc-400 hover:text-zinc-200 px-1 py-1.5"
        >
          Skip tour
        </button>
        {waitingForTap ? (
          <span className="text-[11px] font-semibold text-rose-300 inline-flex items-center gap-1">
            Tap the glowing spot ☝️
          </span>
        ) : (
          <button
            onClick={onGotIt}
            className="px-4 py-1.5 rounded-full text-xs font-bold text-white
                       bg-gradient-to-br from-rose-500 to-orange-500"
          >
            {cta ?? 'Got it →'}
          </button>
        )}
      </div>
    </motion.div>
  );
}
