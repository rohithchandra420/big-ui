/**
 * Joining Time helpers (big-ui 1.65.0). Expected Join Time = `dateOfJoining`
 * (date + time); Reported Time = `reportedAt` (when they actually arrived).
 * Times are shown in the browser's time (the festival runs in India = IST).
 */
export type JoinState = 'reported' | 'late' | 'expected' | 'unknown';

/** A date alone means 11:00 that day (user, 2026-11-19). */
export const DEFAULT_JOIN_TIME = '11:00';

export function joinState(expectedAt: string | Date | null | undefined, reportedAt: string | Date | null | undefined, now = new Date()): JoinState {
  if (reportedAt) return 'reported';
  if (!expectedAt) return 'unknown';
  return new Date(expectedAt).getTime() <= now.getTime() ? 'late' : 'expected';
}

export const JOIN_STATE_LABEL: Record<JoinState, string> = {
  reported: 'Reported',
  late: 'Expected to join · not reported yet',
  expected: 'Expected to join',
  unknown: 'Not reported yet'
};

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" in local time. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "HH:mm" in local time. */
export function localTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "YYYY-MM-DDTHH:mm" (a datetime-local input's value) in local time. */
export function localDateTime(d: Date): string {
  return `${localDate(d)}T${localTime(d)}`;
}

/** A local date + time ("YYYY-MM-DD", "HH:mm"; empty time = 11:00) as an ISO string, or '' if invalid. */
export function joinIso(date: string, time: string): string {
  if (!date) return '';
  const d = new Date(`${date}T${time || DEFAULT_JOIN_TIME}`);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

/** Inclusive date-range test on a date-time ("YYYY-MM-DD" bounds, local days; '' = open). */
export function inDayRange(value: string | Date | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!value) return false;
  const day = localDate(new Date(value));
  return (!from || day >= from) && (!to || day <= to);
}
