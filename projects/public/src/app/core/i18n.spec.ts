import { I18nService, TPipe } from './i18n';

describe('I18nService / t pipe', () => {
  const i18n = new I18nService();

  it('returns the English words', () => {
    expect(i18n.t('nav.home')).toBe('Home');
  });

  it('fills in {placeholders}, leaving unknown ones as they are', () => {
    expect(i18n.t('hero.day', { n: 2 })).toBe('Day 2');
    expect(i18n.t('brand.sub', {})).toBe('{event} · Festival live');
  });

  it('falls back to English for a language without the word', () => {
    i18n.lang = 'xx';
    expect(i18n.t('nav.map')).toBe('Map');
    i18n.lang = 'en';
  });

  it('has only English for now (so the language switch stays hidden)', () => {
    expect(i18n.languages).toEqual(['en']);
  });

  it('the pipe uses the service', () => {
    expect(new TPipe(i18n).transform('fresh.ago', { s: 12 })).toBe('Live · 12s ago');
  });
});
