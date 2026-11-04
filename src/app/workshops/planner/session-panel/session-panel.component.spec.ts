import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { of } from 'rxjs';
import { SessionPanelComponent } from './session-panel.component';
import { WorkshopService } from '../../workshop.service';
import { NotificationService } from '../../../core/notification.service';
import { ConfirmationService } from '../../../shared/confirm-dialog/confirmation.service';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';
import { WorkshopSchedule, WorkshopSession } from '../../workshops.model';
import { toInstant } from '../../planner.utils';

const DAY = '2027-01-15';
const at = (t: string) => toInstant(DAY, t);
const music = { _id: 'c1', name: 'Music', colour: '#7c3aed', icon: 'music_note' };
const drums: WorkshopSession = {
  _id: 's1', event: 'e1',
  workshop: { _id: 'w1', title: 'Hand Drumming', category: music, facilitators: ['Ravi Kannan'] },
  venue: { _id: 'v1', name: 'Bamboo Dome', capacity: 40 },
  start: at('10:00'), end: at('11:30'), regOpensAt: null, regClosesAt: null, regManual: null,
  cutoffAt: at('09:40'), preRegLimit: null, facilitatorsOverride: [], status: 'scheduled'
};
const schedule = (extra: Partial<WorkshopSchedule> = {}): WorkshopSchedule => ({
  event: { _id: 'e1', name: 'BiG 7.0', startDate: null, endDate: null },
  sessions: [drums],
  venues: [{ _id: 'v1', name: 'Bamboo Dome', capacity: 40 }, { _id: 'v2', name: 'River Deck', capacity: 20 }],
  workshops: [drums.workshop, { _id: 'w2', title: 'Clay', category: null, facilitators: [] }],
  canManage: true, canRun: true, ...extra
});

