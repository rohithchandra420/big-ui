import {
  addMinutes, defaultSessionTimes, minutesBetween, doorIsOpen, effectiveCutoff, effectiveRegCloses, esc, eventDays, localDate, localIso, mapStatusOf, overlapsOf, regState,
  sessionPhase, toInstant
} from './planner.utils';
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
    // No close time and no cut-off: closes at the cut-off, 15 minutes before the start.
    expect(regState(session('s2', 'v1', '10:00', '11:00'), new Date(at('09:44')))).toBe('open');
    expect(regState(session('s2', 'v1', '10:00', '11:00'), new Date(at('09:45')))).toBe('closed');
  });

  it('the cut-off and registration close in force: the ones set, or the defaults', () => {
    const plain = session('s1', 'v1', '10:00', '11:00');
    expect(localIso(effectiveCutoff(plain))).toBe('2027-01-15T09:45:00');
    expect(localIso(effectiveRegCloses(plain))).toBe('2027-01-15T09:45:00');
    const set = session('s1', 'v1', '10:00', '11:00', { cutoffAt: at('09:50'), regClosesAt: at('09:30') });
    expect(localIso(effectiveCutoff(set))).toBe('2027-01-15T09:50:00');
    expect(localIso(effectiveRegCloses(set))).toBe('2027-01-15T09:30:00');
  });

  it('the door: shut until registration closes, open to the end; staff override both ways', () => {
    const s = session('s1', 'v1', '10:00', '11:00', { regClosesAt: at('09:30') });
    expect(doorIsOpen(s, new Date(at('09:29')))).toBeFalse();
    expect(doorIsOpen(s, new Date(at('09:30')))).toBeTrue();
    expect(doorIsOpen(s, new Date(at('11:00')))).toBeFalse();
    expect(doorIsOpen({ ...s, doorManual: false }, new Date(at('10:30')))).toBeFalse();
    expect(doorIsOpen({ ...s, doorManual: true }, new Date(at('09:00')))).toBeTrue();
  });

  it('the phases: before → registration → door for the list → open to all → ended', () => {
    const s = session('s1', 'v1', '10:00', '11:00', { regOpensAt: at('08:00'), regClosesAt: at('09:30'), cutoffAt: at('09:50') });
    const phase = (t: string) => sessionPhase(s, new Date(at(t)));
    expect(phase('07:00')).toBe('before');
    expect(phase('08:30')).toBe('registration');
    expect(phase('09:35')).toBe('list');
    expect(phase('09:55')).toBe('all');
    expect(phase('10:30')).toBe('all');
    expect(phase('11:00')).toBe('ended');
    expect(sessionPhase({ ...s, status: 'cancelled' }, new Date(at('09:00')))).toBe('cancelled');
  });

  it('one status for the map in each phase', () => {
    const s = session('s1', 'v1', '10:00', '11:00', {
      regOpensAt: at('08:00'), regClosesAt: at('09:30'), cutoffAt: at('09:50'), preRegLimit: 10,
      counts: { pre: 6, wait: 0, walkin: 0, attended: 4 }
    });
    const st = (t: string, extra: Partial<WorkshopSession> = {}) => mapStatusOf({ ...s, ...extra }, new Date(at(t)));
    expect(st('07:00')).toEqual(jasmine.objectContaining({ kind: 'before', badge: 'Reg opens 08:00', text: 'Reg opens at 08:00 · 6/10 · closes 09:30', live: false }));
    expect(st('08:30')).toEqual(jasmine.objectContaining({ kind: 'reg', badge: '6/10', text: 'Reg open · 6/10 · closes 09:30', live: true }));
    expect(st('08:30', { counts: { pre: 10, wait: 4, walkin: 0, attended: 0 } }))
      .toEqual(jasmine.objectContaining({ kind: 'reg', badge: 'Waitlist 4', text: 'Waitlist · 4 waiting · closes 09:30' }));
    expect(st('09:35')).toEqual(jasmine.objectContaining({ kind: 'list', badge: '4/6 in', text: 'Admitting list · 4/6 in · walk-ins from 09:50', live: true }));
    // Cut-off → start: no "open" yet, just when it starts.
    expect(st('09:55')).toEqual(jasmine.objectContaining({ kind: 'all', badge: '4/30 in', text: 'Admitting all · 4/30 in · starts 10:00', live: true }));
    expect(st('10:15')).toEqual(jasmine.objectContaining({ kind: 'all', badge: '4/30 in', text: 'Open · 4/30 in · 26 places left' }));
    expect(st('10:15', { showPlacesLeft: false }).text).toBe('Open · 4/30 in');
    expect(st('10:15', { doorManual: false, doorManualAt: at('10:05') }))
      .toEqual(jasmine.objectContaining({ kind: 'closed', badge: 'Entry closed', line: 'Drums: Entry closed · 4 inside · since 10:05', live: true }));
    expect(st('11:30')).toEqual(jasmine.objectContaining({ text: 'Ended · 4 attended · ended 11:00', live: false }));
  });

  it('time arithmetic and the default times of a new session', () => {
    expect(addMinutes('10:00', -75)).toBe('08:45');
    expect(addMinutes('00:10', -30)).toBe('00:00');
    expect(addMinutes('23:30', 60)).toBe('23:59');
    expect(minutesBetween('10:00', '11:15')).toBe(75);
    expect(defaultSessionTimes('14:00')).toEqual({ regOpens: '13:00', regCloses: '13:30', cutoff: '13:45' });
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
