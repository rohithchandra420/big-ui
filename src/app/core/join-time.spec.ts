import { inDayRange, joinIso, joinState, localDate, localDateTime } from './join-time';
import { canSetReported } from './reported-access';

// Joining Time (ui 1.65.0)
describe('join-time', () => {
  const now = new Date(2026, 10, 12, 13, 0);   // 12 Nov 2026, 13:00 local

  it('joinState: reported, late (Expected Join Time passed), expected, unknown', () => {
    expect(joinState(new Date(2026, 10, 12, 11, 0), new Date(2026, 10, 12, 12, 0), now)).toBe('reported');
    expect(joinState(new Date(2026, 10, 12, 11, 0), null, now)).toBe('late');
    expect(joinState(new Date(2026, 10, 13, 11, 0), null, now)).toBe('expected');
    expect(joinState(null, null, now)).toBe('unknown');
  });

  it('joinIso: a date alone means 11:00; a time is kept', () => {
    expect(new Date(joinIso('2026-11-12', '')).getHours()).toBe(11);
    const d = new Date(joinIso('2026-11-12', '14:20'));
    expect([d.getHours(), d.getMinutes()]).toEqual([14, 20]);
    expect(joinIso('', '10:00')).toBe('');
  });

  it('local date / datetime-local values', () => {
    expect(localDate(now)).toBe('2026-11-12');
    expect(localDateTime(now)).toBe('2026-11-12T13:00');
  });

  it('inDayRange: open ends, inclusive days, nothing given = no match when a range is set', () => {
    const v = new Date(2026, 10, 12, 23, 30).toISOString();
    expect(inDayRange(v, '', '')).toBeTrue();
    expect(inDayRange(v, '2026-11-12', '2026-11-12')).toBeTrue();
    expect(inDayRange(v, '2026-11-13', '')).toBeFalse();
    expect(inDayRange(v, '', '2026-11-11')).toBeFalse();
    expect(inDayRange(null, '2026-11-01', '')).toBeFalse();
    expect(inDayRange(null, '', '')).toBeTrue();
  });
});

// Mirror of big-api utils/reportedAccess.js
describe('canSetReported', () => {
  const tl = (...depts: { id: string; key: string }[]) => ({ role: 'TL', depts });
  const ops = { id: 'ops', key: 'general' };
  const pool = { id: 'pool', key: 'volunteer' };

  it('top roles: anyone, a top role included', () => {
    expect(canSetReported({ role: 'ADMIN', depts: [] }, 'DIR', '')).toBeTrue();
  });
  it('the Volunteer TL: any VOL or TL', () => {
    expect(canSetReported(tl(pool), 'VOL', 'ops')).toBeTrue();
    expect(canSetReported(tl(pool), 'TL', '')).toBeTrue();
    expect(canSetReported(tl(pool), 'ADMIN', '')).toBeFalse();
  });
  it('a TL: only people whose home department they lead', () => {
    expect(canSetReported(tl(ops), 'VOL', 'ops')).toBeTrue();
    expect(canSetReported(tl(ops), 'VOL', 'decor')).toBeFalse();
    expect(canSetReported(tl(ops), 'VOL', '')).toBeFalse();
  });
  it('nobody else', () => {
    expect(canSetReported({ role: 'VOL', depts: [pool] }, 'VOL', 'pool')).toBeFalse();
    expect(canSetReported(null, 'VOL', 'ops')).toBeFalse();
  });
});
