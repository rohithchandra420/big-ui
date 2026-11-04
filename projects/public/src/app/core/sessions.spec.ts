import { I18nService } from './i18n';
import { PublicSession } from './public-api.service';
import { categoriesOf, festivalDay, isLive, placesText, stateText, stateTone } from './sessions';

const s = (over: Partial<PublicSession> = {}): PublicSession => ({
  id: 's1', title: 'Clay', category: { name: 'Art', colour: '#ea580c', icon: 'palette' }, venue: 'Dome',
  start: '2026-12-11T05:30:00Z', end: '2026-12-11T06:30:00Z', facilitators: [], description: '', ageLimit: '',
  language: '', bringYourOwn: '', itemsRequired: '', state: 'open', stateAt: null, full: false, placesLeft: null, ...over
});

describe('session helpers', () => {
  const i18n = new I18nService();

  it('festival day is the India date', () => {
    expect(festivalDay('2026-12-10T18:29:00Z')).toBe('2026-12-10');
    expect(festivalDay('2026-12-10T18:31:00Z')).toBe('2026-12-11');
  });

  it('live = running now and not cancelled', () => {
    const now = Date.parse('2026-12-11T06:00:00Z');
    expect(isLive(s(), now)).toBeTrue();
    expect(isLive(s({ state: 'cancelled' }), now)).toBeFalse();
    expect(isLive(s(), Date.parse('2026-12-11T06:30:00Z'))).toBeFalse();
  });

  it('status words, with the time in India time', () => {
    expect(stateText(s({ state: 'soon', stateAt: '2026-12-11T04:30:00Z' }), i18n)).toBe('Registration opens 10:00');
    expect(stateText(s({ state: 'reg' }), i18n)).toBe('Registration open at the venue');
    expect(stateText(s({ state: 'reg', full: true }), i18n)).toBe('Full · waitlist at the venue');
    expect(stateText(s({ state: 'regclosed', stateAt: '2026-12-11T05:00:00Z' }), i18n)).toBe('Entry opens 10:30');
    expect(stateText(s({ state: 'list', stateAt: '2026-12-11T05:15:00Z' }), i18n)).toBe('Entry for registered · walk-ins from 10:45');
    expect(stateText(s({ state: 'open', stateAt: '2026-12-11T05:30:00Z' }), i18n)).toBe('Walk in · starts 11:00');
    expect(stateText(s({ state: 'open' }), i18n)).toBe('Walk in');
    expect(stateText(s({ state: 'full' }), i18n)).toBe('Full');
    expect(stateText(s({ state: 'closed' }), i18n)).toBe('Entry closed');
    expect(stateText(s({ state: 'ended' }), i18n)).toBe('Ended');
    expect(stateText(s({ state: 'cancelled' }), i18n)).toBe('Cancelled');
  });

  it('pill colours', () => {
    expect(stateTone(s({ state: 'reg' }))).toBe('reg');
    expect(stateTone(s({ state: 'reg', full: true }))).toBe('wait');
    expect(stateTone(s({ state: 'full' }))).toBe('wait');
    expect(stateTone(s({ state: 'soon' }))).toBe('walk');
    expect(stateTone(s({ state: 'ended' }))).toBe('closed');
  });

  it('places left only when given', () => {
    expect(placesText(s({ placesLeft: 12 }), i18n)).toBe('12 places left');
    expect(placesText(s({ placesLeft: 1 }), i18n)).toBe('1 place left');
    expect(placesText(s({ placesLeft: 0 }), i18n)).toBe('');
    expect(placesText(s({ placesLeft: null }), i18n)).toBe('');
  });

  it('categories present, by name, once each', () => {
    const list = [s(), s({ id: 's2', category: { name: 'Music', colour: '#7c3aed', icon: 'music_note' } }), s({ id: 's3' }), s({ id: 's4', category: null })];
    expect(categoriesOf(list).map(c => c.name)).toEqual(['Art', 'Music']);
  });
});
