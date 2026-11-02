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
  cutoffAt: at('10:10'), preRegLimit: null, facilitatorsOverride: [], status: 'scheduled'
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
    service = jasmine.createSpyObj('WorkshopService', ['addSession', 'updateSession', 'deleteSession', 'setRegistration']);
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
    expect(el().textContent).toContain('10:10');
    expect(actions()).toEqual(['Close', 'Delete', 'edit Edit']);
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

  it('the switch opens registration by hand, and can hand it back to the times', fakeAsync(() => {
    const changed = spyOn(component.changed, 'emit');
    service.setRegistration.and.returnValue(Promise.resolve({ session: drums }));
    open(drums);
    component.setRegistration(true);
    flushMicrotasks();
    expect(service.setRegistration).toHaveBeenCalledWith('s1', true);
    expect(changed).toHaveBeenCalledWith('s1');
    component.setRegistration(null); // already following the times: nothing to do
    expect(service.setRegistration).toHaveBeenCalledTimes(1);
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
    component.form.patchValue({ workshop: 'w2', regOpens: '12:00', cutoff: '14:10', substitutes: 'Mira Joshi,  Ann Lee ,' });
    component.save();
    flushMicrotasks();
    expect(service.addSession).toHaveBeenCalledWith('e1', {
      workshop: 'w2', venue: 'v2', start: at('14:00'), end: at('15:00'),
      regOpensAt: at('12:00'), regClosesAt: null, cutoffAt: at('14:10'),
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
