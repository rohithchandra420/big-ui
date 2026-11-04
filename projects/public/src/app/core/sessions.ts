import { PublicSession } from './public-api.service';
import { I18nService } from './i18n';
import { timeLabel } from './festival-time';

// Helpers for showing workshop sessions on the public page (PH2).

const IST_MS = 330 * 60000;

/** The festival day ('YYYY-MM-DD', India time) a moment falls on. */
export function festivalDay(iso: string | number): string {
  return new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 10);
}

/** Running right now (and not cancelled). */
export function isLive(s: PublicSession, now: number): boolean {
  return s.state !== 'cancelled' && Date.parse(s.start) <= now && now < Date.parse(s.end);
}

export function isOver(s: PublicSession, now: number): boolean {
  return now >= Date.parse(s.end);
}

/** The pill's colour: open (green), reg (amber), wait (red), closed (grey), walk (blue). */
export function stateTone(s: PublicSession): 'open' | 'reg' | 'wait' | 'closed' | 'walk' {
  switch (s.state) {
    case 'open': return 'open';
    case 'list': return 'open';
    case 'reg': return s.full ? 'wait' : 'reg';
    case 'soon': case 'regclosed': return 'walk';
    case 'full': return 'wait';
    default: return 'closed';
  }
}

/** Registration open → the dot pulses. */
export function statePulse(s: PublicSession): boolean {
  return s.state === 'reg' || s.state === 'list' || s.state === 'open';
}

/** The status in words, e.g. "Entry opens 10:30". */
export function stateText(s: PublicSession, i18n: I18nService): string {
  const time = s.stateAt ? timeLabel(Date.parse(s.stateAt), i18n.lang) : '';
  switch (s.state) {
    case 'soon': return i18n.t('st.soon', { time });
    case 'reg': return i18n.t(s.full ? 'st.regFull' : 'st.reg');
    case 'regclosed': return i18n.t('st.regclosed', { time });
    case 'list': return i18n.t('st.list', { time });
    case 'open': return s.stateAt ? i18n.t('st.openStarts', { time }) : i18n.t('st.open');
    case 'full': return i18n.t('st.full');
    case 'closed': return i18n.t('st.closed');
    case 'ended': return i18n.t('st.ended');
    default: return i18n.t('st.cancelled');
  }
}

/** "12 places left" / "1 place left" / '' when not shown. */
export function placesText(s: PublicSession, i18n: I18nService): string {
  if (s.placesLeft == null || s.placesLeft <= 0) return '';
  return s.placesLeft === 1 ? i18n.t('places.one') : i18n.t('places.left', { n: s.placesLeft });
}

export interface CategoryChip { key: string; name: string; colour: string; icon: string; }

/** The categories present in a list of sessions, by name. */
export function categoriesOf(sessions: PublicSession[]): CategoryChip[] {
  const seen = new Map<string, CategoryChip>();
  for (const s of sessions) {
    if (s.category && !seen.has(s.category.name)) {
      seen.set(s.category.name, { key: s.category.name, ...s.category });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
