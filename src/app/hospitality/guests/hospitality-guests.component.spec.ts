import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { HospitalityGuestsComponent } from './hospitality-guests.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { HospitalityService } from '../hospitality.service';
import { Guest, GuestPass } from '../hospitality.model';

const pass = (id: string, extra: Partial<GuestPass> = {}): GuestPass => ({
  _id: id, kind: 'one_day', meal: null, from: '2026-11-12', to: '2026-11-12', vegPlates: 3, nonVegPlates: 2,
  label: 'One Day · 12 Nov', revoked: false, validToday: true, ended: false, ...extra
});
const guests = (): Guest[] => [
  { _id: 'g1', name: 'Sound crew', phone: '', note: 'Echo Rentals', passes: [pass('p1')] },
  { _id: 'g2', name: 'Bus driver', phone: '98450', note: '', passes: [pass('p2', { validToday: false, ended: true })] },
  { _id: 'g3', name: 'Caterer', phone: '', note: '', passes: [] }
];

describe('HospitalityGuestsComponent', () => {
  let fixture: ComponentFixture<HospitalityGuestsComponent>;
  let component: HospitalityGuestsComponent;
  let service: jasmine.SpyObj<HospitalityService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('HospitalityService', ['getGuests', 'addGuest', 'updateGuest', 'deleteGuest', 'issuePass', 'revokePass', 'passCard']);
    service.getGuests.and.callFake(() => Promise.resolve({ today: '2026-11-12', guests: guests() }));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [HospitalityGuestsComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: ConfirmationService, useValue: confirm },
        { provide: HospitalityService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(HospitalityGuestsComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('lists guests with counts for the filters', fakeAsync(() => {
    start();
    expect(fixture.nativeElement.querySelectorAll('.hg-row').length).toBe(3);
    expect(component.counts).toEqual({ all: 3, today: 1, nopass: 2 });
    component.setFilter('today');
    expect(component.shown.map(g => g.name)).toEqual(['Sound crew']);
    component.setFilter('all');
    component.search = 'echo';
    component.apply();
    expect(component.shown.map(g => g.name)).toEqual(['Sound crew']);
  }));

  it('keeps the shown list stable between change-detection passes', fakeAsync(() => {
    start();
    const list = component.shown;
    fixture.detectChanges();
    expect(component.shown).toBe(list);
  }));

  it('a new guest needs a name, then opens the pass form', fakeAsync(() => {
    start();
    component.newGuest();
    component.saveGuest();
    expect(component.formError).toContain('Name');
    service.addGuest.and.returnValue(Promise.resolve({ _id: 'g1', name: 'Sound crew', phone: '', note: '', passes: [] }));
    component.form.name = ' Sound crew ';
    component.saveGuest();
    flushMicrotasks();
    expect(service.addGuest).toHaveBeenCalledWith('e1', { name: 'Sound crew', phone: '', note: '', gender: null });
    expect(component.selected?._id).toBe('g1');
    expect(component.issuing).toBeTrue();
  }));

  it('issues a pass with Veg / Non-veg plates (one meal sends its meal, others none)', fakeAsync(() => {
    start();
    component.open(component.shown[0]);
    component.startPass();
    component.pass = { kind: 'one_meal', meal: 'dinner', from: '2026-11-12', to: '2026-11-12', veg: 0, nonVeg: 0 };
    component.issuePass();
    expect(component.passError).toContain('at least one plate');
    component.step('nonVeg', 2);
    service.issuePass.and.returnValue(Promise.resolve(pass('p9')));
    spyOn(component, 'share');
    component.issuePass();
    flushMicrotasks();
    expect(service.issuePass).toHaveBeenCalledWith('g1', { kind: 'one_meal', meal: 'dinner', from: '2026-11-12', to: null, vegPlates: 0, nonVegPlates: 2 });
    expect(component.share).toHaveBeenCalled();
  }));

  it('revokes a pass after confirming', fakeAsync(() => {
    start();
    confirm.confirm.and.returnValue(of(true));
    service.revokePass.and.returnValue(Promise.resolve(pass('p1', { revoked: true })));
    component.revoke(component.shown[0].passes[0]);
    flushMicrotasks();
    expect(service.revokePass).toHaveBeenCalledWith('p1');
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Pass revoked');
  }));

  it('shows the server message when a guest who ate is deleted', fakeAsync(() => {
    start();
    component.open(component.shown[0]);
    confirm.confirm.and.returnValue(of(true));
    service.deleteGuest.and.returnValue(Promise.reject({ error: { message: 'This guest has already eaten' } }));
    component.deleteGuest();
    flushMicrotasks();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('This guest has already eaten');
  }));

  it('plates text and pass state', () => {
    expect(component.platesText({ vegPlates: 3, nonVegPlates: 2 })).toBe('3 Veg · 2 Non-veg');
    expect(component.platesText({ vegPlates: 0, nonVegPlates: 1 })).toBe('1 Non-veg');
    expect(component.passState(pass('x', { revoked: true }))).toBe('Revoked');
    expect(component.passState(pass('x', { validToday: false, ended: false }))).toBe('Upcoming');
  });
});
