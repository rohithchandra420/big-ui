import { WashFacility, WashState } from './wash.model';

// Same rule as big-api utils/washState.js — keep the two in step.
// Hand-set states win; never done = not started; then ok → due soon (last 30 min) → overdue.
export const HOUR = 60 * 60 * 1000;
export const DUE_SOON_MS = 30 * 60 * 1000;

type StateInput = Pick<WashFacility, 'kind' | 'status' | 'intervalHours' | 'lastDoneAt'>;

export function dueAtOf(f: StateInput): Date | null {
  return f.lastDoneAt ? new Date(new Date(f.lastDoneAt).getTime() + f.intervalHours * HOUR) : null;
}

export function stateOf(f: StateInput, now: Date = new Date()): WashState {
  if (f.status === 'out_of_order') return 'out_of_order';
  if (f.status === 'empty' && f.kind === 'water') return 'empty';
  const due = dueAtOf(f);
  if (!due) return 'not_started';
  const left = due.getTime() - now.getTime();
  if (left < 0) return 'overdue';
  if (left <= DUE_SOON_MS) return 'due_soon';
  return 'ok';
}

/** How much of the interval has gone, 0–100 (100 when overdue / set by hand / not started). */
export function usedPercent(f: StateInput, now: Date = new Date()): number {
  const s = stateOf(f, now);
  if (s === 'not_started') return 0;
  if (s === 'empty' || s === 'out_of_order' || s === 'overdue') return 100;
  const used = (now.getTime() - new Date(f.lastDoneAt as string).getTime()) / (f.intervalHours * HOUR);
  return Math.max(0, Math.min(100, Math.round(used * 100)));
}

/**
 * What a WASH QR sticker holds (WA2): the staff-app link …/wash?f=<facility id>&k=<code>.
 * Returns null for anything else (a wrist band, a ticket, another site's QR).
 */
export function parseWashQr(text: string | null | undefined): { id: string; token: string } | null {
  const m = String(text || '').match(/\/wash\?(?:[^#]*&)?f=([0-9a-f]{24})(?:&[^#]*)?/i);
  const k = String(text || '').match(/[?&]k=([0-9a-f]{8,64})(?:&|#|$)/i);
  return m && k ? { id: m[1].toLowerCase(), token: k[1] } : null;
}

/** Minutes as "45 min", "2 h", "2 h 15 min"; "—" for none. */
export function durationText(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** "40 min ago", "2 h 5 min ago". */
export function agoText(at: string | Date, now: Date = new Date()): string {
  const m = Math.max(0, Math.round((now.getTime() - new Date(at).getTime()) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min ago` : `${h} h ago`;
}

/** "14:30" in the device's time. */
export function clockText(at: string | Date | null): string {
  if (!at) return '';
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
