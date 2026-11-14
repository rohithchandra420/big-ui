import { VolBoard, Volunteer } from './volunteers.model';
import { buildBoard, moveMessage, needStatus } from './volunteers.utils';

const vol = (id: string, name: string, department: string | null, marked = true): Volunteer => ({
  _id: id, name, avatarVersion: 0, department, unassigned: !department, phone: '900000' + id, dateOfJoining: null,
  today: { morning: marked, afternoon: false, night: false }, marked
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

  it('words the move message', () => {
    expect(moveMessage(1, 'Anil', 'WASH')).toBe('Anil moved to WASH');
    expect(moveMessage(3, 'Anil', 'WASH')).toBe('3 volunteers moved to WASH');
    expect(moveMessage(2, 'Anil', null)).toBe('2 volunteers freed to Unassigned');
  });
});
