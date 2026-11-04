// Festival days are calendar dates in India time ('YYYY-MM-DD', no daylight
// saving), whatever time zone the visitor's phone is set to.
const TZ = 'Asia/Kolkata';

/** The moment a festival day starts (00:00 India time). */
export function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00+05:30`);
}

/** "Thu, 10 Dec" for a festival day. */
export function dayLabel(day: string, lang = 'en'): string {
  return new Date(`${day}T12:00:00+05:30`).toLocaleDateString(lang === 'en' ? 'en-IN' : lang,
    { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
}

/** "10:42" India time. */
export function timeLabel(ms: number, lang = 'en'): string {
  return new Date(ms).toLocaleTimeString(lang === 'en' ? 'en-IN' : lang,
    { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TZ });
}

/** Days / hours / minutes left until `target` (never negative). */
export function countdown(target: number, now: number): { days: number; hours: number; mins: number } {
  const left = Math.max(0, Math.floor((target - now) / 60000));
  return { days: Math.floor(left / 1440), hours: Math.floor(left / 60) % 24, mins: left % 60 };
}
