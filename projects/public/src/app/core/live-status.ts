import { PublicLive, PublicMapArea, PublicMapPin, PublicWash } from './public-api.service';
import { I18nService, WordKey } from './i18n';
import { stateText, stateTone } from './sessions';
import { timeLabel } from './festival-time';

// Live status on the public map (user, 2026-11-20): Workshop areas (session
// state), Stage areas (who plays), the Medical Bay (open / closed), WASH
// (toilets cleaned / open / closed, water filled / empty) and the Box Office.
// One short badge on the map + a longer line for the popup.

/** good = green, warn = amber, bad = red, off = grey, info = blue. */
export type LiveTone = 'good' | 'warn' | 'bad' | 'off' | 'info';
export interface LiveBadge { text: string; tone: LiveTone; icon: string; detail: string; }

const WASH: Record<PublicWash, { word: WordKey; detail: WordKey; tone: LiveTone; icon: string }> = {
  cleaned: { word: 'map.cleaned', detail: 'map.cleanedText', tone: 'good', icon: 'auto_awesome' },
  open: { word: 'map.open', detail: 'map.openText', tone: 'warn', icon: 'wc' },
  closed: { word: 'map.closed', detail: 'map.outOfOrder', tone: 'bad', icon: 'block' },
  filled: { word: 'map.refilled', detail: 'map.refilled', tone: 'good', icon: 'water_drop' },
  empty: { word: 'map.noWater', detail: 'map.noWater', tone: 'bad', icon: 'format_color_reset' },
  cleaning: { word: 'map.beingCleaned', detail: 'map.beingCleanedText', tone: 'info', icon: 'cleaning_services' },
  refilling: { word: 'map.beingRefilled', detail: 'map.beingRefilledText', tone: 'info', icon: 'water_full' },
};

/** Short workshop words for the badge. */
function workshopWord(l: Extract<PublicLive, { what: 'workshop' }>): { word: WordKey; tone: LiveTone } {
  const tone: Record<string, LiveTone> = { open: 'good', reg: 'warn', wait: 'bad', walk: 'info', closed: 'off' };
  const t = tone[stateTone(l)];
  switch (l.state) {
    case 'open': case 'list': return { word: 'live.walkIn', tone: t };
    case 'reg': return { word: l.full ? 'live.waitlist' : 'live.regOpen', tone: t };
    case 'soon': return { word: 'live.regSoon', tone: t };
    case 'regclosed': return { word: 'live.regClosed', tone: t };
    case 'full': return { word: 'live.full', tone: t };
    case 'ended': return { word: 'live.ended', tone: 'off' };
    default: return { word: 'live.entryClosed', tone: 'off' };
  }
}

export function liveBadge(live: PublicLive, i18n: I18nService): LiveBadge {
  const at = (iso: string) => timeLabel(Date.parse(iso), i18n.lang);
  if (live.what === 'medical') {
    return live.open
      ? { text: i18n.t('live.medOpen'), tone: 'good', icon: 'local_hospital', detail: i18n.t('live.medOpenText') }
      : { text: i18n.t('live.medClosed'), tone: 'bad', icon: 'local_hospital', detail: i18n.t('live.medClosedText') };
  }
  const when = live.now ? i18n.t('live.nowOn') : i18n.t('live.nextAt', { time: at(live.start) });
  if (live.what === 'music') {
    const text = live.now ? `${i18n.t('live.playing')}: ${live.act}` : `${when} · ${live.act}`;
    return { text, tone: live.now ? 'good' : 'info', icon: 'music_note',
      detail: `${when}: ${live.act}${live.genre ? ' · ' + live.genre : ''} (${at(live.start)}–${at(live.end)})` };
  }
  const w = workshopWord(live);
  return { text: i18n.t(w.word), tone: w.tone, icon: 'palette',
    detail: `${when}: ${live.title} (${at(live.start)}–${at(live.end)}) · ${stateText(live, i18n)}` };
}

export function washBadge(wash: PublicWash, i18n: I18nService): LiveBadge {
  const w = WASH[wash];
  return { text: i18n.t(w.word), tone: w.tone, icon: w.icon, detail: i18n.t(w.detail) };
}

/** The badge for a pin or an area, or null when it has no live status. */
export function badgeOf(item: PublicMapPin | PublicMapArea, i18n: I18nService): LiveBadge | null {
  if ('type' in item && item.type === 'box_office') {
    return { text: i18n.t(item.open ? 'map.open' : 'map.closed'), tone: item.open ? 'good' : 'bad', icon: 'confirmation_number',
      detail: i18n.t(item.open ? 'map.open' : 'map.closed') + (item.note ? ' · ' + item.note : '') };
  }
  if ('live' in item && item.live) return liveBadge(item.live, i18n);
  if (item.wash) return washBadge(item.wash, i18n);
  return null;
}
