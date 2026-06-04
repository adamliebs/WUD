import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock } from 'lucide-react';

interface Props {
  /** "HH:MM" in 24-hour format — same shape as `<input type="time">` produces
   *  so this is a drop-in replacement for the legacy field. */
  value: string;
  onChange: (value: string) => void;
  /** Minute granularity. Defaults to 5; pass 1 for one-minute precision. */
  step?: 1 | 5 | 15 | 30;
}

/**
 * Two-column scroll-wheel time picker. Same scroll-snap pattern as
 * DateWheelPicker (the birthday DOB wheel) — hardware-accelerated, no
 * filter passes, no convoluted chip rows.
 *
 * UX:
 *   • Collapsed by default — renders only as a tappable pill showing the
 *     current time.
 *   • Tap to expand → an inline wheel slides down below the pill.
 *   • Tap outside or hit Done → collapses back to the pill.
 *
 * Why this rather than `<input type="time">`:
 *   1. iOS Safari triggers a native sheet that conflicts with the
 *      WebView's safe area and zooms unpredictably.
 *   2. Native sheet UI doesn't match the brand palette.
 *   3. Inconsistent behaviour across iOS / Android / desktop WebViews.
 */
export function TimePicker({ value, onChange, step = 5 }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { hour, minute } = parseHHMM(value);

  // Tap outside the picker collapses it. We attach the listener only while
  // open so we don't waste a global event during idle state.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-label="Pick a time"
        className={`w-full inline-flex items-center gap-2 px-4 py-3 rounded-2xl text-left
                    border transition
                    ${open
                      ? 'bg-rose-500/15 border-rose-400/40 text-white'
                      : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
      >
        <Clock size={15} className={open ? 'text-rose-200' : 'text-zinc-400'} />
        <span className="text-sm font-semibold tabular-nums">{formatHHMM(hour, minute)}</span>
        <span className="ml-auto text-[10px] uppercase tracking-widest font-bold text-zinc-400">
          {open ? 'Tap outside to close' : 'Tap to change'}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-2xl bg-white/5 border border-white/10 p-2">
              <DualWheel
                hour={hour}
                minute={minute}
                step={step}
                onHour={h => onChange(formatHHMM(h, snapMinute(minute, step)))}
                onMinute={m => onChange(formatHHMM(hour, m))}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── Scroll wheel ─────────────────────────── */

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5;
const PAD_ROWS = (VISIBLE_ROWS - 1) / 2;

function DualWheel({
  hour, minute, step, onHour, onMinute,
}: {
  hour: number;
  minute: number;
  step: 1 | 5 | 15 | 30;
  onHour: (h: number) => void;
  onMinute: (m: number) => void;
}) {
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.floor(60 / step) }, (_, i) => i * step);
  const minuteValue = snapMinute(minute, step);

  return (
    <div className="relative" style={{ height: ITEM_HEIGHT * VISIBLE_ROWS }}>
      <div className="grid grid-cols-2 gap-2 h-full">
        <Wheel
          items={hours.map(h => ({ value: h, label: pad2(h) }))}
          value={hour}
          onSelect={onHour}
          ariaLabel="Hour"
        />
        <Wheel
          items={minutes.map(m => ({ value: m, label: pad2(m) }))}
          value={minuteValue}
          onSelect={onMinute}
          ariaLabel="Minute"
        />
      </div>

      {/* Center selection band — same as DateWheelPicker so the two
          pickers read as part of one family. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-xl
                   bg-white/[0.06] border-y border-white/15"
        style={{ height: ITEM_HEIGHT }}
      />

      {/* Top + bottom fades so off-center rows recede. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-12
                   bg-gradient-to-b from-[#15121b] via-[#15121b]/85 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12
                   bg-gradient-to-t from-[#15121b] via-[#15121b]/85 to-transparent"
      />
    </div>
  );
}

interface WheelProps<T extends number> {
  items: { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
  ariaLabel: string;
}

function Wheel<T extends number>({ items, value, onSelect, ariaLabel }: WheelProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolling = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeValue, setActiveValue] = useState<T>(value);

  const findIndex = (v: T) => items.findIndex(it => it.value === v);

  // Sync scrollTop with `value` whenever it changes externally — but not
  // while the user is actively dragging, or we'd yank the wheel from
  // under their finger.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolling.current) return;
    const idx = findIndex(value);
    if (idx >= 0) {
      el.scrollTop = idx * ITEM_HEIGHT;
      setActiveValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolling.current = true;
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    const next = items[idx]?.value;
    if (next !== undefined && next !== activeValue) {
      setActiveValue(next);
    }
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      userScrolling.current = false;
      const finalIdx = Math.round(el.scrollTop / ITEM_HEIGHT);
      const finalValue = items[finalIdx]?.value;
      if (finalValue !== undefined && finalValue !== value) {
        onSelect(finalValue);
      }
    }, 90);
  };

  useEffect(() => () => {
    if (debounce.current) clearTimeout(debounce.current);
  }, []);

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      aria-label={ariaLabel}
      className="overflow-y-scroll snap-y snap-mandatory no-scrollbar text-center"
      style={{ scrollbarWidth: 'none' }}
    >
      <div style={{ height: ITEM_HEIGHT * PAD_ROWS }} />
      {items.map(item => {
        const isActive = item.value === activeValue;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              const el = scrollRef.current;
              if (!el) return;
              const idx = findIndex(item.value);
              if (idx >= 0) el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
            }}
            className={`block w-full snap-center transition-colors tabular-nums
                        ${isActive ? 'text-white font-bold' : 'text-zinc-500'}`}
            style={{ height: ITEM_HEIGHT, lineHeight: `${ITEM_HEIGHT}px`, fontSize: 17 }}
          >
            {item.label}
          </button>
        );
      })}
      <div style={{ height: ITEM_HEIGHT * PAD_ROWS }} />
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseHHMM(s: string): { hour: number; minute: number } {
  if (!s || !/^\d{1,2}:\d{1,2}$/.test(s)) return { hour: 0, minute: 0 };
  const [h, m] = s.split(':').map(n => Number(n));
  return {
    hour:   Math.min(23, Math.max(0, Number.isFinite(h) ? h : 0)),
    minute: Math.min(59, Math.max(0, Number.isFinite(m) ? m : 0)),
  };
}

function formatHHMM(hour: number, minute: number): string {
  return `${pad2(hour)}:${pad2(minute)}`;
}

/** Snap a free minute to the nearest step value so a value carried over
 *  from an old `<input type="time">` save lands on a valid wheel row. */
function snapMinute(minute: number, step: 1 | 5 | 15 | 30): number {
  const snapped = Math.round(minute / step) * step;
  return Math.min(55, Math.max(0, snapped));
}
