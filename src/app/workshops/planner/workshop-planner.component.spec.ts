import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WorkshopPlannerComponent } from './workshop-planner.component';
import { EventService } from '../../core/event.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { WorkshopService } from '../workshop.service';
import { WorkshopSchedule } from '../workshops.model';
import { toInstant } from '../planner.utils';

const at = (day: string, t: string) => toInstant(day, t);
const schedule = (extra: Partial<WorkshopSchedule> = {}): WorkshopSchedule => ({
  event: { _id: 'e1', name: 'BiG 7.0', startDate: new Date(2027, 0, 15).toISOString(), endDate: new Date(2027, 0, 16).toISOString() },
  sessions: [
    { _id: 's1', event: 'e1', workshop: { _id: 'w1', title: 'Hand Drumming', category: { _id: 'c1', name: 'Music', colour: '#7c3aed', icon: 'music_note' }, facilitators: [] },
      venue: { _id: 'v1', name: 'Bamboo Dome', capacity: 40 }, start: at('2027-01-16', '10:00'), end: at('2027-01-16', '11:00'),
      regOpensAt: null, regClosesAt: null, regManual: null, cutoffAt: null, preRegLimit: null, facilitatorsOverride: [], status: 'scheduled' }
  ],
  venues: [{ _id: 'v1', name: 'Bamboo Dome', capacity: 40 }],
  workshops: [],
  canManage: true, canRun: true, ...extra
});

