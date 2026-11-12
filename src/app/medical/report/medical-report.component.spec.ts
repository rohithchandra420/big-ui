import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { MedicalReportComponent, bars } from './medical-report.component';
import { MedicalService } from '../medical.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { DayReport } from '../medical.model';

const day = (extra: Partial<DayReport> = {}): DayReport => ({
  date: '2026-11-12', days: ['2026-11-11', '2026-11-12'], visits: 3, patients: 2, newPatients: 2,
  byType: { participant: 1, staff: 0, walkin: 2 }, bySeverity: { minor: 2, moderate: 0, serious: 1 },
  byOutcome: { returned: 1, resting: 1, referred: 0, ambulance: 1 },
  complaints: [{ label: 'Headache', n: 2 }, { label: 'Cut', n: 1 }], medicines: [{ label: 'Paracetamol', n: 2 }],
  byHour: Array.from({ length: 24 }, (_, h) => (h === 10 ? 2 : h === 23 ? 1 : 0)),
  referrals: [{ patientId: 'p2', name: 'Bina', at: '2026-11-12T05:15:00Z', outcome: 'ambulance', hospital: 'City Hospital', severity: 'serious' }],
  ...extra
});

describe('MedicalReportComponent', () => {
  let fixture: ComponentFixture<MedicalReportComponent>;
  let component: MedicalReportComponent;
  let medical: jasmine.SpyObj<MedicalService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;

  const setAccess = (canExport: boolean) => medical.access.and.returnValue(Promise.resolve({ canUse: true, canManage: canExport, canAudit: false, canExport, locked: false, lockMinutes: 15 }));

  beforeEach(async () => {
    medical = jasmine.createSpyObj('MedicalService', ['access', 'dayReport', 'exportVisits']);
    setAccess(false);
    medical.dayReport.and.callFake((_: string, date?: string) => Promise.resolve(day(date ? { date } : {})));
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [MedicalReportComponent],
      providers: [
        { provide: MedicalService, useValue: medical },
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: ConfirmationService, useValue: confirm }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(MedicalReportComponent);
    component = fixture.componentInstance;
  });
  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const text = () => fixture.nativeElement.textContent as string;

  it('shows the day, its bars, hours and who went to hospital; no export for volunteers', fakeAsync(() => {
    start();
    expect(medical.dayReport).toHaveBeenCalledWith('e1', undefined);
    expect(component.date).toBe('2026-11-12');
    expect(text()).toContain('Headache');
    expect(text()).toContain('Bina');
    expect(text()).toContain('City Hospital');
    expect(component.hours[0].h).toBe(8);
    expect(component.hours[component.hours.length - 1].h).toBe(23);
    expect(text()).not.toContain('Export this day');
  }));

  it('switches day', fakeAsync(() => {
    start();
    component.pick('2026-11-11');
    flushMicrotasks();
    expect(medical.dayReport).toHaveBeenCalledWith('e1', '2026-11-11');
  }));

  it('exports only after the health-data warning', fakeAsync(() => {
    setAccess(true);
    start();
    expect(text()).toContain('Export this day');
    confirm.confirm.and.returnValue(of(false));
    component.export('day');
    flushMicrotasks();
    expect(medical.exportVisits).not.toHaveBeenCalled();
    confirm.confirm.and.returnValue(of(true));
    medical.exportVisits.and.returnValue(Promise.resolve({ event: 'BiG 7.0', rows: [], truncated: false }));
    component.export('day');
    flushMicrotasks();
    expect(medical.exportVisits).toHaveBeenCalledWith('e1', '2026-11-12', '2026-11-12');
  }));

  it('scales bars to the biggest value', () => {
    expect(bars([{ label: 'a', n: 4 }, { label: 'b', n: 1 }]).map(b => b.pct)).toEqual([100, 25]);
    expect(bars([{ label: 'a', n: 0 }])[0].pct).toBe(0);
  });
});
