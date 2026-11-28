import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, of } from 'rxjs';
import { MedicalDeskComponent } from './medical-desk.component';
import { MedicalService } from '../medical.service';
import { MedicalLockService } from '../medical-lock.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';

const page = (patients: any[] = []) => ({ patients, total: patients.length, page: 0, pageSize: 50, counts: { patients: 3, visitsToday: 2, restingNow: 1, followUpsDue: 0, serious: 0 } });

describe('MedicalDeskComponent', () => {
  let fixture: ComponentFixture<MedicalDeskComponent>;
  let component: MedicalDeskComponent;
  let medical: jasmine.SpyObj<MedicalService>;
  let router: jasmine.SpyObj<Router>;
  let dialog: jasmine.SpyObj<MatDialog>;
  let gate: jasmine.SpyObj<GateFeedbackService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;

  beforeEach(async () => {
    medical = jasmine.createSpyObj('MedicalService', ['access', 'records', 'find', 'findBand', 'openReport', 'deskStatus', 'setDeskStatus']);
    medical.deskStatus.and.returnValue(Promise.resolve({ open: false, changedBy: '', changedAt: null }));
    medical.setDeskStatus.and.callFake((_: string, open: boolean) => Promise.resolve({ open, changedBy: 'Medic One', changedAt: '2026-11-20T08:00:00Z' }));
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    confirm.confirm.and.returnValue(of(true));
    medical.access.and.returnValue(Promise.resolve({ canUse: true, canManage: false, canAudit: false, canExport: false, locked: false, lockMinutes: 15 }));
    medical.records.and.callFake((_: string, f: any) => Promise.resolve(page(f.resting ? [{ _id: 'p9', name: 'Resting Rao', lastComplaint: 'Faint', lastSeverity: 'moderate', lastVisitAt: '2026-11-12T08:00:00Z' }] : [])));
    router = jasmine.createSpyObj('Router', ['navigate']);
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    gate = jasmine.createSpyObj('GateFeedbackService', ['unlock', 'found', 'notFound', 'error']);
    await TestBed.configureTestingModule({
      declarations: [MedicalDeskComponent],
      imports: [FormsModule],
      providers: [
        { provide: MedicalService, useValue: medical },
        { provide: MedicalLockService, useValue: jasmine.createSpyObj('MedicalLockService', ['lockNow']) },
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: GateFeedbackService, useValue: gate },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: router },
        { provide: ConfirmationService, useValue: confirm }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(MedicalDeskComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const text = () => fixture.nativeElement.textContent as string;

  it('shows the counts and who is resting now', fakeAsync(() => {
    start();
    expect(text()).toContain('Visits today');
    expect(text()).toContain('Resting Rao');
  }));

  it('B-070: the Serious card is red only when there are serious visits', fakeAsync(() => {
    const seriousCard = () => Array.from(fixture.nativeElement.querySelectorAll('.stat') as NodeListOf<HTMLElement>)
      .find(s => s.querySelector('.stat-l')!.textContent!.trim() === 'Serious')!;
    start();
    expect(seriousCard().classList).not.toContain('alert-stat');
    component.counts = { ...component.counts, serious: 2 } as any;
    fixture.detectChanges();
    expect(seriousCard().classList).toContain('alert-stat');
  }));

  it('Medical Bay switch: closed by default, opens after the confirm', fakeAsync(() => {
    start();
    const btn = () => fixture.nativeElement.querySelector('.md-bay') as HTMLButtonElement;
    expect(btn().textContent).toContain('Closed');
    btn().click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(confirm.confirm).toHaveBeenCalledWith(jasmine.objectContaining({ title: 'Open the Medical Bay?' }));
    expect(medical.setDeskStatus).toHaveBeenCalledWith('e1', true);
    expect(btn().textContent).toContain('Open');
    expect(btn().classList).toContain('on');
  }));

  it('Medical Bay switch: nothing changes when the confirm is cancelled', fakeAsync(() => {
    confirm.confirm.and.returnValue(of(false));
    start();
    (fixture.nativeElement.querySelector('.md-bay') as HTMLButtonElement).click();
    flushMicrotasks();
    expect(medical.setDeskStatus).not.toHaveBeenCalled();
  }));

  it('searches after a pause and opens an existing report', fakeAsync(() => {
    start();
    medical.find.and.returnValue(Promise.resolve({ people: [{ kind: 'participant', passId: 'pa', name: 'Asha', detail: 'Festival Ticket', reportId: 'r1' }] }));
    component.q = 'as';
    component.onSearch();
    tick(300);
    flushMicrotasks();
    fixture.detectChanges();
    expect(medical.find).toHaveBeenCalledWith('e1', 'as');
    component.open(component.results![0]);
    expect(router.navigate).toHaveBeenCalledWith(['/medical/patients', 'r1']);
    expect(medical.openReport).not.toHaveBeenCalled();
  }));

  it('starts a report for someone without one', fakeAsync(() => {
    start();
    medical.openReport.and.returnValue(Promise.resolve({ patient: { _id: 'new1' } as any, existing: false }));
    component.open({ kind: 'staff', userId: 'u5', name: 'Omar', detail: 'Staff', reportId: null });
    flushMicrotasks();
    expect(medical.openReport).toHaveBeenCalledWith('e1', 'staff', { user: 'u5' });
    expect(router.navigate).toHaveBeenCalledWith(['/medical/patients', 'new1']);
  }));

  it('a scanned band opens its owner, an unknown band says why', fakeAsync(() => {
    start();
    dialog.open.and.returnValue({ afterClosed: () => of('BAND-1') } as any);
    medical.findBand.and.returnValue(Promise.resolve({ person: { kind: 'participant', passId: 'pa', name: 'Asha', detail: '', reportId: 'r1' } }));
    component.scan();
    flushMicrotasks();
    expect(gate.found).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/medical/patients', 'r1']);

    medical.findBand.and.returnValue(Promise.reject({ status: 404, error: { message: "This band isn't linked to anyone." } }));
    component.scan();
    flushMicrotasks();
    expect(gate.notFound).toHaveBeenCalled();
    expect(component.scanMessage).toContain("isn't linked");
  }));

  it('a walk-in under 18 is saved with the guardian', fakeAsync(() => {
    start();
    component.q = 'Ravi';
    component.startWalkIn();
    expect(component.walkIn.name).toBe('Ravi');
    component.walkIn.age = 12;
    component.walkIn.guardianName = 'Meena';
    expect(component.walkInMinor).toBeTrue();
    medical.openReport.and.returnValue(Promise.resolve({ patient: { _id: 'w1' } as any, existing: false }));
    component.saveWalkIn();
    flushMicrotasks();
    const args = medical.openReport.calls.mostRecent().args;
    expect(args[1]).toBe('walkin');
    expect(args[2]).toEqual(jasmine.objectContaining({ name: 'Ravi', age: 12, guardian: { name: 'Meena', phone: '', contacted: false } }));
    expect(router.navigate).toHaveBeenCalledWith(['/medical/patients', 'w1']);
  }));

  it('from an SOS: shows it, searches the phone, and hands it to the report', fakeAsync(() => {
    history.replaceState({ sos: { message: 'Fainted near stage', phone: '+91 98765 43210', at: '2026-11-12T05:00:00Z' } }, '');
    try {
      medical.find.and.returnValue(Promise.resolve({ people: [] }));
      fixture = TestBed.createComponent(MedicalDeskComponent);
      component = fixture.componentInstance;
      start();
      tick(300);
      flushMicrotasks();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.md-sos').textContent).toContain('Fainted near stage');
      expect(medical.find).toHaveBeenCalledWith('e1', '9876543210');
      component.startWalkIn();
      expect(component.walkIn.phone).toBe('+91 98765 43210');
      expect(component.walkIn.name).toBe('');
      component.open({ kind: 'walkin', name: 'X', detail: '', reportId: 'r9' });
      expect(router.navigate).toHaveBeenCalledWith(['/medical/patients', 'r9'], { state: { sos: jasmine.objectContaining({ message: 'Fainted near stage' }) } });
    } finally {
      history.replaceState(null, '');
    }
  }));
});
