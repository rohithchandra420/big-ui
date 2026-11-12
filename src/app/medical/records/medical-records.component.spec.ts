import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { MedicalRecordsComponent } from './medical-records.component';
import { MedicalService } from '../medical.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

describe('MedicalRecordsComponent', () => {
  let fixture: ComponentFixture<MedicalRecordsComponent>;
  let component: MedicalRecordsComponent;
  let medical: jasmine.SpyObj<MedicalService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    medical = jasmine.createSpyObj('MedicalService', ['access', 'records']);
    medical.access.and.returnValue(Promise.resolve({ canUse: true, canManage: false, canAudit: false, locked: false, lockMinutes: 15 }));
    medical.records.and.returnValue(Promise.resolve({
      patients: [{ _id: 'p1', kind: 'participant', name: 'Asha', age: 22, allergies: 'Nuts', lastVisitAt: '2026-11-12T08:00:00Z', lastComplaint: 'Fever', lastSeverity: 'serious', lastOutcome: 'referred', visitCount: 2, restingNow: false, followUpDue: null } as any],
      total: 120, page: 0, pageSize: 50, counts: { patients: 120, visitsToday: 4, restingNow: 0, followUpsDue: 2, serious: 3 }
    }));
    router = jasmine.createSpyObj('Router', ['navigate']);
    await TestBed.configureTestingModule({
      declarations: [MedicalRecordsComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: MedicalService, useValue: medical },
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: Router, useValue: router }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(MedicalRecordsComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('lists the records with their flags and pages', fakeAsync(() => {
    start();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Asha');
    expect(text).toContain('Serious');
    expect(text).toContain('Referred');
    expect(text).toContain('Page 1 of 3');
    expect(fixture.nativeElement.querySelector('.md-flag')).toBeTruthy();
  }));

  it('stat cards work as quick filters and toggle off', fakeAsync(() => {
    start();
    component.setQuick('followUp');
    flushMicrotasks();
    expect(medical.records.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ followUp: true }));
    component.setQuick('serious');
    flushMicrotasks();
    expect(medical.records.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({ severity: 'serious' }));
    component.setQuick('serious');
    flushMicrotasks();
    expect(component.quick).toBe('all');
  }));

  it('keeps the dropdown options stable between change-detection passes', fakeAsync(() => {
    start();
    const opts = component.severityOptions;
    fixture.detectChanges();
    expect(component.severityOptions).toBe(opts);
  }));

  it('turns picked dates into whole days and opens a report on click', fakeAsync(() => {
    start();
    component.f.from = '2026-11-10';
    component.f.to = '2026-11-11';
    component.changed();
    flushMicrotasks();
    const f = medical.records.calls.mostRecent().args[1];
    expect(f.from).toBe(new Date('2026-11-10T00:00:00').toISOString());
    expect(f.to).toBe(new Date('2026-11-11T23:59:59').toISOString());
    component.openReport(component.patients[0]);
    expect(router.navigate).toHaveBeenCalledWith(['/medical/patients', 'p1']);
  }));
});
