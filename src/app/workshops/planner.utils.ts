import { WorkshopSession } from './workshops.model';

// Planner helpers (Workshops epic, W4). All times are the browser's local time.

export interface PlannerDay { date: string; label: string; sub: string; }

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for a Date, in local time. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'HH:mm' for a Date, in local time. */
export function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'YYYY-MM-DDTHH:mm:ss' local, the form DayPilot uses. */
export function localIso(d: Date): string {
  return `${localDate(d)}T${localTime(d)}:00`;
}

/** A day ('YYYY-MM-DD') + 'HH:mm' as a real instant (ISO, UTC) for the server. */
export function toInstant(day: string, hhmm: string): string {
  return new Date(`${day}T${hhmm}:00`).toISOString();
}

/** The event's days, first to last (inclusive). Up to 14; none when the dates are missing. */
export function eventDays(startDate: string | null, endDate: string | null): PlannerDay[] {
  if (!startDate) return [];
  const first = new Date(startDate);
  const last = endDate ? new Date(endDate) : first;
  const days: PlannerDay[] = [];
  const d = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  for (let i = 0; d <= end && i < 14; i++, d.setDate(d.getDate() + 1)) {
    days.push({
      date: localDate(d),
      label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      sub: `Day ${i + 1}`
    });
  }
  return days;
}

export type RegState = 'open' | 'soon' | 'closed';

/** Pre-registration right now: set by hand at the door, otherwise by its open / close times. */
export function regState(s: WorkshopSession, now = new Date()): RegState {
  if (s.regManual === true) return 'open';
  if (s.regManual === false) return 'closed';
  if (s.regOpensAt && now < new Date(s.regOpensAt)) return 'soon';
  const closes = new Date(s.regClosesAt || s.start);
  return now >= closes ? 'closed' : 'open';
}

/** Other scheduled sessions in the same venue at overlapping times. */
export function overlapsOf(s: Pick<WorkshopSession, '_id' | 'start' | 'end'> & { venue: { _id: string } },
                           all: WorkshopSession[]): WorkshopSession[] {
  const a = new Date(s.start).getTime(), b = new Date(s.end).getTime();
  return all.filter(o => o._id !== s._id && o.status === 'scheduled' && o.venue._id === s.venue._id &&
    new Date(o.start).getTime() < b && a < new Date(o.end).getTime());
}

/** For DayPilot's html: escape text so names can't inject markup. */
export function esc(s: string): string {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
