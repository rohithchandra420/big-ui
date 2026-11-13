import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HospitalityTodayComponent } from './hospitality-today.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { HospitalityService } from '../hospitality.service';
import { MealDay, MealKey, MessDay } from '../hospitality.model';
import { SlidePanelComponent } from '../../shared/slide-panel/slide-panel.component';

const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m).toISOString();
const meal = (key: MealKey, label: string, status: MealDay['status'], extra: Partial<MealDay> = {}): MealDay => ({
  meal: key, label, start: at(12, 30), end: at(15), status, closedEarly: false, ownTimes: false,
  basis: { date: '2026-11-12', slot: 'morning' }, expected: { veg: 142, nonVeg: 58, guests: 0, total: 200 },
  count: null, countDueAt: at(10, 45),
  notMarked: [
    { department: { _id: 'd1', name: 'Stage Crew' }, total: 34, missing: 6 },
    { department: null, total: 7, missing: 1 }
  ],
  notMarkedTotal: 7, served: 0, ...extra
});
const day = (): MessDay => ({
  plan: { _id: 'p1', opensOn: '2026-10-20T00:00:00.000Z', closesOn: '2026-11-19T00:00:00.000Z' } as any, date: '2026-11-12', today: '2026-11-12', inMessDates: true,
  meals: [
    meal('breakfast', 'Breakfast', 'closed', { count: { veg: 120, nonVeg: 44, guests: 0, sentAt: at(9), sentBy: 'u1' } }),
    meal('lunch', 'Lunch', 'open'),
    meal('snacks', 'Snacks', 'upcoming'),
    meal('dinner', 'Dinner', 'upcoming')
  ]
});

describe('HospitalityTodayComponent', () => {
  let fixture: ComponentFixture<HospitalityTodayComponent>;
  let component: HospitalityTodayComponent;
  let service: jasmine.SpyObj<HospitalityService>;
  let notify: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('HospitalityService', ['getDay', 'sendCount', 'close', 'reopen', 'remindTls', 'sendAlert', 'setMealTime', 'resetMealTime', 'getDeskExpected']);
    service.getDeskExpected.and.returnValue(Promise.resolve({ meal: null, next: 'x' }));
    service.getDay.and.callFake(() => Promise.resolve(day()));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    await TestBed.configureTestingModule({
      declarations: [HospitalityTodayComponent, SlidePanelComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: HospitalityService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(HospitalityTodayComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const text = () => fixture.nativeElement.textContent as string;

  it('shows the four meals and picks the open one', fakeAsync(() => {
    start();
    expect(service.getDay).toHaveBeenCalledWith('e1', undefined);
    expect(fixture.nativeElement.querySelectorAll('.ht-meal').length).toBe(4);
    expect(component.selectedKey).toBe('lunch');
    expect(text()).toContain('Lunch is open');
    expect(text()).toContain('142');
    expect(text()).toContain('6 missing');
    expect(text()).toContain('No department');
    expect(text()).toContain('Mess day 24 of 31');
    expect(text()).toContain('Count: morning attendance + guest passes');
    expect(text()).toContain('Count from');
    discardPeriodicTasks();
  }));

  it('keeps the rail and not-marked lists stable between change-detection passes', fakeAsync(() => {
    start();
    const rail = component.rail, rows = component.notMarked;
    fixture.detectChanges();
    expect(component.rail).toBe(rail);
    expect(component.notMarked).toBe(rows);
    discardPeriodicTasks();
  }));

  it('Who\'s counted opens the list for the selected day and meal, and follows the meal', fakeAsync(() => {
    start();
    expect(text()).toContain("Who's counted (200)");
    expect(service.getDeskExpected).not.toHaveBeenCalled();
    component.toggleWho(); flushMicrotasks(); fixture.detectChanges();
    expect(service.getDeskExpected).toHaveBeenCalledWith('e1', '2026-11-12', 'lunch');
    expect(fixture.nativeElement.querySelector('app-expected-list')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.sp-panel .sp-title').textContent.trim()).toBe("Who's counted");
    component.select('dinner'); flushMicrotasks();
    expect(service.getDeskExpected).toHaveBeenCalledWith('e1', '2026-11-12', 'dinner');
    (fixture.nativeElement.querySelector('.sp-x') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(component.whoOpen).toBeFalse();
    expect(fixture.nativeElement.querySelector('app-expected-list')).toBeNull();
    discardPeriodicTasks();
  }));

  it('sends the kitchen count and puts the fresh meal in place', fakeAsync(() => {
    start();
    service.sendCount.and.returnValue(Promise.resolve(meal('lunch', 'Lunch', 'open', { count: { veg: 142, nonVeg: 58, guests: 0, sentAt: at(10), sentBy: 'u1' } })));
    component.sendCount();
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.sendCount).toHaveBeenCalledWith({ event: 'e1', date: '2026-11-12', meal: 'lunch' });
    expect(component.selected?.count?.veg).toBe(142);
    expect(notify.openSucessSnackBar).toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  it('builds the WhatsApp message from the sent count (or the live one)', fakeAsync(() => {
    start();
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    component.select('breakfast');
    component.copyWhatsapp();
    flushMicrotasks();
    expect(component.whatsapp).toContain('Breakfast');
    expect(component.whatsapp).toContain('Veg: 120');
    expect(component.whatsapp).toContain('Total: 164');
    discardPeriodicTasks();
  }));

  it('reports how many TLs were reminded', fakeAsync(() => {
    start();
    service.remindTls.and.returnValue(Promise.resolve({ tls: 2, delivered: 2 }));
    component.remindTls();
    flushMicrotasks();
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Task sent to 2 Team Leads (on their Billboard; 2 phone notifications)');
    discardPeriodicTasks();
  }));

  it('shows the server message when closing fails', fakeAsync(() => {
    start();
    service.close.and.returnValue(Promise.reject({ error: { message: 'The Mess Hall is not open for this meal' } }));
    component.closeMess();
    flushMicrotasks();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('The Mess Hall is not open for this meal');
    discardPeriodicTasks();
  }));

  it('sends a meal alert and clears the box', fakeAsync(() => {
    start();
    service.sendAlert.and.returnValue(Promise.resolve({ recipients: 40, delivered: 31 }));
    component.alertText = '  Lunch moved to 13:00 today ';
    component.sendAlert();
    flushMicrotasks();
    expect(service.sendAlert).toHaveBeenCalledWith('e1', 'Lunch moved to 13:00 today');
    expect(component.alertText).toBe('');
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Alert sent to 40 people');
    discardPeriodicTasks();
  }));

  it('points to Setup when there is no mess plan', fakeAsync(() => {
    service.getDay.and.returnValue(Promise.resolve({ plan: null }));
    start();
    expect(text()).toContain("The mess isn't set up");
    discardPeriodicTasks();
  }));
});
