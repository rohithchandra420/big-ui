import { eventDateRange } from './event-dates';

describe('eventDateRange (B-029)', () => {
  it('writes the event dates in a few words', () => {
    expect(eventDateRange('2026-01-16T00:00:00.000Z', '2026-01-18T00:00:00.000Z')).toBe('16–18 Jan 2026');
    expect(eventDateRange('2026-01-30', '2026-02-02')).toBe('30 Jan – 2 Feb 2026');
    expect(eventDateRange('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 2 Jan 2027');
    expect(eventDateRange('2026-01-16', '2026-01-16')).toBe('16 Jan 2026');
    expect(eventDateRange('2026-01-16', null)).toBe('16 Jan 2026');
  });

  it('is empty with no start date', () => {
    expect(eventDateRange(undefined, '2026-01-18')).toBe('');
    expect(eventDateRange('', '')).toBe('');
  });
});
