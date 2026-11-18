import { VolBoard, Volunteer } from './volunteers.model';
import { askMessage, buildBoard, dayWord, money, moveMessage, needStatus, shiftDate, sortRows } from './volunteers.utils';

const vol = (id: string, name: string, department: string | null, marked = true): Volunteer => ({
  _id: id, name, avatarVersion: 0, role: 'VOL', department, unassigned: !department, phone: '900000' + id, gender: '', dateOfJoining: null,
  today: { morning: marked, afternoon: false, night: false }, marked, stay: 'none', band: false
});

const board = (): VolBoard => ({
  today: '2026-11-14', canAssign: true, pool: { _id: 'p', name: 'Volunteer' },
  departments: [
    { _id: 'd1', name: 'Decor', key: 'general', tls: [], needed: 0, canSetNeed: false },
    { _id: 'd2', name: 'WASH', key: 'wash', tls: ['Lead One'], needed: 3, canSetNeed: true },
    { _id: 'd3', name: 'Workshops', key: 'workshop', tls: [], needed: 1, canSetNeed: false }
  ],
  volunteers: [
    vol('1', 'Anil', null), vol('2', 'Bela', null, false),
    vol('3', 'Chand', 'd2'), vol('4', 'Dipa', 'd3'), vol('5', 'Esha', 'd3', false),
    vol('6', 'Firoz', 'gone')
  ]
});
const all = { search: '', stat: 'all' as const, notMarked: false };

describe('volunteers utils', () => {
  it('needStatus says short, met, extra or no number', () => {
    expect(needStatus(2, 0)).toEqual({ kind: 'none', text: 'No number given', pct: 0, short: 0 });
    expect(needStatus(1, 3)).toEqual({ kind: 'short', text: '2 short', pct: 33, short: 2 });
    expect(needStatus(3, 3)).toEqual({ kind: 'met', text: 'Met', pct: 100, short: 0 });
    expect(needStatus(5, 3)).toEqual({ kind: 'met', text: 'Met · 2 extra', pct: 100, short: 0 });
  });

  it('groups volunteers into the pool and the department cards, with the stats', () => {
    const v = buildBoard(board(), all);
    expect(v.pool.map(x => x.name)).toEqual(['Anil', 'Bela', 'Firoz']);   // an unknown department counts as unassigned
    expect(v.poolTotal).toBe(3);
    expect(v.lanes.map(l => [l.dept.name, l.have, l.need.text])).toEqual([
      ['Decor', 0, 'No number given'], ['WASH', 1, '2 short'], ['Workshops', 2, 'Met · 1 extra']
    ]);
    expect(v.lanes[1].icon).toBe('water_drop');
    expect(v.stats).toEqual({ all: 6, unassigned: 3, stillNeeded: 2, notMarked: 2 });
    expect(v.rows.map(r => r.v.name)).toEqual(['Anil', 'Bela', 'Chand', 'Dipa', 'Esha', 'Firoz']);
    expect(buildBoard(null, all).stats.all).toBe(0);
  });

  it('filters by search, not marked, unassigned and still needed — the counts stay whole', () => {
    const notMarked = buildBoard(board(), { ...all, notMarked: true });
    expect(notMarked.pool.map(x => x.name)).toEqual(['Bela']);
    expect(notMarked.lanes[2].shown.map(x => x.name)).toEqual(['Esha']);
    expect(notMarked.lanes[2].have).toBe(2);
    expect(notMarked.poolTotal).toBe(3);

    expect(buildBoard(board(), { ...all, search: 'dip' }).rows.map(r => r.v.name)).toEqual(['Dipa']);
    expect(buildBoard(board(), { ...all, search: '9000003' }).rows.map(r => r.v.name)).toEqual(['Chand']);
    expect(buildBoard(board(), { ...all, stat: 'unassigned' }).lanes).toEqual([]);
    expect(buildBoard(board(), { ...all, stat: 'short' }).lanes.map(l => l.dept.name)).toEqual(['WASH']);
  });

  it('writes money with Indian grouping', () => {
    expect(money(150000)).toBe('₹1,50,000');
    expect(money(0)).toBe('₹0');
    expect(money(undefined)).toBe('');
  });

  it('words the result of asking for locations', () => {
    expect(askMessage({ asked: 3, notSharing: 2, alreadyAsked: 1 })).toBe("Asked 3 · 2 don't share their location · 1 already asked");
    expect(askMessage({ asked: 0, notSharing: 1, alreadyAsked: 0 })).toBe("Nobody asked · 1 doesn't share their location");
  });

  it('words the move message', () => {
    expect(moveMessage(1, 'Anil', 'WASH')).toBe('Anil moved to WASH');
    expect(moveMessage(3, 'Anil', 'WASH')).toBe('3 volunteers moved to WASH');
    expect(moveMessage(2, 'Anil', null)).toBe('2 volunteers freed to Unassigned');
  });

  it('sortRows (B-003): sorts both ways, keeps missing phone / joining date at the bottom, ties A–Z', () => {
    const v = (name: string, phone: string, dateOfJoining: string | null): Volunteer => ({
      _id: name, name, avatarVersion: 0, role: 'VOL', department: null, unassigned: true, phone, gender: '', dateOfJoining,
      today: { morning: false, afternoon: false, night: false }, marked: false, stay: 'none', band: false
    });
    const rows = [
      { v: v('Dara', '', '2026-11-12T00:00:00.000Z'), deptName: '' },
      { v: v('Esha', '+919000000002', null), deptName: 'WASH' },
      { v: v('Faiz', '+919000000001', '2026-11-10T00:00:00.000Z'), deptName: 'Decor' }
    ];
    const names = (r: typeof rows) => r.map(x => x.v.name);
    expect(names(sortRows(rows, 'phone', 'asc'))).toEqual(['Faiz', 'Esha', 'Dara']);
    expect(names(sortRows(rows, 'phone', 'desc'))).toEqual(['Esha', 'Faiz', 'Dara']);
    expect(names(sortRows(rows, 'joined', 'asc'))).toEqual(['Faiz', 'Dara', 'Esha']);
    expect(names(sortRows(rows, 'joined', 'desc'))).toEqual(['Dara', 'Faiz', 'Esha']);
    expect(names(sortRows(rows, 'dept', 'asc'))).toEqual(['Faiz', 'Dara', 'Esha']);   // Decor, Unassigned, WASH
    expect(names(sortRows(rows, 'today', 'asc'))).toEqual(['Dara', 'Esha', 'Faiz']);  // all equal: A–Z
    expect(names(rows)).toEqual(['Dara', 'Esha', 'Faiz']);                           // input left as it was
  });

  it('sortRows: gender with blanks last; dayWord and shiftDate', () => {
    const g = (name: string, gender: string) => ({ v: { ...vol(name, name, null), gender }, deptName: '' });
    const rows = [g('Gita', ''), g('Hari', 'Male'), g('Ila', 'Female')];
    expect(sortRows(rows, 'gender', 'asc').map(r => r.v.name)).toEqual(['Ila', 'Hari', 'Gita']);
    expect(sortRows(rows, 'gender', 'desc').map(r => r.v.name)).toEqual(['Hari', 'Ila', 'Gita']);
    expect(dayWord('2026-11-18', '2026-11-18')).toBe('Today');
    expect(dayWord('2026-11-16', '2026-11-18')).toBe('Mon 16 Nov');
    expect(shiftDate('2026-11-30', 1)).toBe('2026-12-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
});
