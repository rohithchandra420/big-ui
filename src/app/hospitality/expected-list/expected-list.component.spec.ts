import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ExpectedListComponent } from './expected-list.component';
import { DeskExpected } from '../hospitality.model';

const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m).toISOString();
const exp = (): DeskExpected => ({
  meal: { meal: 'lunch', label: 'Lunch', date: '2026-11-12', status: 'open', start: at(12, 30), end: at(15),
    basis: { slot: 'morning', label: 'Morning', date: '2026-11-12', previousDay: false } },
  summary: { expected: 6, served: 3, notYet: 3, marked: 2, always: 1, guestPlates: 3 },
  counted: [
    { _id: 'a', name: 'Asha Admin', avatarVersion: 0, department: null, food: 'veg', counted: true, why: 'always', status: 'none', at: null },
    { _id: 'b', name: 'Bina Marked', avatarVersion: 0, department: 'Operations', food: 'non-veg', counted: true, why: 'marked', status: 'none', at: null },
    { _id: 'c', name: 'Chetan Served', avatarVersion: 0, department: 'Operations', food: 'veg', counted: true, why: 'marked', status: 'served', at: at(12, 41) }
  ],
  others: [{ _id: 'd', name: 'Dev Unmarked', avatarVersion: 0, department: 'Operations', food: 'veg', counted: false, why: 'not_marked', status: 'served_flagged', at: at(12, 50), reason: 'Off-site duty' }],
  guests: [{ _id: 'g', name: 'Sound crew', note: 'Echo Rentals', veg: 2, nonVeg: 1, used: 2 }]
});

describe('ExpectedListComponent', () => {
  let fixture: ComponentFixture<ExpectedListComponent>;
  let component: ExpectedListComponent;
  const text = () => fixture.nativeElement.textContent as string;
  const rows = () => Array.from(fixture.nativeElement.querySelectorAll('.hx-er:not(.hx-eh) .hx-en b')).map((b: any) => b.textContent.trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [ExpectedListComponent], imports: [FormsModule], schemas: [NO_ERRORS_SCHEMA] }).compileComponents();
    fixture = TestBed.createComponent(ExpectedListComponent);
    component = fixture.componentInstance;
  });

  const show = (d: DeskExpected | null) => { component.data = d; component.ngOnChanges(); fixture.detectChanges(); };

  it('lists everyone behind the number, with why and status', () => {
    show(exp());
    expect(text()).toContain('6 = 2 marked for Morning + 1 always counted + 3 guest plates');
    expect(rows()).toEqual(['Asha Admin', 'Bina Marked', 'Chetan Served', 'Sound crew', 'Dev Unmarked']);
    expect(text()).toContain('Always counted');
    expect(text()).toContain('Marked · Morning');
    expect(text()).toContain('Served with reason');
    expect(text()).toContain('2 of 3 used');
    expect(fixture.nativeElement.querySelector('.hx-er.dim')).toBeTruthy();
  });

  it('filters by chip and by name', () => {
    show(exp());
    expect(component.chips.map(c => c.count)).toEqual([5, 2, 2, 1, 1]);
    component.setFilter('not_yet'); fixture.detectChanges();
    expect(rows()).toEqual(['Asha Admin', 'Bina Marked']);
    component.setFilter('served'); fixture.detectChanges();
    expect(rows()).toEqual(['Chetan Served', 'Dev Unmarked']);
    component.setFilter('guests'); fixture.detectChanges();
    expect(rows()).toEqual(['Sound crew']);
    component.setFilter('all'); component.search = 'bina'; component.apply(); fixture.detectChanges();
    expect(rows()).toEqual(['Bina Marked']);
  });

  it('marks the previous-day slot for breakfast', () => {
    const d = exp();
    d.meal!.basis = { slot: 'night', label: 'Night', date: '2026-11-11', previousDay: true };
    show(d);
    expect(text()).toContain('marked for Night (day before)');
  });

  it('shows the message when there is no meal, and nothing without data', () => {
    show({ meal: null, next: 'Outside the mess dates' });
    expect(text()).toContain('Outside the mess dates');
    show(null);
    expect(text().trim()).toBe('');
  });
});
