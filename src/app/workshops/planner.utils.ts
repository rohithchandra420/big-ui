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

/** 'HH:mm' plus some minutes (minus when negative), kept within the day (00:00–23:59). */
export function addMinutes(hhmm: string, m: number): string {
  const [h, mm] = hhmm.split(':').map(Number);
  const t = Math.min(23 * 60 + 59, Math.max(0, h * 60 + mm + m));
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
}

/** Minutes between two 'HH:mm' times (b − a). */
export function minutesBetween(a: string, b: string): number {
  const toMin = (x: string) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
  return toMin(b) - toMin(a);
}

/**
 * Default times for a new session (user, 2026-11-04): registration opens 1 h
 * before the start, closes 30 min before, cut-off 15 min before.
 */
export function defaultSessionTimes(start: string): { regOpens: string; regCloses: string; cutoff: string } {
  return { regOpens: addMinutes(start, -60), regCloses: addMinutes(start, -30), cutoff: addMinutes(start, -15) };
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

// A session's timeline (2026-11-04) — same rules as big-api utils/workshopPhase.js:
//   registration opens → registration closes ≤ cut-off < start → end.
// No cut-off = 15 minutes before the start; no registration close = at the cut-off.
// The door follows the times unless set by hand: open from registration close to the end.
export const DEFAULT_CUTOFF_MINUTES = 15;

type Times = Pick<WorkshopSession, 'start' | 'end' | 'regOpensAt' | 'regClosesAt' | 'cutoffAt' | 'regManual'> & { doorManual?: boolean | null };

/** The cut-off in force: the one set, or 15 minutes before the start. */
export function effectiveCutoff(s: Pick<WorkshopSession, 'start' | 'cutoffAt'>): Date {
  return s.cutoffAt ? new Date(s.cutoffAt) : new Date(new Date(s.start).getTime() - DEFAULT_CUTOFF_MINUTES * 60000);
}

/** When registration closes by the times: the one set, or at the cut-off. */
export function effectiveRegCloses(s: Pick<WorkshopSession, 'start' | 'cutoffAt' | 'regClosesAt'>): Date {
  return s.regClosesAt ? new Date(s.regClosesAt) : effectiveCutoff(s);
}

/** Pre-registration right now: set by hand at the door, otherwise by its open / close times. */
export function regState(s: Times, now = new Date()): RegState {
  if (s.regManual === true) return 'open';
  if (s.regManual === false) return 'closed';
  if (s.regOpensAt && now < new Date(s.regOpensAt)) return 'soon';
  return now >= effectiveRegCloses(s) ? 'closed' : 'open';
}

/** The door right now: set by hand, otherwise open from registration close to the end. */
export function doorIsOpen(s: Times, now = new Date()): boolean {
  if (s.doorManual === true) return true;
  if (s.doorManual === false) return false;
  return now >= effectiveRegCloses(s) && now < new Date(s.end);
}

export type SessionPhase = 'cancelled' | 'before' | 'registration' | 'list' | 'all' | 'ended';

/**
 * Where a session is on its timeline: before registration, registration open,
 * door open for the list (registration closed → cut-off), open to everyone
 * (cut-off → end), ended. The door's own state is separate (doorIsOpen).
 */
export function sessionPhase(s: Times & Pick<WorkshopSession, 'status'>, now = new Date()): SessionPhase {
  if (s.status === 'cancelled') return 'cancelled';
  if (now >= new Date(s.end)) return 'ended';
  const reg = regState(s, now);
  if (reg === 'open') return 'registration';
  if (now >= effectiveCutoff(s)) return 'all';
  return reg === 'soon' ? 'before' : 'list';
}

/** A session's one status for the Venue Map: a short badge and a one-line text. */
export interface MapStatus {
  /** The CSS variant of the badge: reg = pulsing, closed = red. */
  kind: 'before' | 'reg' | 'list' | 'all' | 'closed' | 'ended' | 'cancelled';
  badge: string;
  /** The status alone, e.g. "Reg open · 12/30 · closes 10:45". */
  text: string;
  /** The title and the status: "Hand Drumming: Reg open · …". */
  line: string;
  /** From registration open to the end: the badge pulses. */
  live: boolean;
}

export function mapStatusOf(s: WorkshopSession, now = new Date()): MapStatus {
  const st = statusOf(s, now);
  const phase = sessionPhase(s, now);
  const live = phase === 'registration' || phase === 'list' || phase === 'all';
  return { ...st, live, line: `${s.workshop?.title || 'Session'}: ${st.text}` };
}

/** The wording (user, 2026-11-04): short, capitalised, one status per moment. */
function statusOf(s: WorkshopSession, now: Date): Omit<MapStatus, 'line' | 'live'> {
  const phase = sessionPhase(s, now);
  const c = s.counts || { pre: 0, wait: 0, walkin: 0, attended: 0 };
  const capacity = s.venue?.capacity || 0;
  const limit = s.preRegLimit || capacity;
  const t = (iso: string | Date) => localTime(new Date(iso));
  // Every state reads "State · numbers · time" (user, 2026-11-04).
  if (phase === 'cancelled') return { kind: 'cancelled', badge: '', text: 'Cancelled' };
  if (phase === 'ended') return { kind: 'ended', badge: '', text: `Ended · ${c.attended} attended · ended ${t(s.end)}` };
  // Entry closed by staff wins over the times (the session still runs; nobody else goes in).
  if (s.doorManual === false && phase !== 'before' && phase !== 'registration') {
    return { kind: 'closed', badge: 'Entry closed',
      text: `Entry closed · ${c.attended} inside${s.doorManualAt ? ' · since ' + t(s.doorManualAt) : ''}` };
  }
  switch (phase) {
    case 'before':
      return { kind: 'before', badge: s.regOpensAt ? 'Reg opens ' + t(s.regOpensAt) : 'Soon',
        text: s.regOpensAt ? `Reg opens at ${t(s.regOpensAt)} · ${c.pre}/${limit} · closes ${t(effectiveRegCloses(s))}`
          : `Starts at ${t(s.start)}` };
    case 'registration': {
      const closes = s.regManual === true ? '' : ` · closes ${t(effectiveRegCloses(s))}`;
      if (c.pre >= limit && c.wait) return { kind: 'reg', badge: `Waitlist ${c.wait}`, text: `Waitlist · ${c.wait} waiting${closes}` };
      return { kind: 'reg', badge: `${c.pre}/${limit}`, text: `Reg open · ${c.pre}/${limit}${closes}` };
    }
    case 'list':
      // Registration closed by hand early: entry still opens at its time.
      if (!doorIsOpen(s, now)) {
        return { kind: 'before', badge: 'Entry ' + t(effectiveRegCloses(s)),
          text: `Reg closed · ${c.pre}/${limit} · entry opens ${t(effectiveRegCloses(s))}` };
      }
      return { kind: 'list', badge: `${c.attended}/${c.pre} in`,
        text: `Admitting list · ${c.attended}/${c.pre} in · walk-ins from ${t(effectiveCutoff(s))}` };
    default: {
      // Cut-off → start: everyone can go in, the session hasn't started yet.
      if (now < new Date(s.start)) {
        return { kind: 'all', badge: `${c.attended}/${capacity} in`,
          text: `Admitting all · ${c.attended}/${capacity} in · starts ${t(s.start)}` };
      }
      const left = Math.max(0, capacity - c.attended);
      const places = s.showPlacesLeft === false ? '' : ` · ${left ? left + ' place' + (left === 1 ? '' : 's') + ' left' : 'full'}`;
      return { kind: 'all', badge: `${c.attended}/${capacity} in`, text: `Open · ${c.attended}/${capacity} in${places}` };
    }
  }
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
