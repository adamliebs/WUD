/**
 * Day + clock-time helpers shared by the post/edit sheets.
 *
 * Both sheets work in "dayOffset (0..6 days from today) + 24h time string"
 * coordinates, which is what the day-strip + native time input produce. Picking
 * an actual epoch happens at submit time via `computeStartsAt`.
 */

/** Next quarter-hour as "HH:MM" in 24h form. Used as the post sheet's default. */
export function nextQuarterTime(): string {
  const d = new Date();
  d.setMinutes(Math.ceil((d.getMinutes() + 1) / 15) * 15, 0, 0);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** A week of day pills starting at today. */
export function buildDayOptions(): { offset: number; label: string; weekday: string; day: number }[] {
  const out: { offset: number; label: string; weekday: string; day: number }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const weekday = d.toLocaleDateString([], { weekday: 'short' });
    const label =
      i === 0 ? 'Today' :
      i === 1 ? 'Tomorrow' :
      weekday;
    out.push({ offset: i, label, weekday, day: d.getDate() });
  }
  return out;
}

/** Convert (dayOffset, "HH:MM") into an epoch ms relative to "now". */
export function computeStartsAt(dayOffset: number, time: string): number {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/** Friendly "Today · 7:30 PM" / "Tomorrow · 11:00 AM" / "Friday Mar 12 · 8:00 PM". */
export function formatStartsAt(dayOffset: number, time: string): string {
  const ms = computeStartsAt(dayOffset, time);
  const d = new Date(ms);
  const dayPart =
    dayOffset === 0 ? 'Today' :
    dayOffset === 1 ? 'Tomorrow' :
    d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${dayPart} · ${timePart}`;
}

/** Decompose an epoch ms into (dayOffset relative to today, "HH:MM"). Used
 *  when seeding the edit sheet from an existing activity. dayOffset clamps to
 *  the visible week — past dates collapse to 0 since the picker can't show them. */
export function decomposeEpoch(ms: number): { dayOffset: number; time: string } {
  const d = new Date(ms);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const offset = Math.max(0, Math.round((day.getTime() - today.getTime()) / 86_400_000));
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return { dayOffset: offset, time };
}
