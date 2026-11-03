import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, of } from 'rxjs';
import { HospitalityDeskComponent } from './hospitality-desk.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import { HospitalityService } from '../hospitality.service';
import { DeskPerson, DeskState } from '../hospitality.model';

const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m).toISOString();
const person: DeskPerson = { _id: 'u1', name: 'Kavya Iyer', role: 'VOL', department: { _id: 'd1', name: 'Stage Crew' }, foodPreference: 'veg', avatarVersion: 0 };
const open = (): DeskState => ({
  open: { meal: 'lunch', label: 'Lunch', date: '2026-11-12', start: at(12, 30), end: at(15), served: 87, expected: 200 },
  recent: [{ _id: 's1', name: 'Kavya Iyer', decision: 'served', reason: '', at: at(13, 41) }],
  flaggedToReport: 2
});

describe('HospitalityDeskComponent', () => {
  let fixture: ComponentFixture<HospitalityDeskComponent>;
  let component: HospitalityDeskComponent;
  let service: jasmine.SpyObj<HospitalityService>;
  let gate: jasmine.SpyObj<GateFeedbackService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let dialog: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('HospitalityService', ['getDesk', 'searchStaff', 'scan', 'decide', 'notifyFlaggedTls', 'close']);
    service.getDesk.and.callFake(() => Promise.resolve(open()));
    gate = jasmine.createSpyObj('GateFeedbackService', ['unlock', 'found', 'notFound', 'error']);
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    await TestBed.configureTestingModule({
      declarations: [HospitalityDeskComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: GateFeedbackService, useValue: gate },
        { provide: MatDialog, useValue: dialog },
        { provide: HospitalityService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(HospitalityDeskComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const text = () => fixture.nativeElement.textContent as string;

  it('shows the open meal, plates served and the log', fakeAsync(() => {
    start();
    expect(text()).toContain('Lunch is open');
    expect(text()).toContain('of 200 served');
    expect(text()).toContain('Kavya Iyer');
    expect(text()).toContain('Notify TLs (2)');
    discardPeriodicTasks();
  }));

  it('says closed and disables scanning when no meal is open', fakeAsync(() => {
    service.getDesk.and.returnValue(Promise.resolve({ open: null, next: 'Closed · Snacks at 16:30' }));
    start();
    expect(text()).toContain('Mess Hall closed');
    expect(fixture.nativeElement.querySelector('.hd-scanbtn').disabled).toBeTrue();
    discardPeriodicTasks();
  }));

  it('a scanned staff QR that is marked is served, with the Found sound', fakeAsync(() => {
    start();
    dialog.open.and.returnValue({ afterClosed: () => of('{"t":"staff"}') } as any);
    service.scan.and.returnValue(Promise.resolve({ result: 'served', person }));
    component.scanQr();
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.scan).toHaveBeenCalledWith('e1', { qr: '{"t":"staff"}' });
    expect(gate.found).toHaveBeenCalled();
    expect(text()).toContain('Enjoy your meal');
    discardPeriodicTasks();
  }));

  it('not marked: Serve needs a reason, then records it', fakeAsync(() => {
    start();
    service.scan.and.returnValue(Promise.resolve({ result: 'flag', person, slot: 'morning', teamLeads: ['Arjun Pillai'] }));
    service.decide.and.returnValue(Promise.resolve({ decision: 'served_flagged', person }));
    component.check({ user: 'u1' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(gate.notFound).toHaveBeenCalled();
    expect(text()).toContain('No attendance marked for the morning slot');
    expect(text()).toContain('TL: Arjun Pillai');
    component.decide('serve');
    expect(service.decide).not.toHaveBeenCalled();
    component.reason = 'Other';
    component.otherReason = '  Rain  ';
    component.decide('serve');
    flushMicrotasks();
    expect(service.decide).toHaveBeenCalledWith('e1', 'u1', 'serve', 'Rain');
    expect(component.done).toBe('Served');
    discardPeriodicTasks();
  }));

  it('already ate: Block is recorded without a reason', fakeAsync(() => {
    start();
    service.scan.and.returnValue(Promise.resolve({ result: 'duplicate', person, lastServedAt: at(13, 2), lastServedBy: 'Rehan Bhatt' }));
    service.decide.and.returnValue(Promise.resolve({ decision: 'blocked', person }));
    component.check({ user: 'u1' });
    flushMicrotasks();
    component.decide('block');
    flushMicrotasks();
    expect(service.decide).toHaveBeenCalledWith('e1', 'u1', 'block', undefined);
    expect(component.done).toBe('Blocked');
    discardPeriodicTasks();
  }));

  it('a replaced or unknown QR shows the server message with the Not Found sound', fakeAsync(() => {
    start();
    service.scan.and.returnValue(Promise.reject({ status: 404, error: { message: 'This QR has been replaced' } }));
    component.check({ qr: 'x' });
    flushMicrotasks();
    expect(gate.notFound).toHaveBeenCalled();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('This QR has been replaced');
    discardPeriodicTasks();
  }));

  it('reports flagged people to their TLs', fakeAsync(() => {
    start();
    service.notifyFlaggedTls.and.returnValue(Promise.resolve({ tls: 2, people: 3, delivered: 2 }));
    component.notifyTls();
    flushMicrotasks();
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('3 people reported to 2 Team Leads (a Task on their Billboard)');
    discardPeriodicTasks();
  }));
});
