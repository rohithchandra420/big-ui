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

  it('B-014: rows are tappable only when pickable; a tap sends the person or the guest\'s pass', () => {
    const picks: any[] = [];
    component.picked.subscribe(p => picks.push(p));
    show(exp());
    const rowsEl = () => Array.from(fixture.nativeElement.querySelectorAll('.hx-er:not(.hx-eh)')) as HTMLElement[];
    rowsEl()[1].click();
    expect(picks).toEqual([]);                                             // not pickable (Today)
    expect(rowsEl()[1].getAttribute('role')).toBe('row');

    component.pickable = true;
    fixture.detectChanges();
    expect(rowsEl()[1].classList).toContain('pick');
    expect(rowsEl()[1].getAttribute('tabindex')).toBe('0');
    rowsEl()[1].click();                                                   // Bina
    rowsEl()[3].click();                                                   // Sound crew (guest)
    rowsEl()[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));   // Dev, by keyboard
    expect(picks).toEqual([{ kind: 'staff', id: 'b' }, { kind: 'guest', id: 'g' }, { kind: 'staff', id: 'd' }]);
  });

  it('B-009: Enter in Find a name stays put, closes the keyboard and picks the one match', () => {
    const picks: any[] = [];
    component.picked.subscribe(p => picks.push(p));
    component.pickable = true;
    show(exp());
    const input = fixture.nativeElement.querySelector('.hx-etools input') as HTMLInputElement;
    expect(input.getAttribute('enterkeyhint')).toBe('search');
    input.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    input.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBeTrue();
    expect(document.activeElement).not.toBe(input);
    expect(picks).toEqual([]);                                             // 5 shown: nobody picked

    component.search = 'echo'; component.apply(); fixture.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(picks).toEqual([{ kind: 'guest', id: 'g' }]);
  });

  it('B-002: showAvatar = false drops the photo (Today), names stay', () => {
    show(exp());
    expect(fixture.nativeElement.querySelector('app-user-avatar')).not.toBeNull();
    component.showAvatar = false;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-user-avatar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.hx-egav')).toBeNull();
    expect(rows()).toContain('Bina Marked');
  });

  it('B-002: compact (Today\'s side panel) shows the food as an icon only, names stay', () => {
    show(exp());
    expect(text()).toContain('Non-veg');
    component.compact = true;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hx-etable.hx-ecompact')).not.toBeNull();
    const food = fixture.nativeElement.querySelector('.hx-er:not(.hx-eh) .hx-ef') as HTMLElement;
    expect(food.textContent!.trim()).toBe('');                               // icon only
    expect(food.querySelector('.food-mark')!.getAttribute('aria-label')).toBe('Veg');
    expect(text()).toContain('2V · 1NV');                                    // guest plates, short
    expect(rows()).toContain('Bina Marked');
  });

  it('every person row has the food icon, with the word in its own span (hidden on phones by CSS)', () => {
    show(exp());
    const people = Array.from(fixture.nativeElement.querySelectorAll('.hx-er:not(.hx-eh)')) as HTMLElement[];
    const staff = people.filter(r => !r.textContent!.includes('Sound crew'));
    expect(staff.length).toBe(4);
    staff.forEach(r => {
      expect(r.querySelector('.hx-ef .food-mark')).not.toBeNull();
      expect(r.querySelector('.hx-ef .hx-eft')).not.toBeNull();
    });
    const guest = people.find(r => r.textContent!.includes('Sound crew'))!;
    expect(guest.querySelector('.hx-ef .hx-efs')!.textContent).toBe('2V · 1NV');
  });

  it('shows the message when there is no meal, and nothing without data', () => {
    show({ meal: null, next: 'Outside the mess dates' });
    expect(text()).toContain('Outside the mess dates');
    show(null);
    expect(text().trim()).toBe('');
  });

  it('Joining Time: says why someone counts before their attendance does', () => {
    const d = exp();
    d.summary = { ...d.summary!, expected: 8, reported: 1, expectedToJoin: 1, late: 1 };
    d.counted!.push(
      { _id: 'e', name: 'Esha Early', avatarVersion: 0, department: 'Decor', food: 'veg', counted: true, why: 'reported', status: 'none', at: null, reportedAt: at(11, 5) },
      { _id: 'f', name: 'Farah Late', avatarVersion: 0, department: 'Decor', food: 'veg', counted: true, why: 'expected', late: true, status: 'none', at: null, expectedAt: at(11, 0), reportedAt: null }
    );
    show(d);
    expect(text()).toContain('Reported 11:05');
    expect(text()).toContain('Expected to join 11:00 · late, not reported yet');
    expect(text()).toContain('+ 1 reported today + 1 expected to join (1 late)');
    expect(fixture.nativeElement.querySelector('.hx-ew.late')).not.toBeNull();
  });
});
