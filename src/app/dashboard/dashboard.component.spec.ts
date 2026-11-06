import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flush } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { MatIconModule } from '@angular/material/icon';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { DashboardComponent, istHours, money } from './dashboard.component';
import { DashboardMine, DashboardOverview, DashboardService } from './dashboard.service';
import { AuthService } from '../core/auth.service';
import { EventService } from '../core/event.service';

const overview = (extra: Partial<DashboardOverview> = {}): DashboardOverview => ({
  event: { _id: 'e1', name: 'BiG 7.0', startDate: '2026-11-11T00:00:00.000Z', endDate: '2026-11-13T00:00:00.000Z' },
  today: '2026-11-12', day: { index: 2, total: 3 }, updatedAt: '2026-11-12T07:30:00Z',
  attention: [{ kind: 'sos', level: 'bad', count: 1, text: '1 open SOS', link: '/sos' }],
  tiles: { bookings: 1284, spot: 38, passes: 2146, festivalPasses: 1912, tentPasses: 234, admitted: 1491, staff: 186, staffMarkedToday: 142,
    mealsServedToday: 412, mealsExpectedToday: 540, workshopVisitsToday: 327, sessionsToday: 9, sosOpen: 1, sosHandled: 5 },
  gate: { perHour: Array.from({ length: 24 }, (_, hour) => ({ hour, count: hour === 10 ? 4 : 0 })), admitted: 1491, notAdmitted: 421,
    byType: [{ name: 'Festival Pass', category: 'festival', count: 1912, admitted: 1491 }] },
  accommodation: { tents: [{ name: 'Solo Tent', beds: 10, used: 4 }], beds: { byType: [], inBed: 3, movedIn: 2, staffWithoutBed: 7 } },
  people: { byDept: [{ name: 'Operations', count: 4 }], heat: [{ date: '2026-11-12', morning: 90, afternoon: 60, night: 10 }] },
  meals: { plan: true, today: [], leftover: [], goalPct: 5 },
  workshops: { today: [{ _id: 's1', title: 'Clay', venue: 'Dome', colour: '#ea580c', start: '2026-11-12T05:30:00Z', end: '2026-11-12T06:30:00Z', attended: 3, capacity: 2 }], byCategory: [] },
  comms: { email: { sent: 1, notSent: 0, sending: 0, failed: 1, bounced: 0, noEmail: 0 },
    sos: { open: 1, handled: 5, avgMinutes: 6, recent: [{ message: 'Lost child', status: 'open', at: '2026-11-12T07:00:00Z' }] },
    announcements: [], reached: 0 },
  ...extra
});

