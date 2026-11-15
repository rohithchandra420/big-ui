import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WashReportComponent } from './wash-report.component';
import { SlidePanelComponent } from '../../shared/slide-panel/slide-panel.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { WashService } from '../wash.service';
import { WashReport } from '../wash.model';
import { durationText } from '../wash.utils';

const report = (date: string, today = '2026-11-14'): WashReport => ({
  date, today,
  summary: { refills: 3, cleanings: 1, overdueFacilities: 1, problems: 1, viaQr: 2 },
  facilities: [
    { _id: 'f1', name: 'Toilets 1', kind: 'toilets', place: 'area', intervalHours: 2, done: 1, viaQr: 0, problems: 0, overdueMin: 0, downMin: 0,
      logs: [{ action: 'cleaned', at: '2026-11-14T04:30:00Z', time: '10:00', by: 'Meera', note: '', viaQr: false }] },
    { _id: 'f2', name: 'Water A', kind: 'water', place: 'pin', intervalHours: 3, done: 3, viaQr: 2, problems: 1, overdueMin: 135, downMin: 30,
      logs: [
        { action: 'refilled', at: '2026-11-14T03:30:00Z', time: '09:00', by: 'Ravi', note: '', viaQr: true },
        { action: 'empty', at: '2026-11-14T09:30:00Z', time: '15:00', by: 'Ravi', note: 'Dry', viaQr: false }
      ] }
  ],
  stock: [{ name: 'Soap', unit: 'litres', used: 4, received: 0 }]
});

describe('WashReportComponent', () => {
  let fixture: ComponentFixture<WashReportComponent>;
  let component: WashReportComponent;
  let service: jasmine.SpyObj<WashService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('WashService', ['report']);
    service.report.and.callFake((_e: string, date = '') => Promise.resolve(report(date || '2026-11-14')));
    await TestBed.configureTestingModule({
      declarations: [WashReportComponent, SlidePanelComponent],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: WashService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(WashReportComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const el = () => fixture.nativeElement as HTMLElement;

  it('opens on today with the summary, facility rows and stock', fakeAsync(() => {
    start();
    expect(service.report).toHaveBeenCalledWith('e1', '');
    expect(component.isToday).toBeTrue();
    expect(el().querySelectorAll('.wr-tile').length).toBe(5);
    expect(el().querySelectorAll('.wr-tile.bad').length).toBe(2);
    const rows = el().querySelectorAll('.wr-row');
    expect(rows.length).toBe(2);
    expect(rows[1].textContent).toContain('2 h 15 min');
    expect(rows[1].querySelectorAll('.wr-bad').length).toBe(2);
    expect(el().textContent).toContain('Soap');
    expect(el().querySelector('.day-nav-today')).toBeNull();
  }));

  it('steps a day back, offers Back to today, and never goes past today', fakeAsync(() => {
    start();
    component.shiftDay(-1);
    flushMicrotasks(); fixture.detectChanges();
    expect(service.report).toHaveBeenCalledWith('e1', '2026-11-13');
    expect(component.isToday).toBeFalse();
    expect(el().querySelector('.day-nav-today')).toBeTruthy();
    component.toToday();
    flushMicrotasks(); fixture.detectChanges();
    expect(component.report!.date).toBe('2026-11-14');
    const next = el().querySelectorAll('.day-nav button')[1] as HTMLButtonElement;
    expect(next.disabled).toBeTrue();
  }));

  it('shows a facility\'s log for the day in the slide panel', fakeAsync(() => {
    start();
    (el().querySelectorAll('.wr-row')[1] as HTMLElement).click();
    fixture.detectChanges();
    expect(el().querySelector('.sp-title')!.textContent!.trim()).toBe('Water A');
    const lines = el().querySelectorAll('.wr-tl li');
    expect(lines.length).toBe(2);
    expect(lines[0].textContent).toContain('via QR');
    expect(lines[1].textContent).toContain('Dry');
  }));

  it('writes durations the short way', () => {
    expect(durationText(0)).toBe('—');
    expect(durationText(45)).toBe('45 min');
    expect(durationText(120)).toBe('2 h');
    expect(durationText(135)).toBe('2 h 15 min');
  });
});
