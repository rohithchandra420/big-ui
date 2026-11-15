import { ComponentFixture, TestBed, fakeAsync, flush, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { BulkUsersComponent } from '../admin/user-registery/bulk-users/bulk-users.component';
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
  dateOfJoining: '2026-11-10T00:00:00.000Z', foodPreference: 'veg', gender: 'Male', stay: null, band: false, meals: 4, deposit: { status: 'held', amount: 500 },
  attendance: [{ date: '2026-11-13', morning: true, afternoon: false, night: false }, { date: '2026-11-14', morning: false, afternoon: false, night: false }]
};

describe('VolunteersComponent', () => {
  let fixture: ComponentFixture<VolunteersComponent>;
  let component: VolunteersComponent;
  let service: jasmine.SpyObj<VolunteersService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let canAssign: boolean;
  let dialog: jasmine.SpyObj<MatDialog>;
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
    service = jasmine.createSpyObj('VolunteersService', ['board', 'assign', 'profile', 'setNeed', 'askLocation', 'location']);
    service.board.and.callFake(() => Promise.resolve(board()));
    service.profile.and.returnValue(Promise.resolve(profile));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    await TestBed.configureTestingModule({
      declarations: [VolunteersComponent, SlidePanelComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: VolunteersService, useValue: service },
        { provide: MatDialog, useValue: dialog }
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

  it('asks the picked volunteers for their location (Manage only) and says who was not asked', fakeAsync(() => {
    start();
    component.toggle(component.board!.volunteers[0]);
    fixture.detectChanges();
    expect(el().querySelector('.vl-dest.ask')).toBeNull();          // this person may assign, not ask
    component.askSelected();
    expect(service.askLocation).not.toHaveBeenCalled();

    component.board = { ...component.board!, canManage: true };
    fixture.detectChanges();
    expect(el().querySelector('.vl-dest.ask')).not.toBeNull();
    service.askLocation.and.returnValue(Promise.resolve({ asked: 0, notSharing: 1, alreadyAsked: 0, skipped: 0 }));
    component.askSelected();
    flushMicrotasks();
    expect(service.askLocation).toHaveBeenCalledWith('e1', ['1']);
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith("Nobody asked · 1 doesn't share their location");
  }));

  it('shows a volunteer who does not share that they cannot be asked', fakeAsync(() => {
    start();
    component.board = { ...component.board!, canManage: true };
    service.location.and.returnValue(Promise.resolve({ sharing: false, waiting: false, latest: null, requestHours: 2, log: [] }));
    component.openProfile(component.board!.volunteers[0]);
    flushMicrotasks();
    flush();
    fixture.detectChanges();
    expect(service.location).toHaveBeenCalledWith('e1', '1');
    expect(el().querySelector('.vl-prof')!.textContent).toContain('has not turned on location sharing');
    expect(el().querySelector('.vl-loc-row')).toBeNull();
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

  it('List view: pick rows or everyone shown, then ask them all for their location', fakeAsync(() => {
    start();
    component.board = { ...component.board!, canManage: true };
    component.layout = 'list';
    component.search = 'a';            // Anil, Bela, Chand all contain an "a"
    component.apply();
    fixture.detectChanges();
    const boxes = el().querySelectorAll<HTMLButtonElement>('.vl-tbl tbody .vl-tickbox');
    expect(boxes.length).toBe(3);
    boxes[1].click();
    expect([...component.selected]).toEqual(['2']);
    expect(service.profile).not.toHaveBeenCalled();   // picking does not open the profile

    el().querySelector<HTMLButtonElement>('.vl-tbl thead .vl-tickbox')!.click();
    fixture.detectChanges();
    expect(component.selected.size).toBe(3);
    expect(component.allShownPicked).toBeTrue();
    expect(el().querySelector('.vl-selbar')).toBeNull();            // no bar in the List layout
    const askBtn = el().querySelector<HTMLButtonElement>('.vl-ask')!;
    expect(askBtn.textContent).toContain('Ask location (3)');

    service.askLocation.and.returnValue(Promise.resolve({ asked: 2, notSharing: 1, alreadyAsked: 0, skipped: 0 }));
    askBtn.click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.askLocation).toHaveBeenCalledWith('e1', jasmine.arrayWithExactContents(['1', '2', '3']));
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith("Asked 2 · 1 doesn't share their location");
    expect(component.selected.size).toBe(0);                       // picks are dropped after asking
    expect(el().querySelector<HTMLButtonElement>('.vl-ask')!.disabled).toBeTrue();

    component.toggleAllShown();
    component.toggleAllShown();       // again = unpick
    expect(component.selected.size).toBe(0);
  }));

  it('Add users: the header buttons are for Manage only', fakeAsync(() => {
    start();
    expect(el().querySelector('.ph-actions')).toBeNull();          // may assign, not manage
    component.openAdd();
    component.openBulk();
    expect(component.panel).toBe('closed');
    expect(dialog.open).not.toHaveBeenCalled();

    component.board = { ...component.board!, canManage: true };
    fixture.detectChanges();
    const buttons = el().querySelectorAll<HTMLButtonElement>('.ph-actions button');
    expect(buttons.length).toBe(2);
    buttons[1].click();
    fixture.detectChanges();
    expect(component.panel).toBe('add');
    expect(component.panelTitle).toBe('New volunteer');
    expect(el().querySelector('app-user-form')).not.toBeNull();
  }));

  it('Add users: offers the pool and every department except Medical, as a stored list', fakeAsync(() => {
    service.board.and.callFake(() => Promise.resolve({
      ...board(), canManage: true,
      departments: [...board().departments, { _id: 'd3', name: 'First Aid', key: 'medical', tls: [], needed: 0, canSetNeed: false }]
    }));
    start();
    expect(component.addDepartments.map(d => d.name)).toEqual(['Volunteer (Unassigned)', 'Decor', 'WASH']);
    const list = component.addDepartments;
    component.load();
    flushMicrotasks();
    expect(component.addDepartments).toBe(list);                  // same list after a reload
  }));

  it('Add users: a saved volunteer closes the form and reloads; Bulk Add reloads when someone was added', fakeAsync(() => {
    start();
    component.board = { ...component.board!, canManage: true };
    component.openAdd();
    component.onUserAdded();
    flushMicrotasks();
    expect(component.panel).toBe('closed');
    expect(service.board).toHaveBeenCalledTimes(2);

    component.board = { ...component.board!, canManage: true };
    dialog.open.and.returnValue({ afterClosed: () => of(true) } as any);
    component.openBulk();
    flushMicrotasks();
    expect(dialog.open).toHaveBeenCalledWith(BulkUsersComponent, jasmine.objectContaining({ data: { volunteersMode: true } }));
    expect(service.board).toHaveBeenCalledTimes(3);

    component.board = { ...component.board!, canManage: true };
    dialog.open.and.returnValue({ afterClosed: () => of(false) } as any);
    component.openBulk();
    flushMicrotasks();
    expect(service.board).toHaveBeenCalledTimes(3);
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
