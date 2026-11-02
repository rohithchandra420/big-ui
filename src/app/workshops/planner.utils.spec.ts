import { esc, eventDays, localDate, localIso, overlapsOf, regState, toInstant } from './planner.utils';
import { WorkshopSession } from './workshops.model';

const at = (hhmm: string, day = '2027-01-15') => toInstant(day, hhmm);
const session = (id: string, venue: string, start: string, end: string, extra: Partial<WorkshopSession> = {}): WorkshopSession => ({
  _id: id, event: 'e1', workshop: { _id: 'w1', title: 'Drums', category: null, facilitators: [] },
  venue: { _id: venue, name: venue, capacity: 30 }, start: at(start), end: at(end),
  regOpensAt: null, regClosesAt: null, regManual: null, cutoffAt: null, preRegLimit: null,
  facilitatorsOverride: [], status: 'scheduled', ...extra
});

describe('planner utils', () => {
  it('lists the event days first to last, in local time', () => {
    const days = eventDays(new Date(2027, 0, 15).toISOString(), new Date(2027, 0, 17).toISOString());
    expect(days.map(d => d.date)).toEqual(['2027-01-15', '2027-01-16', '2027-01-17']);
    expect(days[0].sub).toBe('Day 1');
    expect(eventDays(null, null)).toEqual([]);
  });

  it('turns a day + time into an instant and back', () => {
    const iso = toInstant('2027-01-15', '09:30');
    expect(localIso(new Date(iso))).toBe('2027-01-15T09:30:00');
    expect(localDate(new Date(iso))).toBe('2027-01-15');
  });

  it('registration: set by hand wins; otherwise the times decide', () => {
    const s = session('s1', 'v1', '10:00', '11:00', { regOpensAt: at('08:00'), regClosesAt: at('10:00') });
    expect(regState(s, new Date(at('07:00')))).toBe('soon');
    expect(regState(s, new Date(at('09:00')))).toBe('open');
    expect(regState(s, new Date(at('10:00')))).toBe('closed');
    expect(regState({ ...s, regManual: true }, new Date(at('10:30')))).toBe('open');
    expect(regState({ ...s, regManual: false }, new Date(at('09:00')))).toBe('closed');
    // No close time: closes at the start.
    expect(regState(session('s2', 'v1', '10:00', '11:00'), new Date(at('10:00')))).toBe('closed');
  });

  it('finds overlaps in the same venue only, ignoring cancelled ones and touching edges', () => {
    const all = [
      session('a', 'v1', '10:00', '11:00'),
      session('b', 'v1', '10:30', '12:00'),
      session('c', 'v2', '10:30', '12:00'),
      session('d', 'v1', '11:00', '12:00'),
      session('e', 'v1', '10:15', '10:45', { status: 'cancelled' })
    ];
    expect(overlapsOf(all[0], all).map(s => s._id)).toEqual(['b']);
  });

  it('escapes markup', () => {
    expect(esc('<b>"Tom & Jerry\'s"</b>')).toBe('&lt;b&gt;&quot;Tom &amp; Jerry&#39;s&quot;&lt;/b&gt;');
  });
});
