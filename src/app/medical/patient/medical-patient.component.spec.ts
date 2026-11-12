import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { MedicalPatientComponent, toLocalInput, vitalWarnings } from './medical-patient.component';
import { MedicalService } from '../medical.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';
import { MedicalPatient, MedicalVisit, PatientReport } from '../medical.model';

const patient = (extra: Partial<MedicalPatient> = {}): MedicalPatient => ({
  _id: 'p1', event: 'e1', kind: 'walkin', name: 'Kiran Das', phone: '900', email: '', age: 15, gender: 'Male',
  guardian: { name: 'Uma Das', phone: '901', contacted: false }, allergies: 'Penicillin', conditions: '',
  visitCount: 1, lastVisitAt: '2026-11-12T08:00:00Z', lastComplaint: 'Headache', lastSeverity: 'minor', lastOutcome: 'resting',
  restingNow: true, followUpDue: null, createdAt: '2026-11-12T08:00:00Z', ...extra
});
const visit = (extra: Partial<MedicalVisit> = {}): MedicalVisit => ({
  _id: 'v1', patient: 'p1', at: '2026-11-12T08:00:00Z', attendedBy: { _id: 'u1', name: 'Nisha' }, createdBy: { _id: 'u1', name: 'Nisha' },
  alsoAttended: '', complaint: 'Headache', diagnosis: 'Dehydration', medicines: [{ name: 'ORS', dose: '1 sachet', qty: '2' }], notes: '',
  vitals: { temperature: 38.4, pulse: 90, bpSys: 120, bpDia: 80, spo2: 97 }, severity: 'minor', outcome: 'resting', hospital: '',
  leftAt: null, followUp: { needed: false, at: null, note: '', done: false }, edits: [], createdAt: '2026-11-12T08:00:00Z',
  canEdit: true, canDelete: false, ...extra
});
const report = (visits = [visit()]): PatientReport => ({ patient: patient(), event: { _id: 'e1', name: 'BiG 7.0' }, visits, can: { manage: false, audit: false } });

