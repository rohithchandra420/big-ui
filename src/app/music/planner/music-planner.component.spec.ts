import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of } from 'rxjs';
import { MusicPlannerComponent } from './music-planner.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { MusicService } from '../music.service';
import { MusicData } from '../music.model';

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00`).toISOString();
const DAY1 = '2027-01-15', DAY2 = '2027-01-16';

const data = (extra: Partial<MusicData> = {}): MusicData => ({
  canEdit: true, canManage: true,
  stages: [{ _id: 'st1', name: 'Riverside Stage', notes: '', area: null, amenities: [], extraAmenities: [], slotCount: 2 }],
  acts: [
    { _id: 'a1', name: 'The Saltmarsh Choir', genre: 'Folk', contactName: 'Oren Vale', contactPhone: '98765', notes: 'Two mics', slotCount: 1 },
    { _id: 'a2', name: 'Copper Lanterns', genre: '', contactName: '', contactPhone: '', notes: '', slotCount: 1 }
  ],
  slots: [
    { _id: 's1', act: 'a1', stage: 'st1', start: at(DAY2, '19:00'), end: at(DAY2, '20:00'), soundCheckStart: at(DAY2, '17:00'), soundCheckEnd: at(DAY2, '17:45') },
    { _id: 's2', act: 'a2', stage: 'st1', start: at(DAY2, '21:00'), end: at(DAY2, '22:00'), soundCheckStart: null, soundCheckEnd: null }
  ],
  ...extra
});

describe('MusicPlannerComponent', () => {
  let fixture: ComponentFixture<MusicPlannerComponent>;
  let component: MusicPlannerComponent;
  let service: jasmine.SpyObj<MusicService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  let dp: jasmine.SpyObj<any>;
  let current: MusicData;

  beforeEach(async () => {
    current = data();
    service = jasmine.createSpyObj('MusicService', ['load', 'addSlot', 'updateSlot', 'removeSlot']);
    service.load.and.callFake(() => Promise.resolve(current));
    service.addSlot.and.callFake((_e: string, s: any) => Promise.resolve({ slot: { _id: 'new', ...s }, clashes: [] }));
    service.updateSlot.and.callFake((id: string, s: any) => Promise.resolve({ slot: { ...current.slots.find(x => x._id === id)!, ...s }, clashes: [{ kind: 'stage', slot: 's2' } as any] }));
    service.removeSlot.and.returnValue(Promise.resolve({ deleted: true }));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [MusicPlannerComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({
          _id: 'e1', name: 'BiG 7.0', startDate: new Date(2027, 0, 15).toISOString(), endDate: new Date(2027, 0, 16).toISOString() }) } },
        { provide: NotificationService, useValue: notify },
        { provide: ConfirmationService, useValue: confirm },
        { provide: MusicService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(MusicPlannerComponent);
    component = fixture.componentInstance;
    // No real calendar in unit tests: DayPilot is replaced by a stub.
    dp = jasmine.createSpyObj('Calendar', ['update', 'dispose', 'clearSelection']);
    spyOn(component as any, 'initCalendar').and.callFake(async () => { (component as any).dp = dp; });
  });

  const start = () => {
    // The minute timer (current-time line) would outlive each fake-time test: no real interval here.
    spyOn(window, 'setInterval').and.returnValue(0 as any);
    fixture.detectChanges(); flush(); fixture.detectChanges();
  };

  it('shows a slot past midnight on both days, cut at midnight and not draggable there', fakeAsync(() => {
    current = data({ slots: [
      { _id: 'late', act: 'a2', stage: 'st1', start: at(DAY1, '23:00'), end: at(DAY2, '01:30'), soundCheckStart: null, soundCheckEnd: null }
    ] });
    start();
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.mu-day')) as HTMLElement[];
    expect(tabs[0].textContent).toContain('1 slot');
    expect(tabs[1].textContent).toContain('1 slot');

    component.setDay(DAY1);
    let arg = dp.update.calls.mostRecent().args[0];
    expect(arg.events).toEqual([{ id: 'late', text: '', start: `${DAY1}T23:00:00`, end: `${DAY2}T00:00:00`, resource: 'st1' }]);
    expect(arg.businessBeginsHour).toBe(10);

    component.setDay(DAY2);
    arg = dp.update.calls.mostRecent().args[0];
    expect(arg.events).toEqual([{ id: 'late', text: '', start: `${DAY2}T00:00:00`, end: `${DAY2}T01:30:00`, resource: 'st1' }]);
    expect(arg.businessBeginsHour).toBe(0);   // starts early enough to show it
    const card: any = { id: 'late' };
    (component as any).renderItem(card);
    expect(card.moveDisabled).toBeTrue();
    expect(card.html).toContain('From the day before');
  }));

  it('shows one tab per event day with slot counts, and draws the stages as columns', fakeAsync(() => {
    start();
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.mu-day')) as HTMLElement[];
    expect(tabs.length).toBe(2);
    expect(tabs[0].textContent).toContain('0 slots');
    expect(tabs[1].textContent).toContain('2 slots');
    component.setDay(DAY2);
    const arg = dp.update.calls.mostRecent().args[0];
    expect(arg.columns).toEqual([{ id: 'st1', name: 'Riverside Stage' }]);
    // Two slots + one sound-check band.
    expect(arg.events.map((e: any) => e.id)).toEqual(['s1', 'sc:s1', 's2']);
    expect(arg.eventMoveHandling).toBe('Update');
  }));

  it('read-only: no moves, no New slot, and the panel shows details only', fakeAsync(() => {
    current = data({ canEdit: false, canManage: false });
    start();
    component.setDay(DAY2);
    expect(dp.update.calls.mostRecent().args[0].eventMoveHandling).toBe('Disabled');
    expect(fixture.nativeElement.textContent).not.toContain('+ New slot');
    component.openNew('st1', '10:00');
    expect(component.panelOpen).toBeFalse();
    component.openSlot('s1');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.mu-dl').textContent).toContain('Oren Vale');
  }));

  it('adds a slot with a sound check, and warns on a clash before saving', fakeAsync(() => {
    start();
    component.setDay(DAY2);
    component.openNew('st1', '19:30', '20:30');
    expect(component.form.start).toBe(`${DAY2}T19:30`);
    component.form.act = 'a2';
    component.checkForm();
    expect(component.formClashes.length).toBe(1);   // s1 on the same stage
    component.form.start = `${DAY2}T23:00`;
    component.form.end = `${DAY2}T23:45`;
    component.toggleSoundCheck();
    expect(component.form.scStart).toBe(`${DAY2}T22:00`);
    expect(component.form.scEnd).toBe(`${DAY2}T22:45`);
    component.save();
    flush();
    expect(service.addSlot).toHaveBeenCalledWith('e1', {
      act: 'a2', stage: 'st1', start: at(DAY2, '23:00'), end: at(DAY2, '23:45'),
      soundCheckStart: at(DAY2, '22:00'), soundCheckEnd: at(DAY2, '22:45')
    });
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Slot added');
    expect(component.panelOpen).toBeFalse();
  }));

  it('asks for the act before saving', fakeAsync(() => {
    start();
    component.openNew('st1', '10:00');
    component.save();
    expect(component.formError).toContain('Pick the act');
    expect(service.addSlot).not.toHaveBeenCalled();
  }));

  it('moving a slot moves its sound check too, and says so when it clashes', fakeAsync(() => {
    start();
    component.setDay(DAY2);
    const d = (v: string) => ({ toString: () => v }) as any;
    (component as any).moved('s1', d(`${DAY2}T20:00:00`), d(`${DAY2}T21:00:00`), null);
    flush();
    expect(service.updateSlot).toHaveBeenCalledWith('s1', {
      start: at(DAY2, '20:00'), end: at(DAY2, '21:00'), soundCheckStart: at(DAY2, '18:00'), soundCheckEnd: at(DAY2, '18:45')
    });
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Moved. Warning: it clashes with 1 other slot.');
  }));

  it('deletes a slot after the confirm', fakeAsync(() => {
    confirm.confirm.and.returnValue(of(true));
    start();
    component.openSlot('s2');
    component.remove();
    flush();
    expect(service.removeSlot).toHaveBeenCalledWith('s2');
  }));

  it('points to Setup when there are no stages', fakeAsync(() => {
    current = data({ stages: [], slots: [] });
    start();
    expect(fixture.nativeElement.querySelector('.mu-empty')).toBeTruthy();
  }));
});
