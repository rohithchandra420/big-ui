import { PublicEvent, PublicMusic } from './public-api.service';
import { festivalDay } from './sessions';

// Helpers for showing music slots on the public page (Music epic). Music is
// open to everyone: no registration, so no status pill — just "Playing now".

/** On stage right now. */
export function isPlaying(m: PublicMusic, now: number): boolean {
  return Date.parse(m.start) <= now && now < Date.parse(m.end);
}

const byStart = (a: PublicMusic, b: PublicMusic) => Date.parse(a.start) - Date.parse(b.start);

/**
 * Home's "On stage" list: during the festival, what is playing now and the
 * rest of today; before it, the first day as a preview; after it, nothing.
 */
export function musicForHome(music: PublicMusic[], ev: PublicEvent, now: number): PublicMusic[] {
  if (ev.phase === 'after') return [];
  if (ev.phase === 'before') return music.filter(m => festivalDay(m.start) === ev.days[0]).sort(byStart);
  return music.filter(m => isPlaying(m, now) || (festivalDay(m.start) === ev.today && Date.parse(m.start) > now)).sort(byStart);
}

/** The whole festival day's music, in start order. */
export function musicOfDay(music: PublicMusic[], day: string): PublicMusic[] {
  return music.filter(m => festivalDay(m.start) === day).sort(byStart);
}
