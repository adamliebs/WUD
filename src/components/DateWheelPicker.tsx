import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * Three-column wheel picker for a date of birth — Month / Day / Year. Built
 * on native CSS scroll-snap so each wheel is hardware-accelerated and never
 * stutters, even on the year wheel (~80 items).
 *
 * Why we don't use `<input type="date">`:
 *   1. iOS Safari triggers a native sheet that fights the WebView's safe
 *      area and zooms unpredictably (the "zoom-in glitch" the user reported).
 *   2. The native UI doesn't match the rest of the app's visual language.
 *   3. Validating "old enough" is awkward when the OS picker accepts dates
 *      we never want shown.
 *
 * Picker shape:
 *   • Items are 44 px tall (matches Apple's HIG touch target).
 *   • Padding above and below lets the first/last items center.
 *   • A pill in the middle marks the selected row.
 *   • Gradient fades at the top/bottom soften the off-axis rows.
 *   • Scroll-end detection is debounced so we fire onChange once per snap.
 */

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;          // odd so there's a true center
const PAD_ROWS = (VISIBLE_ROWS - 1) / 2;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Props {
  /** ISO YYYY-MM-DD or null/empty. */
  value: string;
  onChange: (next: string) => void;
  /** Minimum age in years — sets the most recent year shown. */
  minAge: number;
  /** Maximum age in years — sets the oldest year shown. */
  maxAge: number;
}

interface YMD { year: number; month: number; day: number }

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function parseISO(s: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

function formatISO(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function daysIn(year: number, month: number): number {
  // new Date(year, month, 0) → last day of the previous month, so passing
  // month directly gives the day count of `month`.
  return new Date(year, month, 0).getDate();
}

export function DateWheelPicker({ value, onChange, minAge, maxAge }: Props) {
  const today = useMemo(() => new Date(), []);
  const maxYear = today.getFullYear() - minAge;
  const minYear = today.getFullYear() - maxAge;

  // Default to "25 years ago, Jun 15" if no value was provided. Sane middle
  // ground for a DOB picker so the wheels don't snap to extremes on first open.
  const defaultYMD: YMD = useMemo(() => ({
    year: Math.min(maxYear, Math.max(minYear, maxYear - 12)),
    month: 6,
    day: 15,
  }), [maxYear, minYear]);

  const parsed = parseISO(value) ?? defaultYMD;

  const years = useMemo(
    () => Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i),
    [maxYear, minYear],
  );
  const dayCount = daysIn(parsed.year, parsed.month);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => i + 1),
    [dayCount],
  );

  // Setting any field clamps the day to the month's range — picking Feb when
  // day=30 was selected snaps the day to 28 (or 29 in leap years) so the
  // emitted value is always a real date.
  const set = (next: Partial<YMD>) => {
    const year  = next.year  ?? parsed.year;
    const month = next.month ?? parsed.month;
    const max = daysIn(year, month);
    const day = Math.min(next.day ?? parsed.day, max);
    onChange(formatISO(year, month, day));
  };

  return (
    <div className="relative" style={{ height: ITEM_HEIGHT * VISIBLE_ROWS }}>
      <div className="grid grid-cols-[1.4fr_1fr_1.2fr] h-full">
        <Wheel
          items={MONTHS.map((label, i) => ({ value: i + 1, label }))}
          value={parsed.month}
          onSelect={m => set({ month: m })}
        />
        <Wheel
          items={days.map(d => ({ value: d, label: String(d) }))}
          value={parsed.day}
          onSelect={d => set({ day: d })}
        />
        <Wheel
          items={years.map(y => ({ value: y, label: String(y) }))}
          value={parsed.year}
          onSelect={y => set({ year: y })}
        />
      </div>

      {/* Center selection band */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-2xl
                   bg-white/[0.06] border-y border-white/15"
        style={{ height: ITEM_HEIGHT }}
      />

      {/* Top + bottom gradient fades — soften the off-center rows so the
          selected one pops. Inside the wheels would need per-column masking;
          a single overlay across the whole picker reads cleaner. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16
                   bg-gradient-to-b from-[#07060b] via-[#07060b]/85 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16
                   bg-gradient-to-t from-[#07060b] via-[#07060b]/85 to-transparent"
      />
    </div>
  );
}

/* ─────────────────────────── Single wheel ─────────────────────────── */

interface WheelProps<T extends number> {
  items: { value: T; label: string }[];
  value: T;
  onSelect: (v: T) => void;
}

function Wheel<T extends number>({ items, value, onSelect }: WheelProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Track whether the user is mid-scroll so we don't fight their finger with
  // imperative scrollTop writes when the parent updates `value`.
  const userScrolling = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeValue, setActiveValue] = useState<T>(value);

  const findIndex = (v: T) => items.findIndex(it => it.value === v);

  // Sync scroll position with `value` whenever it changes from outside (e.g.
  // when month changes and day clamps). Skip while the user is actively
  // dragging — that would yank the scroll out from under them.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || userScrolling.current) return;
    const idx = findIndex(value);
    if (idx >= 0) {
      el.scrollTop = idx * ITEM_HEIGHT;
      setActiveValue(value);
    }
    // findIndex inlined; deps are intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, items.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    userScrolling.current = true;
    // Update the visual "active" row immediately for live feedback as the
    // user drags, without firing onSelect (which would round-trip through
    // parent state).
    const idx = Math.round(el.scrollTop / ITEM_HEIGHT);
    const next = items[idx]?.value;
    if (next !== undefined && next !== activeValue) {
      setActiveValue(next);
    }

    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      userScrolling.current = false;
      // Snap-resolve: read the final scrollTop and commit upward.
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
              // Tap a row to snap to it — scroll to its position and let
              // onScroll's debounce commit.
              const el = scrollRef.current;
              if (!el) return;
              const idx = findIndex(item.value);
              if (idx >= 0) el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: 'smooth' });
            }}
            className={`block w-full snap-center transition-colors
                        ${isActive ? 'text-white font-bold' : 'text-zinc-500'}`}
            style={{ height: ITEM_HEIGHT, lineHeight: `${ITEM_HEIGHT}px`, fontSize: 18 }}
          >
            {item.label}
          </button>
        );
      })}
      <div style={{ height: ITEM_HEIGHT * PAD_ROWS }} />
    </div>
  );
}
