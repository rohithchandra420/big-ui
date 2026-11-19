import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TableSort, compareValues, sortRowsBy } from './table-sort';
import { SortThComponent } from './sort-th.component';
import { MatIconModule } from '@angular/material/icon';

describe('TableSort (B-003)', () => {
  interface R { name: string; n: number | null; at?: string }
  const rows: R[] = [
    { name: 'tent 10', n: 3 }, { name: 'Tent 2', n: null }, { name: 'alpha', n: 1 }, { name: 'Beta', n: 3 }
  ];

  it('starts unsorted when no key is given and keeps the incoming order', () => {
    const s = new TableSort<'name' | 'n'>();
    expect(s.apply(rows, { name: r => r.name })).toEqual(rows);
    expect(s.aria('name')).toBe('none');
    expect(s.icon('name')).toBe('unfold_more');
  });

  it('a tap sorts ascending, a second tap flips it, another column starts ascending', () => {
    const changed = jasmine.createSpy('changed');
    const s = new TableSort<'name' | 'n'>(null, 'asc', changed);
    s.toggle('name');
    expect([s.key, s.dir]).toEqual(['name', 'asc']);
    s.toggle('name');
    expect(s.dir).toBe('desc');
    expect(s.icon('name')).toBe('arrow_downward');
    s.toggle('n');
    expect([s.key, s.dir]).toEqual(['n', 'asc']);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('sorts text naturally and ignoring case', () => {
    expect(sortRowsBy(rows, r => r.name, 'asc').map(r => r.name)).toEqual(['alpha', 'Beta', 'Tent 2', 'tent 10']);
    expect(sortRowsBy(rows, r => r.name, 'desc').map(r => r.name)).toEqual(['tent 10', 'Tent 2', 'Beta', 'alpha']);
  });

  it('keeps empty values last in both orders and ties in their incoming order', () => {
    expect(sortRowsBy(rows, r => r.n, 'asc').map(r => r.name)).toEqual(['alpha', 'tent 10', 'Beta', 'Tent 2']);
    expect(sortRowsBy(rows, r => r.n, 'desc').map(r => r.name)).toEqual(['tent 10', 'Beta', 'alpha', 'Tent 2']);
  });

  it('returns the same row objects in a new array', () => {
    const out = sortRowsBy(rows, r => r.name, 'asc');
    expect(out).not.toBe(rows);
    expect(out.every(r => rows.includes(r))).toBeTrue();
  });

  it('compares numbers, dates and booleans by value', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues(new Date('2026-11-02'), new Date('2026-11-01'))).toBeGreaterThan(0);
    expect(compareValues(false, true)).toBeLessThan(0);
  });
});

@Component({
  template: `<table><thead><tr><th appSort="name" [sort]="sort">Name</th><th appSort="n" [sort]="sort">N</th></tr></thead></table>`
})
class HostComponent { sort = new TableSort<'name' | 'n'>(); }

describe('SortThComponent (B-003)', () => {
  let fixture: ComponentFixture<HostComponent>;
  const ths = () => Array.from(fixture.nativeElement.querySelectorAll('th')) as HTMLElement[];

  beforeEach(() => {
    TestBed.configureTestingModule({ declarations: [HostComponent, SortThComponent], imports: [MatIconModule] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('shows the label as a button and sets aria-sort on the header', () => {
    expect(ths()[0].textContent).toContain('Name');
    expect(ths().map(t => t.getAttribute('aria-sort'))).toEqual(['none', 'none']);
    (ths()[0].querySelector('button.th-sort') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(ths().map(t => t.getAttribute('aria-sort'))).toEqual(['ascending', 'none']);
    (ths()[0].querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(ths()[0].getAttribute('aria-sort')).toBe('descending');
  });
});
