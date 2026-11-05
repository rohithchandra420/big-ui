import { PublicNews } from './public-api.service';
import { I18nService, WordKey } from './i18n';
import { timeLabel } from './festival-time';

// News helpers for the public page (PH3).

const HOUR = 3600000;
/** The ticker shows posts of the last 24 hours (user, 2026-11-05)… */
export const TICKER_WINDOW_MS = 24 * HOUR;
/** …with Urgent ones on top for their first 6 hours. */
export const URGENT_TOP_MS = 6 * HOUR;

export const NEWS_STYLE: Record<PublicNews['type'], { icon: string; colour: string; word: WordKey }> = {
  general: { icon: 'campaign', colour: '#2f6b52', word: 'news.general' },
  urgent: { icon: 'warning', colour: '#d92d20', word: 'news.urgent' },
  schedule: { icon: 'event_repeat', colour: '#8a5cd1', word: 'news.schedule' },
  weather: { icon: 'rainy', colour: '#3b8fd6', word: 'news.weather' },
};

/** Ticker posts: the last 24 hours, newest first, recent Urgent ones on top. */
export function tickerNews(news: PublicNews[], now: number): PublicNews[] {
  const recent = news.filter(n => now - Date.parse(n.at) < TICKER_WINDOW_MS);
  const top = recent.filter(n => n.type === 'urgent' && now - Date.parse(n.at) < URGENT_TOP_MS);
  return [...top, ...recent.filter(n => !top.includes(n))];
}

/** "just now", "12 min ago", "3 h ago", else the day and time. */
export function agoText(at: string, now: number, i18n: I18nService): string {
  const mins = Math.floor((now - Date.parse(at)) / 60000);
  if (mins < 1) return i18n.t('ago.now');
  if (mins < 60) return i18n.t('ago.min', { n: mins });
  if (mins < 24 * 60) return i18n.t('ago.hour', { n: Math.floor(mins / 60) });
  const d = new Date(at).toLocaleDateString(i18n.lang === 'en' ? 'en-IN' : i18n.lang,
    { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  return `${d}, ${timeLabel(Date.parse(at), i18n.lang)}`;
}
