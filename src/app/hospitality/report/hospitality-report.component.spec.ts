import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { HospitalityReportComponent } from './hospitality-report.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { HospitalityService } from '../hospitality.service';
import { MessReport, ReportMeal } from '../hospitality.model';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

const side = { staff: 3, guests: 3, veg: 4, nonVeg: 2, flagged: 1, refused: 1, blocked: 0, extra: 0 };
const meal = (key: any, label: string, extra: Partial<ReportMeal> = {}): ReportMeal => ({
  meal: key, label, asked: 7, prepared: 10, vegPrepared: 7, nonVegPrepared: 3, served: 6, ...side,
  leftover: 4, leftoverPct: 40, leftoverKg: 1.2, note: '', overGoal: true, hasFigures: true, closed: true, perDept: [], ...extra
});
const report = (days = 1): MessReport => ({
  from: '2026-11-12', to: days > 1 ? '2026-11-13' : '2026-11-12', department: null, goalPct: 5,
  days: Array.from({ length: days }, (_, i) => ({
    date: `2026-11-1${2 + i}`,
    meals: [meal('breakfast', 'Breakfast'), meal('lunch', 'Lunch', { prepared: null, hasFigures: false, leftover: null, leftoverPct: null, overGoal: false })],
    total: { asked: 14, prepared: 10, served: 12, leftover: 4, leftoverKg: 1.2, leftoverPct: 40, ...side }
  })),
  total: { asked: 14 * days, prepared: 10 * days, served: 12 * days, leftover: 4 * days, leftoverKg: 1.2, leftoverPct: 40, countAccuracy: 86, ...side },
  trend: Array.from({ length: days }, (_, i) => ({ date: `2026-11-1${2 + i}`, leftoverPct: i ? null : 40 })),
  messDates: { opensOn: '2026-10-20', closesOn: '2026-11-19' }, today: '2026-11-12',
  departments: [{ _id: 'd1', name: 'Operations' }]
});

describe('HospitalityReportComponent', () => {
  let fixture: ComponentFixture<HospitalityReportComponent>;
  let component: HospitalityReportComponent;
  let service: jasmine.SpyObj<HospitalityService>;
  let notify: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('HospitalityService', ['getReport', 'getServedList', 'saveFigures']);
    service.getReport.and.callFake(() => Promise.resolve(report()));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    await TestBed.configureTestingModule({
      declarations: [HospitalityReportComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ date: '2026-11-12' }) } } },
        { provide: HospitalityService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(HospitalityReportComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const text = () => fixture.nativeElement.textContent as string;

  it('shows the tiles, meal rows and the day total', fakeAsync(() => {
    start();
    expect(service.getReport).toHaveBeenCalledWith('e1', { from: '2026-11-12', to: '2026-11-12', department: null });
    expect(text()).toContain('Count accuracy');
    expect(text()).toContain('86');
    expect(text()).toContain('Add kitchen figures');   // Lunch has none yet
    expect(fixture.nativeElement.querySelectorAll('.hr-total').length).toBe(1);
  }));

  it('a range shows a total per day and a grand total', fakeAsync(() => {
    service.getReport.and.returnValue(Promise.resolve(report(2)));
    start();
    expect(fixture.nativeElement.querySelectorAll('.hr-total').length).toBe(2);
    expect(text()).toContain('Grand total');
  }));

  it('a department hides the kitchen-wide columns', fakeAsync(() => {
    start();
    service.getReport.and.returnValue(Promise.resolve({ ...report(), department: 'd1' }));
    component.setDepartment('d1');
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.getReport).toHaveBeenCalledWith('e1', { from: '2026-11-12', to: '2026-11-12', department: 'd1' });
    expect(text()).not.toContain('Prepared');
    expect(text()).toContain('Without attendance');
  }));

  it('Whole mess period runs from the first mess day to today', fakeAsync(() => {
    start();
    component.wholeMess();
    expect(component.mode).toBe('range');
    expect(service.getReport).toHaveBeenCalledWith('e1', { from: '2026-10-20', to: '2026-11-12', department: null });
  }));

  it('saves kitchen figures (whole plates, optional kg)', fakeAsync(() => {
    start();
    const lunch = component.report!.days[0].meals[1];
    component.startFigures('2026-11-12', lunch);
    component.fig = { veg: 12.4, nonVeg: 5, kg: null, note: ' Rain ' };
    service.saveFigures.and.returnValue(Promise.resolve({ ok: true }));
    component.saveFigures('2026-11-12', lunch);
    flushMicrotasks();
    expect(service.saveFigures).toHaveBeenCalledWith({ event: 'e1', date: '2026-11-12', meal: 'lunch' }, { vegPrepared: 12, nonVegPrepared: 5, leftoverKg: null, note: 'Rain' });
    expect(component.editing).toBe('');
  }));

  it('the trend has one bar per day, highlighting days over the goal', fakeAsync(() => {
    service.getReport.and.returnValue(Promise.resolve(report(2)));
    start();
    expect(component.bars.map(b => [b.pct, b.over])).toEqual([[40, true], [null, false]]);
  }));
});