describe('SessionPanelComponent', () => {
  let fixture: ComponentFixture<SessionPanelComponent>;
  let component: SessionPanelComponent;
  let service: jasmine.SpyObj<WorkshopService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('WorkshopService', ['addSession', 'updateSession', 'deleteSession', 'setRegistration', 'setDoor']);
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [SessionPanelComponent, AppSelectComponent, AppOptionComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: WorkshopService, useValue: service },
        { provide: NotificationService, useValue: notify },
        { provide: ConfirmationService, useValue: confirm }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(SessionPanelComponent);
    component = fixture.componentInstance;
    component.days = [{ date: DAY, label: 'Fri 15 Jan', sub: 'Day 1' }];
  });

  const open = (session: WorkshopSession | null, sc = schedule(), prefill: any = null) => {
    component.schedule = sc;
    component.session = session;
    component.prefill = prefill;
    component.ngOnChanges({ session: new SimpleChange(undefined, session, true) });
    fixture.detectChanges();
  };
  const el = () => fixture.nativeElement as HTMLElement;
  const actions = () => Array.from(el().querySelectorAll('.panel-actions button')).map(b => b.textContent!.trim());

  it('shows a session: venue, facilitators, cut-off, and Close · Delete · Edit for the Workshop TL', () => {
    open(drums);
    expect(el().querySelector('.panel-title')!.textContent).toContain('Hand Drumming');
    expect(el().textContent).toContain('Bamboo Dome');
    expect(el().textContent).toContain('Ravi Kannan');
    expect(el().textContent).toContain('09:40');
    expect(actions()).toEqual(['Close', 'Delete', 'edit Edit']);
  });

  it('lights up "Open" when registration is open by the times (not "Follow times")', () => {
    // 2027: registration opens straight away and closes at the 09:40 cut-off, so it's open now.
    open(drums);
    const on = Array.from(el().querySelectorAll('.reg:not(.door) .seg button.on')).map(b => b.textContent!.trim());
    expect(on).toEqual(['Open']);
    expect(el().querySelector('.reg:not(.door) .reg-text')!.textContent).toContain('Following the times');
    expect(el().querySelector('.reg:not(.door) .reg-text')!.textContent).toContain('Closes at 09:40');
  });

  it('no cut-off set: it is 15 minutes before the start, and registration closes then', () => {
    open({ ...drums, cutoffAt: null });
    expect(component.time(component.cutoff)).toBe('09:45');
    expect(component.time(component.regCloses)).toBe('09:45');
    expect(el().textContent).toContain('(15 min before the start)');
  });

  it('the door: closed until registration closes; staff close it by hand (red, nobody let in)', fakeAsync(() => {
    open(drums);
    expect(component.doorOpen).toBeFalse();
    expect(component.doorTitle).toBe('Entry closed: opens at 09:40');
    const doorOn = () => Array.from(el().querySelectorAll('.reg.door .seg button.on')).map(b => b.textContent!.trim());
    expect(doorOn()).toEqual(['Entry closed']);

    // Closing a door that's already closed by the times: nothing to send.
    service.setDoor.and.returnValue(Promise.resolve({ session: drums }));
    component.setDoor(false);
    expect(service.setDoor).not.toHaveBeenCalled();
    component.setDoor(true);
    flushMicrotasks();
    expect(service.setDoor).toHaveBeenCalledWith('s1', { open: true });

    open({ ...drums, doorManual: false, doorManualAt: at('09:00') });
    expect(component.doorTitle).toBe('Entry closed by staff: nobody else is let in');
    expect(el().querySelector('.reg.door')!.classList).toContain('shut');
  }));

  it('"Show places left on the map" switch', fakeAsync(() => {
    service.setDoor.and.returnValue(Promise.resolve({ session: drums }));
    open(drums);
    component.setShowPlaces(false);
    flushMicrotasks();
    expect(service.setDoor).toHaveBeenCalledWith('s1', { showPlacesLeft: false });
  }));

  it('checks the order of the times: registration close ≤ cut-off < start', () => {
    const v = (x: any) => component.problem({ start: '10:00', end: '11:00', regOpens: '', regCloses: '', cutoff: '', ...x });
    expect(v({ cutoff: '10:05' })).toBe('The cut-off must be before the start');
    expect(v({ cutoff: '10:00' })).toBe('The cut-off must be before the start');
    expect(v({ cutoff: '09:40', regCloses: '09:50' })).toBe('Registration must close by the cut-off');
    expect(v({ regCloses: '09:50' })).toContain('15 minutes before the start');
    expect(v({ regOpens: '09:50' })).toBe('Registration must close after it opens');
    expect(v({ regOpens: '09:00', regCloses: '09:30', cutoff: '09:45' })).toBeNull();
    expect(v({ regCloses: '09:45' })).toBeNull();
  });

  it('a Workshop volunteer gets the registration switch but no Edit / Delete', () => {
    open(drums, schedule({ canManage: false, canRun: true }));
    expect(actions()).toEqual(['Close']);
    expect(el().querySelector('.seg')).toBeTruthy();
  });

  it('someone outside the Workshop team only sees it', () => {
    open(drums, schedule({ canManage: false, canRun: false }));
    expect(el().querySelector('.seg')).toBeNull();
  });

  it('the switch closes registration by hand; picking what the times say goes back to them', fakeAsync(() => {
    const changed = spyOn(component.changed, 'emit');
    service.setRegistration.and.returnValue(Promise.resolve({ session: drums }));
    open(drums);   // open by the times
    component.setRegistration(true); // already open by the times: nothing to do
    component.setRegistration(null);
    expect(service.setRegistration).not.toHaveBeenCalled();
    component.setRegistration(false);
    flushMicrotasks();
    expect(service.setRegistration).toHaveBeenCalledWith('s1', false);
    expect(changed).toHaveBeenCalledWith('s1');

    open({ ...drums, regManual: false });
    component.setRegistration(true);  // the times say open: hand it back to them
    flushMicrotasks();
    expect(service.setRegistration).toHaveBeenCalledWith('s1', null);
  }));

  it('a substitute is shown instead of the usual facilitator', () => {
    open({ ...drums, facilitatorsOverride: ['Mira Joshi'] });
    expect(el().textContent).toContain('Mira Joshi');
    expect(el().textContent).toContain('usually Ravi Kannan');
  });

  it('a new session starts from the empty slot that was selected', () => {
    open(null, schedule(), { venue: 'v2', day: DAY, start: '14:00', end: '15:30' });
    expect(component.mode).toBe('create');
    expect(component.form.getRawValue()).toEqual(jasmine.objectContaining({ venue: 'v2', day: DAY, start: '14:00', end: '15:30' }));
  });

  it('a new session gets default times: registration 1 h before, closes 30 min before, cut-off 15 min before', () => {
    open(null, schedule(), { venue: 'v2', day: DAY, start: '14:00', end: '15:30' });
    expect(component.form.getRawValue()).toEqual(jasmine.objectContaining({ regOpens: '13:00', regCloses: '13:30', cutoff: '13:45' }));
  });

  it('moving the start moves the end, registration and cut-off by the same amount (empty ones stay empty)', () => {
    open({ ...drums, regOpensAt: at('09:00'), regClosesAt: null });   // start 10:00, end 11:30, cut-off 09:40
    component.edit();
    component.form.controls.start.setValue('11:00');
    component.onStartChange();
    expect(component.form.getRawValue()).toEqual(jasmine.objectContaining({
      start: '11:00', end: '12:30', regOpens: '10:00', regCloses: '', cutoff: '10:40'
    }));
  });

  it('warns before saving: overlap in the venue, same workshop that day, limit over capacity', () => {
    open(null, schedule(), { venue: 'v1', day: DAY, start: '11:00', end: '12:00' });
    component.form.patchValue({ workshop: 'w1', limit: 50 });
    expect(component.draftWarnings).toEqual([
      'Overlaps "Hand Drumming" in this venue (10:00–11:30)',
      'This workshop already runs that day at 10:00',
      "The limit is above the venue's capacity (40)"
    ]);
  });

  it('adds a session with its times as instants and the substitutes as a list', fakeAsync(() => {
    service.addSession.and.returnValue(Promise.resolve({ session: { ...drums, _id: 's9' }, warnings: [] }));
    open(null, schedule(), { venue: 'v2', day: DAY, start: '14:00', end: '15:00' });
    component.form.patchValue({ workshop: 'w2', regOpens: '12:00', cutoff: '13:50', substitutes: 'Mira Joshi,  Ann Lee ,' });
    component.save();
    flushMicrotasks();
    expect(service.addSession).toHaveBeenCalledWith('e1', {
      workshop: 'w2', venue: 'v2', start: at('14:00'), end: at('15:00'),
      regOpensAt: at('12:00'), regClosesAt: at('13:30'), cutoffAt: at('13:50'),
      preRegLimit: null, facilitatorsOverride: ['Mira Joshi', 'Ann Lee']
    });
    expect(component.mode).toBe('view');
  }));

  it('refuses times out of order before sending', () => {
    open(null, schedule(), { venue: 'v1', day: DAY, start: '14:00', end: '13:00' });
    component.save();
    expect(service.addSession).not.toHaveBeenCalled();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('The end must be after the start');
  });

  it('shows the server warnings after saving', fakeAsync(() => {
    service.updateSession.and.returnValue(Promise.resolve({ session: drums, warnings: ["It's outside the event's dates"] }));
    open(drums);
    component.edit();
    component.save();
    flushMicrotasks();
    fixture.detectChanges();
    expect(el().querySelector('.warns')!.textContent).toContain("It's outside the event's dates");
  }));

  it('deletes after confirming', fakeAsync(() => {
    const closed = spyOn(component.closed, 'emit');
    confirm.confirm.and.returnValue(of(true));
    service.deleteSession.and.returnValue(Promise.resolve({}));
    open(drums);
    component.remove();
    flushMicrotasks();
    expect(service.deleteSession).toHaveBeenCalledWith('s1');
    expect(closed).toHaveBeenCalled();
  }));
});