describe('MedicalPatientComponent', () => {
  let fixture: ComponentFixture<MedicalPatientComponent>;
  let component: MedicalPatientComponent;
  let medical: jasmine.SpyObj<MedicalService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    medical = jasmine.createSpyObj('MedicalService', ['report', 'updateReport', 'deleteReport', 'addVisit', 'updateVisit', 'deleteVisit', 'markLeft', 'followUpDone', 'medicines', 'audit', 'access', 'emailReport']);
    medical.report.and.callFake(() => Promise.resolve(report()));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    router = jasmine.createSpyObj('Router', ['navigate']);
    await TestBed.configureTestingModule({
      declarations: [MedicalPatientComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: MedicalService, useValue: medical },
        { provide: NotificationService, useValue: notify },
        { provide: ConfirmationService, useValue: confirm },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { paramMap: new BehaviorSubject(convertToParamMap({ id: 'p1' })) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(MedicalPatientComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const text = () => fixture.nativeElement.textContent as string;

  it('shows allergies first, the guardian for a minor, and the visit timeline', fakeAsync(() => {
    start();
    expect(medical.report).toHaveBeenCalledWith('p1');
    expect(fixture.nativeElement.querySelector('.md-alert').textContent).toContain('Penicillin');
    expect(text()).toContain('Minor — guardian');
    expect(text()).toContain('Uma Das');
    expect(fixture.nativeElement.querySelectorAll('.md-tl-item').length).toBe(1);
    expect(text()).toContain('Resting now');
    expect(fixture.nativeElement.querySelector('.md-vchip.warn').textContent).toContain('38.4');
    expect(text()).not.toContain('Delete report');
  }));

  it('opens the new-visit form straight away for a report with no visits', fakeAsync(() => {
    medical.report.and.returnValue(Promise.resolve(report([])));
    start();
    expect(component.form).not.toBeNull();
  }));

  it('records a visit with cleaned fields and puts it on the timeline', fakeAsync(() => {
    start();
    component.newVisit();
    const f = component.form!;
    f.complaint = '  Sprained ankle ';
    f.severity = 'moderate';
    f.outcome = 'returned';
    f.vitals.pulse = '88' as any;
    f.medicines = [{ name: 'Ibuprofen', dose: '400 mg', qty: '6' }, { name: '  ', dose: '', qty: '' }];
    expect(component.formReady).toBeTrue();
    medical.addVisit.and.returnValue(Promise.resolve({ visit: visit({ _id: 'v2', at: '2026-11-12T09:00:00Z', complaint: 'Sprained ankle' }), patient: patient({ visitCount: 2 }) }));
    component.saveVisit();
    flushMicrotasks();
    const data = medical.addVisit.calls.mostRecent().args[1];
    expect(data.complaint).toBe('Sprained ankle');
    expect(data.medicines).toEqual([{ name: 'Ibuprofen', dose: '400 mg', qty: '6' }]);
    expect(data.vitals.pulse).toBe(88);
    expect(data.vitals.temperature).toBeNull();
    expect(data.hospital).toBe('');
    expect(component.visits.map(v => v._id)).toEqual(['v2', 'v1']);
    expect(component.form).toBeNull();
  }));

  it('needs complaint, severity and outcome before saving', fakeAsync(() => {
    start();
    component.newVisit();
    component.form!.complaint = 'Fever';
    component.form!.severity = 'minor';
    expect(component.formReady).toBeFalse();
    component.saveVisit();
    expect(medical.addVisit).not.toHaveBeenCalled();
  }));

  it('marks a resting patient as left', fakeAsync(() => {
    start();
    medical.markLeft.and.returnValue(Promise.resolve({ visit: visit({ leftAt: '2026-11-12T10:00:00Z' }), patient: patient({ restingNow: false }) }));
    component.markLeft(component.visits[0]);
    flushMicrotasks();
    expect(component.patient!.restingNow).toBeFalse();
    expect(component.visits[0].leftAt).toBeTruthy();
  }));

  it('deletes the report only after confirming, then goes to Records', fakeAsync(() => {
    medical.report.and.returnValue(Promise.resolve({ ...report(), can: { manage: true, audit: true } }));
    start();
    confirm.confirm.and.returnValue(of(false));
    component.deleteReport();
    flushMicrotasks();
    expect(medical.deleteReport).not.toHaveBeenCalled();
    confirm.confirm.and.returnValue(of(true));
    medical.deleteReport.and.returnValue(Promise.resolve({ ok: true }));
    component.deleteReport();
    flushMicrotasks();
    expect(medical.deleteReport).toHaveBeenCalledWith('p1');
    expect(router.navigate).toHaveBeenCalledWith(['/medical/records']);
  }));

  it('helpers: local datetime input and vital warnings', () => {
    expect(toLocalInput(new Date(2026, 10, 12, 9, 5))).toBe('2026-11-12T09:05');
    expect(toLocalInput(null)).toBe('');
    const w = vitalWarnings({ temperature: 37, pulse: 130, bpSys: 150, bpDia: 85, spo2: 91 });
    expect([...w].sort()).toEqual(['bpSys', 'pulse', 'spo2']);
  });

  it('emails the report with the phone password, or a typed one', fakeAsync(() => {
    start();
    medical.access.and.returnValue(Promise.resolve({ safeMode: false } as any));
    component.openEmail();
    flushMicrotasks();
    expect(component.phoneTail).toBeNull();      // phone '900' has fewer than 6 digits
    expect(component.ownPassword).toBeTrue();
    component.emailTo = 'kiran@example.com';
    expect(component.emailReady).toBeFalse();
    component.emailPassword = 'blue-river';
    expect(component.emailReady).toBeTrue();
    medical.emailReport.and.returnValue(Promise.resolve({ to: 'kiran@example.com', redirectedTo: null, password: 'typed' as const }));
    component.sendEmail();
    flushMicrotasks();
    expect(medical.emailReport).toHaveBeenCalledWith('p1', { to: 'kiran@example.com', password: 'blue-river', testRecipient: undefined });
    expect(component.panel).toBeNull();
  }));

  it('in test mode needs a tester address', fakeAsync(() => {
    medical.report.and.returnValue(Promise.resolve({ ...report(), patient: patient({ phone: '+91 98765 43210' }) }));
    start();
    medical.access.and.returnValue(Promise.resolve({ safeMode: true } as any));
    component.openEmail();
    flushMicrotasks();
    expect(component.phoneTail).toBe('543210');
    expect(component.ownPassword).toBeFalse();
    component.emailTo = 'kiran@example.com';
    expect(component.emailReady).toBeFalse();
    component.tester = 'tester@example.com';
    expect(component.emailReady).toBeTrue();
  }));

  it('from an SOS the first new visit starts with its message', fakeAsync(() => {
    history.replaceState({ sos: { message: 'Fainted near stage', phone: '', at: '' } }, '');
    try {
      medical.report.and.returnValue(Promise.resolve(report([])));
      fixture = TestBed.createComponent(MedicalPatientComponent);
      component = fixture.componentInstance;
      start();
      expect(component.form!.complaint).toBe('SOS: Fainted near stage');
      component.newVisit();
      expect(component.form!.complaint).toBe('');
    } finally {
      history.replaceState(null, '');
    }
  }));

  it('Edit details, Email report and Audit log open in the side panel; Escape closes it', fakeAsync(() => {
    medical.report.and.returnValue(Promise.resolve({ ...report(), can: { manage: true, audit: true } }));
    start();
    component.editHeader();
    fixture.detectChanges();
    expect(component.panel).toBe('edit');
    expect(fixture.nativeElement.querySelector('.panel.open .panel-title').textContent).toContain('Edit details');
    component.onEscape();
    expect(component.panel).toBeNull();
    expect(component.header).toBeNull();
    medical.audit.and.returnValue(Promise.resolve({ entries: [{ _id: 'a1', user: { _id: 'u1', name: 'Nisha' }, action: 'view_report', patientName: 'Kiran Das', at: '2026-11-12T08:00:00Z' }] }));
    component.openAudit();
    flushMicrotasks();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.panel.open').textContent).toContain('Opened the report');
    component.closePanel();
    expect(component.panelOpen).toBeFalse();
  }));
});
