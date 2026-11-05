import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, of } from 'rxjs';
import { HospitalityDeskComponent } from './hospitality-desk.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import { StaffBandService } from '../../core/staff-band.service';
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
  let bands: jasmine.SpyObj<StaffBandService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let dialog: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('HospitalityService', ['getDesk', 'searchStaff', 'scan', 'decide', 'notifyFlaggedTls', 'close', 'servePass', 'walkIn']);
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
        { provide: StaffBandService, useValue: bands = jasmine.createSpyObj('StaffBandService', ['get', 'link', 'replace', 'scan']) },
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

  // Hospitality H5: staff wrist bands from the person's card.
  it('links a band to the person on the card; Replace asks for a reason first', fakeAsync(() => {
    start();
    service.scan.and.returnValue(Promise.resolve({ result: 'served', person: { ...person, band: null } }));
    component.check({ user: 'u1' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(text()).toContain('No band');

    bands.scan.and.returnValue(Promise.resolve('https://wallet.example/pay?tagid=K1'));
    bands.link.and.returnValue(Promise.resolve({ band: { _id: 'b1', code: 'BIG7:K1' } }));
    component.linkBand(false);
    flushMicrotasks();
    fixture.detectChanges();
    expect(bands.link).toHaveBeenCalledWith('u1', 'e1', 'https://wallet.example/pay?tagid=K1');
    expect(text()).toContain('Band linked');

    component.linkBand(true);
    flushMicrotasks();
    expect(component.bandReasonOpen).toBeTrue();
    expect(bands.replace).not.toHaveBeenCalled();
    component.bandReason = 'Lost it';
    bands.replace.and.returnValue(Promise.resolve({ band: { _id: 'b2', code: 'BIG7:K2' } }));
    component.linkBand(true);
    flushMicrotasks();
    expect(bands.replace).toHaveBeenCalledWith('u1', 'e1', 'https://wallet.example/pay?tagid=K1', 'Lost it');
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

  it('someone not on the event\'s staff list gets a red "no meal" card (staff list R2), cleared by the next person', fakeAsync(() => {
    start();
    service.scan.and.returnValue(Promise.reject({ status: 403, error: { message: 'Ravi Off is not on the staff list for BiG 7.0', state: 'not_staff' } }));
    component.check({ user: 'u9' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(gate.notFound).toHaveBeenCalled();
    expect(notify.openErrorSnackBar).not.toHaveBeenCalled();
    const card = fixture.nativeElement.querySelector('.hd-result.duplicate') as HTMLElement;
    expect(card.textContent).toContain('Not on the staff list — no meal');
    expect(card.textContent).toContain('Ravi Off is not on the staff list for BiG 7.0');
    component.clear();
    expect(component.notStaff).toBe('');
    discardPeriodicTasks();
  }));

  const guestOut = (left: { veg: number; nonVeg: number }) => ({
    result: 'guest' as const, guest: { _id: 'g1', name: 'Sound crew', note: 'Echo Rentals' },
    pass: { _id: 'p1', label: 'One Day · 12 Nov', vegPlates: 3, nonVegPlates: 2 },
    used: { veg: 3 - left.veg, nonVeg: 2 - left.nonVeg }, left
  });

  it('a Meal Pass shows the guest card with the plates left, and serves them', fakeAsync(() => {
    start();
    service.scan.and.returnValue(Promise.resolve(guestOut({ veg: 3, nonVeg: 2 })));
    component.check({ qr: '{"t":"pass"}' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(gate.found).toHaveBeenCalled();
    expect(text()).toContain('Sound crew');
    expect(component.gVeg).toBe(3);
    expect(component.gNonVeg).toBe(2);
    component.stepGuest('gVeg', -1);
    service.servePass.and.returnValue(Promise.resolve({ ...guestOut({ veg: 1, nonVeg: 0 }), decision: 'served' }));
    component.serveGuest();
    flushMicrotasks();
    expect(service.servePass).toHaveBeenCalledWith('e1', 'p1', { veg: 2, nonVeg: 2, extra: false });
    expect(component.done).toBe('4 plates served');
    discardPeriodicTasks();
  }));

  it('a used-up Meal Pass plays Not Found and offers Block / Allow extra', fakeAsync(() => {
    start();
    service.scan.and.returnValue(Promise.resolve(guestOut({ veg: 0, nonVeg: 0 })));
    component.check({ qr: 'x' });
    flushMicrotasks();
    fixture.detectChanges();
    expect(gate.notFound).toHaveBeenCalled();
    expect(text()).toContain('All plates on this pass are used');
    expect(text()).toContain('Allow extra');
    discardPeriodicTasks();
  }));

  it('search shows guests with a pass valid now; picking one opens their card', fakeAsync(() => {
    start();
    service.searchStaff.and.returnValue(Promise.resolve({ people: [], guests: [{ guestId: 'g1', name: 'Sound crew', note: 'Echo Rentals', passId: 'p1', label: 'One Day · 12 Nov' }] }));
    component.search = 'echo';
    component.findStaff();
    flushMicrotasks();
    fixture.detectChanges();
    expect(text()).toContain('Guest · One Day · 12 Nov');
    service.scan.and.returnValue(Promise.resolve(guestOut({ veg: 3, nonVeg: 2 })));
    component.pickGuest(component.guestResults[0]);
    flushMicrotasks();
    expect(service.scan).toHaveBeenCalledWith('e1', { pass: 'p1' });
    expect(component.guest?.guest.name).toBe('Sound crew');
    discardPeriodicTasks();
  }));

  it('a walk-in guest gets a pass for the open meal', fakeAsync(() => {
    start();
    component.openWalkIn();
    component.walk.name = 'Bus driver';
    service.walkIn.and.returnValue(Promise.resolve(guestOut({ veg: 1, nonVeg: 0 })));
    component.submitWalkIn();
    flushMicrotasks();
    expect(service.walkIn).toHaveBeenCalledWith('e1', { name: 'Bus driver', note: '', vegPlates: 1, nonVegPlates: 0 });
    expect(component.walkOpen).toBeFalse();
    expect(component.guest?.guest.name).toBe('Sound crew');
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