const mineData: DashboardMine = {
  name: 'Ravi', role: 'TL', department: 'Operations', isTeamLead: true,
  team: { size: 16, slots: { morning: 16, afternoon: 9, night: 0 } },
  nextMeal: { label: 'Lunch', start: '12:30', open: true },
  billboard: [{ _id: 'n1', title: 'Restock water', type: 'task', at: '2026-11-12T06:00:00Z', read: false }],
  bed: { unit: 'D-01', type: 'Volunteer dorm', movedIn: true }
};

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let api: jasmine.SpyObj<DashboardService>;
  let user$: BehaviorSubject<any>;
  let event$: BehaviorSubject<any>;
  const el = () => fixture.nativeElement as HTMLElement;

  const setup = (role: string | null, data: DashboardOverview = overview()) => {
    user$ = new BehaviorSubject(role ? { role, name: 'X' } : null);
    event$ = new BehaviorSubject({ _id: 'e1', name: 'BiG 7.0', status: 'active' });
    api = jasmine.createSpyObj('DashboardService', ['overview', 'mine']);
    api.overview.and.returnValue(of(data));
    api.mine.and.returnValue(of(mineData));
    TestBed.configureTestingModule({
      declarations: [DashboardComponent],
      imports: [MatIconModule, RouterTestingModule],
      providers: [
        { provide: DashboardService, useValue: api },
        { provide: AuthService, useValue: { user: user$ } },
        { provide: EventService, useValue: { activeEvent: event$ } }
      ]
    });
    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    flush();
    fixture.detectChanges();
  };

  afterEach(() => fixture?.destroy());

  it('shows a sign-in prompt and loads nothing when signed out', fakeAsync(() => {
    setup(null);
    expect(el().querySelector('.signin-prompt')).toBeTruthy();
    expect(api.overview).not.toHaveBeenCalled();
    expect(api.mine).not.toHaveBeenCalled();
    fixture.destroy(); discardPeriodicTasks();
  }));

  it('loads the overview for an Admin, with the attention strip and tiles', fakeAsync(() => {
    setup('ADMIN');
    expect(api.overview).toHaveBeenCalledWith('e1');
    expect(el().querySelector('.d-chip.bad')!.textContent).toContain('1 open SOS');
    expect(el().querySelectorAll('.d-tile').length).toBe(7);
    expect(el().querySelector('.d-tile.money')).toBeNull();
    expect(el().textContent).toContain('1,284');
    expect(el().querySelectorAll('.d-day').length).toBe(3);
    expect(el().querySelector('.d-day.now')!.textContent).toContain('Day 2');
    fixture.destroy(); discardPeriodicTasks();
  }));

  it('shows the revenue tile only when the reply carries revenue (Directors)', fakeAsync(() => {
    const d = overview();
    d.tiles.revenue = { total: 1840000, today: 42000 };
    setup('DIR', d);
    const tile = el().querySelector('.d-tile.money')!;
    expect(tile.textContent).toContain('₹18.4L');
    expect(tile.textContent).toContain('+₹42k');
    fixture.destroy(); discardPeriodicTasks();
  }));

  it('draws the workshop timeline and flags a session over capacity', fakeAsync(() => {
    setup('DEV');
    const blk = el().querySelector('.blk') as HTMLElement;
    expect(blk.textContent).toContain('Clay');
    expect(blk.classList).toContain('over');
    expect(blk.title).toContain('11:00–12:00');
    fixture.destroy(); discardPeriodicTasks();
  }));

  it('gives Team Leads their simple view', fakeAsync(() => {
    setup('TL');
    expect(api.mine).toHaveBeenCalledWith('e1');
    expect(api.overview).not.toHaveBeenCalled();
    const slots = el().querySelectorAll('.slot');
    expect(slots[0].textContent).toContain('16/16');
    expect(slots[0].classList).toContain('done');
    expect(slots[1].classList).toContain('todo');
    expect(el().textContent).toContain('Lunch · 12:30');
    expect(el().textContent).toContain('D-01');
    fixture.destroy(); discardPeriodicTasks();
  }));

  it('reloads when the sidebar event changes and ignores stale replies', fakeAsync(() => {
    setup('ADMIN');
    api.overview.calls.reset();
    event$.next({ _id: 'e2', name: 'BiG 8.0', status: 'active' });
    flush(); fixture.detectChanges();
    expect(api.overview).toHaveBeenCalledWith('e2');
    fixture.destroy(); discardPeriodicTasks();
  }));

  it('shows an error and keeps the page when loading fails', fakeAsync(() => {
    user$ = new BehaviorSubject({ role: 'ADMIN' });
    setup('ADMIN');
    api.overview.and.returnValue(throwError(() => new Error('offline')));
    fixture.componentInstance.load();
    flush(); fixture.detectChanges();
    expect(el().querySelector('.warn-banner')!.textContent).toContain('Could not load');
    fixture.destroy(); discardPeriodicTasks();
  }));

  it('helpers: India time hours and money', () => {
    expect(istHours('2026-11-12T04:40:00Z')).toBeCloseTo(10 + 10 / 60);
    expect(money(1840000)).toBe('₹18.4L');
    expect(money(42000)).toBe('₹42k');
    expect(money(900)).toBe('₹900');
    expect(money(25000000)).toBe('₹2.5Cr');
  });
});
