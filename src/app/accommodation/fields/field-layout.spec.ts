import {
  cellKey, cellsBetween, changesBetween, clearTents, erase, fromServer, isPath, matchesSearch, naturalCompare,
  normalizeNo, place, placedIds, setPath, tentAt, toSave,
} from './field-layout';

describe('field-layout', () => {
  const base = () => fromServer([{ _id: 'a', row: 0, col: 0 }, { _id: 'x' }], [[1, 1]]);

  it('reads the server layout (unplaced tents ignored)', () => {
    const l = base();
    expect(tentAt(l, 0, 0)).toBe('a');
    expect(isPath(l, 1, 1)).toBeTrue();
    expect(placedIds(l)).toEqual(new Set(['a']));
  });

  it('places into free cells only and moves a tent that stood elsewhere', () => {
    const l = base();
    expect(place(l, 1, 1, 'b')).toBe(l);            // path
    expect(place(l, 0, 0, 'b')).toBe(l);            // taken
    const moved = place(l, 2, 2, 'a');
    expect(tentAt(moved, 0, 0)).toBeNull();
    expect(tentAt(moved, 2, 2)).toBe('a');
    expect(tentAt(l, 0, 0)).toBe('a');              // old layout untouched (Undo)
  });

  it('erases a tent or a path, and paths never cover a tent', () => {
    let l = base();
    l = erase(l, 0, 0);
    expect(tentAt(l, 0, 0)).toBeNull();
    l = erase(l, 1, 1);
    expect(isPath(l, 1, 1)).toBeFalse();
    l = place(l, 3, 3, 'c');
    expect(setPath(l, 3, 3, true)).toBe(l);
    expect(isPath(setPath(l, 4, 4, true), 4, 4)).toBeTrue();
  });

  it('builds the save body and counts changes', () => {
    const before = base();
    const after = setPath(place(before, 0, 1, 'b'), 2, 0, true);
    expect(changesBetween(before, after)).toBe(2);
    const body = toSave(after);
    expect(body.placements).toEqual(jasmine.arrayWithExactContents([{ tent: 'a', row: 0, col: 0 }, { tent: 'b', row: 0, col: 1 }]));
    expect(body.paths).toEqual(jasmine.arrayWithExactContents([[1, 1], [2, 0]]));
    expect(cellKey(3, 4)).toBe('3:4');
  });

  it('removes every tent at once but keeps the walkways', () => {
    const l = clearTents(base());
    expect(placedIds(l).size).toBe(0);
    expect(isPath(l, 1, 1)).toBeTrue();
    expect(clearTents(l)).toBe(l);
  });

  it('fills the cells between two drag points', () => {
    expect(cellsBetween([0, 0], [0, 3])).toEqual([[0, 0], [0, 1], [0, 2], [0, 3]]);
    expect(cellsBetween([2, 2], [0, 0])).toEqual([[2, 2], [1, 1], [0, 0]]);
    expect(cellsBetween([1, 1], [1, 1])).toEqual([[1, 1]]);
  });

  it('sorts tent numbers naturally', () => {
    expect(['SH10', 'SH2', 'SH1'].sort(naturalCompare)).toEqual(['SH1', 'SH2', 'SH10']);
  });

  it('finds a tent by number in any style, or by an occupant name', () => {
    expect(normalizeNo('SH-014')).toBe('sh14');
    const t = { tent_no: 'SH14', occupants: [{ name: 'Ravi Kumar' }] };
    expect(matchesSearch('sh-014', t)).toBeTrue();
    expect(matchesSearch('SH14', t)).toBeTrue();
    expect(matchesSearch('sh1', t)).toBeFalse();
    expect(matchesSearch('kumar', t)).toBeTrue();
    expect(matchesSearch('  ', t)).toBeFalse();
  });
});
