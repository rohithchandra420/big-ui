import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { VolunteersComponent } from './volunteers.component';
import { SlidePanelComponent } from '../shared/slide-panel/slide-panel.component';
import { EventService } from '../core/event.service';
import { NotificationService } from '../core/notification.service';
import { VolunteersService } from './volunteers.service';
import { VolBoard, VolProfile, Volunteer } from './volunteers.model';

const vol = (id: string, name: string, department: string | null, marked = true): Volunteer => ({
  _id: id, name, avatarVersion: 0, department, unassigned: !department, phone: '', dateOfJoining: null,
  today: { morning: marked, afternoon: false, night: false }, marked
});

const profile: VolProfile = {
  _id: '1', name: 'Anil', email: 'anil@example.com', phone: '+919000000001', avatarVersion: 0, department: null, unassigned: true,
  dateOfJoining: '2026-11-10T00:00:00.000Z', foodPreference: 'veg', gender: 'Male', stay: null, band: false, meals: 4,
  attendance: [{ date: '2026-11-13', morning: true, afternoon: false, night: false }, { date: '2026-11-14', morning: false, afternoon: false, night: false }]
};

describe('VolunteersComponent', () => {
  let fixture: ComponentFixture<VolunteersComponent>;
  let component: VolunteersComponent;
  let service: jasmine.SpyObj<VolunteersService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let canAssign: boolean;
  const el = () => fixture.nativeElement as HTMLElement;

  const board = (): VolBoard => ({
    today: '2026-11-14', canAssign, pool: { _id: 'p', name: 'Volunteer' },
    departments: [
      { _id: 'd1', name: 'Decor', key: 'general', tls: [], needed: 0, canSetNeed: false },
      { _id: 'd2', name: 'WASH', key: 'wash', tls: ['Lead One'], needed: 3, canSetNeed: true }
    ],
    volunteers: [vol('1', 'Anil', null), vol('2', 'Bela', null, false), vol('3', 'Chand', 'd2')]
  });

  beforeEach(async () => {
    canAssign = true;
    service = jasmine.createSpyObj('VolunteersService', ['board', 'assign', 'profile', 'setNeed']);
    service.board.and.callFake(() => Promise.resolve(board()));
    service.profile.and.returnValue(Promise.resolve(profile));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    await TestBed.configureTestingModule({
      declarations: [VolunteersComponent, SlidePanelComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: VolunteersService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(VolunteersComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('shows the Unassigned pool next to the department cards, with have / needed', fakeAsync(() => {
    start();
    expect(service.board).toHaveBeenCalledWith('e1');
    expect(el().querySelectorAll('.vl-pool .vl-chip').length).toBe(2);
    expect(el().querySelector('.vl-pool .vl-count')!.textContent).toContain('2');
    const lanes = el().querySelectorAll('.vl-lane');
    expect(lanes.length).toBe(2);
    expect(lanes[1].querySelector('.vl-count')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('1 / 3');
    expect(lanes[1].querySelector('.vl-need')!.textContent).toContain('2 short');
    expect(lanes[1].querySelector('.vl-edit')).not.toBeNull();   // may set this department's number
    expect(lanes[0].querySelector('.vl-edit')).toBeNull();
    expect(component.view.stats).toEqual({ all: 3, unassigned: 2, stillNeeded: 2, notMarked: 1 });
  }));

  it('moves the picked volunteers to the chosen department and reloads', fakeAsync(() => {
    start();
    component.toggle(component.board!.volunteers[0]);
    component.toggle(component.board!.volunteers[1]);
    fixture.detectChanges();
    expect(el().querySelector('.vl-selbar')!.textContent).toContain('2 picked');
    expect(component.destinations.map(d => d.name)).toEqual(['Unassigned', 'Decor', 'WASH']);

    service.assign.and.returnValue(Promise.resolve({ moved: 2, skipped: 0, department: { _id: 'd2', name: 'WASH' } }));
    component.moveSelected('d2');
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.assign).toHaveBeenCalledWith('e1', ['1', '2'], 'd2');
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('2 volunteers moved to WASH');
    expect(component.selected.size).toBe(0);
    expect(service.board).toHaveBeenCalledTimes(2);
    expect(el().querySelector('.vl-selbar')).toBeNull();
  }));

  it('frees a volunteer dropped on the pool', fakeAsync(() => {
    start();
    service.assign.and.returnValue(Promise.resolve({ moved: 1, skipped: 0, department: { _id: 'p', name: 'Volunteer' } }));
    const data = new DataTransfer();
    component.dragStart({ dataTransfer: data, preventDefault() {} } as any, component.board!.volunteers[2]);
    component.drop({ preventDefault() {} } as any, '');
    flushMicrotasks();
    expect(service.assign).toHaveBeenCalledWith('e1', ['3'], null);
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Chand freed to Unassigned');
  }));

  it('view-only people cannot pick or drag; a tap opens the profile', fakeAsync(() => {
    canAssign = false;
    start();
    expect(el().querySelector('.vl-chip')!.getAttribute('draggable')).toBeNull();
    component.toggle(component.board!.volunteers[0]);
    flushMicrotasks();
    fixture.detectChanges();
    expect(component.selected.size).toBe(0);
    expect(service.profile).toHaveBeenCalledWith('e1', '1');
    expect(el().querySelector('.vl-prof')!.textContent).toContain('+919000000001');
    expect(el().querySelector('.vl-move')).toBeNull();
    component.move(['1'], 'd2');
    expect(service.assign).not.toHaveBeenCalled();
  }));

  it('saves the volunteers needed number and rejects a bad one', fakeAsync(() => {
    start();
    component.openNeed(component.board!.departments[0]);     // not this person's department
    expect(component.panel).toBe('closed');
    component.openNeed(component.board!.departments[1]);
    expect(component.needValue).toBe(3);
    component.needValue = 2.5;
    component.saveNeed();
    expect(component.needError).toContain('whole number');

    service.setNeed.and.returnValue(Promise.resolve({ needed: 5, have: 1, canSet: true }));
    component.needValue = 5;
    component.saveNeed();
    flushMicrotasks();
    expect(service.setNeed).toHaveBeenCalledWith('e1', 'd2', 5);
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('WASH needs 5 volunteers');
    expect(component.panel).toBe('closed');
  }));

  it('filters from the stat cards and the list layout shows everyone', fakeAsync(() => {
    start();
    component.setStat('unassigned');
    fixture.detectChanges();
    expect(el().querySelectorAll('.vl-lane').length).toBe(0);
    component.setStat('unassigned');   // again = off
    component.layout = 'list';
    fixture.detectChanges();
    expect(el().querySelectorAll('.vl-tbl tbody tr').length).toBe(3);
    expect(el().querySelector('.vl-pill.un')).not.toBeNull();
  }));
});
