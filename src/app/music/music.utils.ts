import { MusicSlot } from './music.model';

// Music's own date helpers (MUSIC_CONTEXT.md: Music shares no code with Workshops).

export interface MusicDay { date: string; label: string; sub: string; }

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for a Date, in local time. */
export function dayOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'HH:mm' for a Date, in local time. */
export function hhmmOf(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'YYYY-MM-DDTHH:mm' local — the value of <app-date-time>. */
export function localValue(iso: string | Date | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${dayOf(d)}T${hhmmOf(d)}`;
}

/** 'YYYY-MM-DDTHH:mm:ss' local, the form DayPilot uses. */
export function dpValue(iso: string | Date): string {
  return `${localValue(iso)}:00`;
}

/** An <app-date-time> value (local) as an instant for the server; null when empty. */
export function toIso(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

/** Shift an ISO instant by some milliseconds; null stays null. */
export function shift(iso: string | null, ms: number): string | null {
  return iso ? new Date(new Date(iso).getTime() + ms).toISOString() : null;
}

/** The event's days (at most 14), labelled "Fri 5 Dec" / "Day 1". */
export function musicDays(startDate?: string | null, endDate?: string | null): MusicDay[] {
  if (!startDate) return [];
  const first = new Date(startDate);
  const last = endDate ? new Date(endDate) : first;
  const d = new Date(first.getFullYear(), first.getMonth(), first.getDate());
  const end = new Date(last.getFullYear(), last.getMonth(), last.getDate());
  const out: MusicDay[] = [];
  for (let i = 0; d <= end && i < 14; i++, d.setDate(d.getDate() + 1)) {
    out.push({ date: dayOf(d), label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), sub: `Day ${i + 1}` });
  }
  return out;
}

/** A time range's part on one day ('YYYY-MM-DD', local): clipped to that day's midnights. */
export interface DayPiece {
  /** Local 'YYYY-MM-DDTHH:mm:ss' (DayPilot form). */
  start: string;
  end: string;
  /** Began the day before (clipped at this day's 00:00). */
  fromBefore: boolean;
  /** Goes on past midnight into the next day. */
  intoNext: boolean;
}

/** The part of [start, end) on `day`, or null when it doesn't touch that day. A slot past midnight shows on both days. */
export function pieceOn(startIso: string, endIso: string, day: string): DayPiece | null {
  const dayStart = new Date(`${day}T00:00:00`);
  const next = new Date(dayStart); next.setDate(next.getDate() + 1);
  const s = new Date(startIso), e = new Date(endIso);
  if (!(s < next && e > dayStart)) return null;
  const fromBefore = s < dayStart, intoNext = e > next;
  return {
    start: dpValue(fromBefore ? dayStart : s),
    // DayPilot's day ends at 24:00, written as the next day's 00:00.
    end: intoNext ? `${dayOf(next)}T00:00:00` : dpValue(e),
    fromBefore, intoNext
  };
}

/**
 * Where "now" falls in a calendar cell (local 'YYYY-MM-DDTHH:mm:ss' start / end):
 * a percentage from the cell's top, or null when now isn't in it.
 */
export function nowInCell(cellStart: string, cellEnd: string, now = new Date()): number | null {
  const a = new Date(cellStart).getTime(), b = new Date(cellEnd).getTime(), n = now.getTime();
  if (n < a || n >= b) return null;
  return Math.round((n - a) / (b - a) * 1000) / 10;
}

/** When the stage is taken by a slot: from its sound check (if any) to its end. */
const busyFrom = (s: Pick<MusicSlot, 'start' | 'soundCheckStart'>) => new Date(s.soundCheckStart || s.start).getTime();

/**
 * The slots `s` clashes with — same rule as the server: the same stage at an
 * overlapping time (sound checks count), or the same act playing twice at once.
 */
export function clashesOf(s: Omit<MusicSlot, '_id'> & { _id?: string }, all: MusicSlot[]): MusicSlot[] {
  const start = new Date(s.start).getTime(), end = new Date(s.end).getTime();
  return all.filter(o => {
    if (o._id === s._id) return false;
    const oStart = new Date(o.start).getTime(), oEnd = new Date(o.end).getTime();
    const sameStage = o.stage === s.stage && busyFrom(o) < end && oEnd > busyFrom(s);
    const sameAct = o.act === s.act && oStart < end && oEnd > start;
    return sameStage || sameAct;
  });
}

export function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
