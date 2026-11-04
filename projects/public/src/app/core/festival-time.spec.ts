import { countdown, dayLabel, dayStart, timeLabel } from './festival-time';

describe('festival time (India time, whatever the phone says)', () => {
  it('a festival day starts at 00:00 India time', () => {
    expect(new Date(dayStart('2026-12-10')).toISOString()).toBe('2026-12-09T18:30:00.000Z');
  });

  it('labels a day with weekday, date and month', () => {
    expect(dayLabel('2026-12-10')).toMatch(/Thu.*10.*Dec/);
  });

  it('shows clock times in India time', () => {
    expect(timeLabel(Date.parse('2026-12-10T05:12:00Z'))).toBe('10:42');
  });

  it('counts down in days, hours and minutes, never below zero', () => {
    const now = Date.parse('2026-12-01T00:00:00Z');
    expect(countdown(now + ((2 * 24 + 3) * 60 + 4) * 60000, now)).toEqual({ days: 2, hours: 3, mins: 4 });
    expect(countdown(now - 1000, now)).toEqual({ days: 0, hours: 0, mins: 0 });
  });
});