describe('WorkshopPlannerComponent', () => {
  let fixture: ComponentFixture<WorkshopPlannerComponent>;
  let component: WorkshopPlannerComponent;
  let service: jasmine.SpyObj<WorkshopService>;
  let dp: jasmine.SpyObj<any>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('WorkshopService', ['getSchedule', 'updateSession', 'getLive']);
    service.getLive.and.callFake(() => Promise.resolve({ now: '', live: [] }));
    service.getSchedule.and.callFake(() => Promise.resolve(schedule()));
    await TestBed.configureTestingModule({
      declarations: [WorkshopPlannerComponent],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: AuthService, useValue: { currentUser: { role: 'TL' }, canPlanWorkshops: () => true } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: WorkshopService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(WorkshopPlannerComponent);
    component = fixture.componentInstance;
    // No real calendar in unit tests: DayPilot is replaced by a stub.
    dp = jasmine.createSpyObj('Calendar', ['update', 'dispose', 'clearSelection']);
    spyOn(component as any, 'initCalendar').and.callFake(async () => { (component as any).dp = dp; });
  });

  const start = () => {
    // The live refresh timer would outlive each fake-time test: no real interval here.
    spyOn(window, 'setInterval').and.returnValue(0 as any);
    fixture.detectChanges(); flush(); fixture.detectChanges();
  };

  it('shows one tab per event day, with session counts', fakeAsync(() => {
    start();
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.wp-day')) as HTMLElement[];
    expect(tabs.length).toBe(2);
    expect(tabs[1].textContent).toContain('1 session');
  }));

  it('draws the venues as columns and the day\'s sessions, editable for the Workshop TL', fakeAsync(() => {
    start();
    component.setDay('2027-01-16');
    const opts = dp.update.calls.mostRecent().args[0];
    expect(opts.columns).toEqual([{ id: 'v1', name: 'Bamboo Dome' }]);
    expect(opts.events.map((e: any) => e.id)).toEqual(['s1']);
    expect(opts.events[0].start).toBe('2027-01-16T10:00:00');
    expect(opts.eventMoveHandling).toBe('Update');
    expect(opts.timeRangeSelectedHandling).toBe('Enabled');
  }));

  it('is read-only on the calendar for everyone else', fakeAsync(() => {
    service.getSchedule.and.callFake(() => Promise.resolve(schedule({ canManage: false })));
    start();
    const opts = dp.update.calls.mostRecent().args[0];
    expect(opts.eventMoveHandling).toBe('Disabled');
    expect(opts.timeRangeSelectedHandling).toBe('Disabled');
    expect(fixture.nativeElement.querySelector('.page-ph .btn-cta')).toBeNull();
  }));

  it('a session opens the side panel; New session opens an empty one for the day shown', fakeAsync(() => {
    start();
    component.openSession('s1');
    expect(component.panelOpen).toBeTrue();
    expect(component.panelSession!._id).toBe('s1');
    component.closePanel();
    component.openNew();
    expect(component.panelSession).toBeNull();
    expect(component.panelPrefill!.day).toBe(component.day);
  }));

  it('phones: tapping an empty slot opens New session there, one hour long', fakeAsync(() => {
    start();
    component.tapSlot('v1', '14:30');
    expect(component.panelOpen).toBeTrue();
    expect(component.panelSession).toBeNull();
    expect(component.panelPrefill).toEqual(jasmine.objectContaining({ venue: 'v1', day: component.day, start: '14:30', end: '15:30' }));
    component.closePanel();
    component.tapSlot('v1', '23:30');   // never past the end of the day
    expect(component.panelPrefill!.end).toBe('23:55');
    component.closePanel();
    component.tapSlot('v1', 'bad');
    expect(component.panelOpen).toBeFalse();
  }));

  it('points to Setup when the event has no venues yet', fakeAsync(() => {
    service.getSchedule.and.callFake(() => Promise.resolve(schedule({ venues: [], sessions: [] })));
    start();
    expect(fixture.nativeElement.querySelector('.wp-empty').textContent).toContain('No workshop venues');
  }));

  it('without event dates, shows the days that have sessions and a hint', fakeAsync(() => {
    service.getSchedule.and.callFake(() => Promise.resolve(schedule({ event: { _id: 'e1', name: 'BiG 7.0', startDate: null, endDate: null } })));
    start();
    expect(component.days.map(d => d.date)).toEqual(['2027-01-16']);
    expect(fixture.nativeElement.textContent).toContain('has no dates yet');
  }));

  describe('the Now row: now → later today', () => {
    const M = 60000;
    const iso = (m: number) => new Date(Date.now() + m * M).toISOString();
    const base = schedule().sessions[0];
    const s = (id: string, title: string, from: number, to: number, extra: any = {}) =>
      ({ ...base, _id: id, workshop: { ...base.workshop, title }, start: iso(from), end: iso(to), ...extra });
    const today = (sessions: any[]) => schedule({ event: { _id: 'e1', name: 'BiG 7.0', startDate: null, endDate: null }, sessions });

    it('running first, then the rest of today in order; ended and other days left out', fakeAsync(() => {
      service.getSchedule.and.callFake(() => Promise.resolve(today([
        s('later', 'Clay', 120, 180),
        s('now', 'Hand Drumming', -30, 30, { counts: { pre: 5, wait: 0, walkin: 0, attended: 10 } }),
        s('done', 'Early Yoga', -120, -60),
        s('soon', 'Songwriting', 45, 105)
      ])));
      service.getLive.and.callFake(() => Promise.resolve({ now: '', live: [{
        session: 'now', start: iso(-30), end: iso(30), workshop: { _id: 'w1', title: 'Hand Drumming', category: null },
        venue: { _id: 'v1', name: 'Bamboo Dome', capacity: 40, area: null }, attended: 40, placesLeft: 0
      }] }));
      start();
      expect(component.nowRow.map(c => c.id)).toEqual(['now', 'soon', 'later']);
      const cards = Array.from(fixture.nativeElement.querySelectorAll('.wp-now-card')) as HTMLElement[];
      expect(cards[0].classList).toContain('running');
      expect(cards[0].textContent).toContain('40/40 in');         // the live figure wins
      expect(cards[1].textContent).toContain('Reg open');          // same words as the Venue Map
      expect(cards[1].querySelector('.vm-live')!.classList).toContain('pulse');
      cards[1].click();
      expect(component.panelSession!._id).toBe('soon');
    }));

    it('stays shown when nothing is left today', fakeAsync(() => {
      service.getSchedule.and.callFake(() => Promise.resolve(today([s('done', 'Early Yoga', -120, -60)])));
      start();
      expect(fixture.nativeElement.querySelector('.wp-now').textContent).toContain('Nothing else today');
    }));
  });

  it('the current-time line falls in the cell that holds now', () => {
    const now = new Date(2027, 0, 16, 10, 15);
    expect(component.nowIn('2027-01-16T10:00:00', '2027-01-16T10:30:00', now)).toBe(50);
    expect(component.nowIn('2027-01-16T10:30:00', '2027-01-16T11:00:00', now)).toBeNull();
    expect(component.nowIn('2027-01-15T10:00:00', '2027-01-15T10:30:00', now)).toBeNull();
  });

  it('dragging to a new time moves registration and the cut-off with it', fakeAsync(() => {
    const timed = schedule();
    timed.sessions[0] = { ...timed.sessions[0], regOpensAt: at('2027-01-16', '09:00'), regClosesAt: at('2027-01-16', '09:30'), cutoffAt: at('2027-01-16', '09:45') };
    service.getSchedule.and.callFake(() => Promise.resolve(timed));
    service.updateSession.and.returnValue(Promise.resolve({ session: timed.sessions[0], warnings: [] }));
    start();
    component.setDay('2027-01-16');
    const d = (t: string) => ({ toString: () => t }) as any;
    (component as any).moved('s1', d('11:00'), d('12:00'), null);
    flush();
    expect(service.updateSession).toHaveBeenCalledWith('s1', {
      start: at('2027-01-16', '11:00'), end: at('2027-01-16', '12:00'),
      regOpensAt: at('2027-01-16', '10:00'), regClosesAt: at('2027-01-16', '10:30'), cutoffAt: at('2027-01-16', '10:45')
    });
  }));
});
