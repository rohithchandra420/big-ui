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
import { StaffBandService } from '../core/staff-band.service';

const vol = (id: string, name: string, department: string | null, marked = true, extra: Partial<Volunteer> = {}): Volunteer => ({
  _id: id, name, avatarVersion: 0, role: 'VOL', department, unassigned: !department, phone: '', gender: '', dateOfJoining: null,
  today: { morning: marked, afternoon: false, night: false }, marked, stay: 'none', band: false, ...extra
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
  let bands: jasmine.SpyObj<StaffBandService>;
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
    bands = jasmine.createSpyObj('StaffBandService', ['get', 'link', 'replace', 'scan']);
    bands.get.and.callFake(() => Promise.reject({ status: 403 }));   // default: may not change bands
    await TestBed.configureTestingModule({
      declarations: [VolunteersComponent, SlidePanelComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: notify },
        { provide: VolunteersService, useValue: service },
        { provide: MatDialog, useValue: dialog },
        { provide: StaffBandService, useValue: bands }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(VolunteersComponent);
    component = fixture.componentInstance;
  });

  /** Most tests below check the Board; the page itself opens on the List (B-018). */
  const start = (layout: 'board' | 'list' = 'board') => {
    component.layout = layout;
    fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
  };
  const headers = () => Array.from(el().querySelectorAll<HTMLButtonElement>('.vl-tbl thead .vl-sort'));
  const rowNames = () => Array.from(el().querySelectorAll('.vl-tbl tbody tr b')).map(b => b.textContent!.trim());

  it('B-018: opens on the List, and the List button comes first and is selected', fakeAsync(() => {
    expect(component.layout).toBe('list');
    fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
    const seg = Array.from(el().querySelectorAll<HTMLButtonElement>('.vl-seg[aria-label="Layout"] button'));
    expect(seg.map(b => b.textContent!.replace('table_rows', '').replace('view_kanban', '').trim())).toEqual(['List', 'Board']);
    expect(seg[0].classList).toContain('on');
    expect(seg[1].classList).not.toContain('on');
    expect(el().querySelector('.vl-tbl')).not.toBeNull();
    expect(el().querySelector('.vl-board')).toBeNull();
    seg[1].click();
    fixture.detectChanges();
    expect(el().querySelector('.vl-board')).not.toBeNull();
  }));

  it('B-003: sorts the List by a column, flips on a second tap, and marks the sorted header', fakeAsync(() => {
    start('list');
    expect(rowNames()).toEqual(['Anil', 'Bela', 'Chand']);               // name A–Z by default
    expect(headers()[0].parentElement!.getAttribute('aria-sort')).toBe('ascending');

    headers()[0].click(); fixture.detectChanges();                        // name again = Z–A
    expect(rowNames()).toEqual(['Chand', 'Bela', 'Anil']);
    expect(headers()[0].parentElement!.getAttribute('aria-sort')).toBe('descending');

    headers()[1].click(); fixture.detectChanges();                        // department: Unassigned before WASH
    expect(rowNames()).toEqual(['Anil', 'Bela', 'Chand']);
    expect(headers()[0].parentElement!.getAttribute('aria-sort')).toBe('none');
    headers()[1].click(); fixture.detectChanges();
    expect(rowNames()).toEqual(['Chand', 'Anil', 'Bela']);                // ties stay A–Z

    headers()[2].click(); fixture.detectChanges();                        // Today: not marked first
    expect(rowNames()[0]).toBe('Bela');
  }));

  describe('List: Team Leads, new columns and the picked date (2026-11-18)', () => {
    const withTls = (): VolBoard => ({
      ...board(), canManage: true,
      volunteers: [
        vol('1', 'Anil', null, true, { gender: 'Male', stay: 'in', band: true }),
        vol('2', 'Bela', null, false, { stay: 'booked' }),
        vol('3', 'Chand', 'd2', true, { gender: 'Female' }),
        vol('9', 'Devi', 'd2', false, { role: 'TL', teams: ['Decor', 'WASH'] })
      ]
    });
    beforeEach(() => service.board.and.callFake((_e: string, date?: string) => Promise.resolve({ ...withTls(), today: date || '2026-11-14' })));

    it('shows Stay, Band and Gender, and Team Leads with a badge — not on the board or in the counts', fakeAsync(() => {
      start('list');
      const rows = Array.from(el().querySelectorAll<HTMLTableRowElement>('.vl-tbl tbody tr'));
      expect(rows.length).toBe(4);
      const anil = rows[0].textContent!;
      expect(anil).toContain('Moved in');
      expect(anil).toContain('Linked');
      expect(anil).toContain('Male');
      expect(rows[1].textContent).toContain('Bed given');
      expect(rows[2].textContent).toContain('No bed');
      expect(rows[3].querySelector('.vl-pill.tl')).not.toBeNull();
      expect(rows[3].textContent).toContain('Decor, WASH');
      expect(rows[3].querySelector('.vl-tickbox')).toBeNull();             // a TL can't be picked
      expect(component.view.stats.all).toBe(3);                           // volunteers only
      expect(component.view.tlCount).toBe(1);

      component.toggleAllShown();
      expect([...component.selected].sort()).toEqual(['1', '2', '3']);

      component.layout = 'board';
      fixture.detectChanges();
      expect(el().textContent).not.toContain('Devi');
    }));

    it('the role filter shows Volunteers or Team Leads; the Unassigned card hides Team Leads', fakeAsync(() => {
      start('list');
      component.setRole('TL');
      fixture.detectChanges();
      expect(rowNames()).toEqual(['Devi']);
      component.setRole('VOL');
      fixture.detectChanges();
      expect(rowNames()).toEqual(['Anil', 'Bela', 'Chand']);
      component.setRole('all');
      component.setStat('unassigned');
      fixture.detectChanges();
      expect(rowNames()).toEqual(['Anil', 'Bela']);
    }));

    it('sorts by Stay (no bed first) and Band', fakeAsync(() => {
      start('list');
      component.sortBy('stay');
      fixture.detectChanges();
      expect(rowNames()).toEqual(['Chand', 'Devi', 'Bela', 'Anil']);
      component.sortBy('band');
      fixture.detectChanges();
      expect(rowNames()[3]).toBe('Anil');
    }));

    it('a picked date reloads with that date; steppers move a day; Back to today clears it', fakeAsync(() => {
      start('list');
      expect(service.board).toHaveBeenCalledWith('e1', undefined);
      expect(component.realToday).toBe('2026-11-14');
      expect(el().querySelector('.day-nav-today')).toBeNull();

      component.shiftDay(-1);
      flushMicrotasks(); fixture.detectChanges();
      expect(service.board).toHaveBeenCalledWith('e1', '2026-11-13');
      expect(component.board!.today).toBe('2026-11-13');
      expect(component.isToday).toBeFalse();
      expect(el().querySelector('.vl-stat.on, .vl-stats')!.textContent).toContain('Not marked on');
      expect(el().querySelector('.day-nav-today')).not.toBeNull();

      component.pickDate('not-a-date');                                    // ignored
      expect(service.board).toHaveBeenCalledTimes(2);
      component.pickDate('2026-11-14');                                    // = today: back to no date
      flushMicrotasks();
      expect(component.date).toBeNull();
      component.pickDate('2026-11-20');
      flushMicrotasks();
      component.backToToday();
      flushMicrotasks(); fixture.detectChanges();
      expect(service.board.calls.mostRecent().args).toEqual(['e1', undefined]);
      expect(component.isToday).toBeTrue();
    }));

    it('a Team Lead\'s profile hides moves, location and deposit', fakeAsync(() => {
      start('list');
      component.board = { ...component.board!, canAssign: true };
      service.profile.and.returnValue(Promise.resolve({ ...profile, _id: '9', name: 'Devi', role: 'TL', teams: ['Decor', 'WASH'] }));
      component.openProfile(component.board!.volunteers[3]);
      flushMicrotasks(); fixture.detectChanges();
      expect(component.panelSubtitle).toBe('Team Lead · Decor, WASH');
      const prof = el().querySelector('.vl-prof')!.textContent!;
      expect(prof).toContain('Leads');
      expect(prof).not.toContain('Deposit');
      expect(prof).not.toContain('Move to');
      expect(service.location).not.toHaveBeenCalled();
    }));
  });

  it('B-010: shows Link band only when the server allows it, then links a scanned band', fakeAsync(() => {
    start('list');
    component.openProfile(component.board!.volunteers[0]);
    flushMicrotasks(); fixture.detectChanges();
    expect(bands.get).toHaveBeenCalledWith('1', 'e1');
    expect(el().querySelector('.vl-band')).toBeNull();                    // 403: status only

    bands.get.and.returnValue(Promise.resolve({ current: null, bands: [], canChange: true }));
    bands.scan.and.returnValue(Promise.resolve('BAND-RAW'));
    bands.link.and.returnValue(Promise.resolve({ band: { _id: 'b1', code: 'B1' } }));
    component.openProfile(component.board!.volunteers[0]);
    flushMicrotasks(); fixture.detectChanges();
    const btn = el().querySelector<HTMLButtonElement>('.vl-band .pill-btn')!;
    expect(btn.textContent).toContain('Link band');

    bands.get.and.returnValue(Promise.resolve({ current: { _id: 'b1', code: 'B1' }, bands: [], canChange: true }));
    btn.click();
    flushMicrotasks(); fixture.detectChanges();
    expect(bands.link).toHaveBeenCalledWith('1', 'e1', 'BAND-RAW');
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Band linked');
    expect(component.profile!.band).toBeTrue();
    expect(el().querySelector('.vl-band .pill-btn')!.textContent).toContain('Replace band');
  }));

  it('B-010: Replace asks for a reason first, and the panel close clears the band state', fakeAsync(() => {
    start('list');
    bands.get.and.returnValue(Promise.resolve({ current: { _id: 'b1', code: 'B1' }, bands: [], canChange: true }));
    bands.scan.and.returnValue(Promise.resolve('NEW-RAW'));
    bands.replace.and.returnValue(Promise.resolve({ band: { _id: 'b2', code: 'B2' } }));
    component.openProfile(component.board!.volunteers[0]);
    flushMicrotasks(); fixture.detectChanges();

    component.changeBand(true);
    expect(component.bandReasonOpen).toBeTrue();
    expect(bands.scan).not.toHaveBeenCalled();
    component.bandReason = 'Lost it';
    component.changeBand(true);
    flushMicrotasks();
    expect(bands.replace).toHaveBeenCalledWith('1', 'e1', 'NEW-RAW', 'Lost it');
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Band replaced');

    component.closePanel();
    expect(component.band).toBeNull();
    expect(component.bandReason).toBe('');
  }));

  it('shows the Unassigned pool next to the department cards, with have / needed', fakeAsync(() => {
    start();
    expect(service.board).toHaveBeenCalledWith('e1', undefined);   // no date = today
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
