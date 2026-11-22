/**
 * B-029: an event's dates in a few words for the sidebar, e.g. "16–18 Jan 2026",
 * "30 Jan – 2 Feb 2026", "30 Dec 2026 – 2 Jan 2027", or one day "16 Jan 2026".
 * Reads the date part only ('YYYY-MM-DD…'), so the day never shifts with the time zone.
 * '' when the event has no start date.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(value?: string | null): { y: number; m: number; d: number } | null {
  const hit = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return hit ? { y: +hit[1], m: +hit[2] - 1, d: +hit[3] } : null;
}

export function eventDateRange(start?: string | null, end?: string | null): string {
  const s = parts(start);
  if (!s) return '';
  const e = parts(end) || s;
  if (s.y === e.y && s.m === e.m && s.d === e.d) return `${s.d} ${MONTHS[s.m]} ${s.y}`;
  if (s.y === e.y && s.m === e.m) return `${s.d}–${e.d} ${MONTHS[s.m]} ${s.y}`;
  if (s.y === e.y) return `${s.d} ${MONTHS[s.m]} – ${e.d} ${MONTHS[e.m]} ${s.y}`;
  return `${s.d} ${MONTHS[s.m]} ${s.y} – ${e.d} ${MONTHS[e.m]} ${e.y}`;
}
