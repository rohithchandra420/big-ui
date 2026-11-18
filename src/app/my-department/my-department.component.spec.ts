import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, of } from 'rxjs';
import { MyDepartmentComponent } from './my-department.component';
import { DepartmentService, AttendanceRosterEntry } from '../core/department.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { ConfirmationService } from '../shared/confirm-dialog/confirmation.service';
import { EventService } from '../core/event.service';
import { TaskService } from '../core/task.service';
import { AppSelectComponent } from '../shared/app-select/app-select.component';
import { AppOptionComponent } from '../shared/app-select/app-option.component';

// My Department 1.64.0: B-004 (who marked + restyle), B-005 (tasks in a panel), B-006 (All view opens a department).
const entry = (userId: string, name: string, m = false, a = false, n = false, marks: AttendanceRosterEntry['marks'] = {}): AttendanceRosterEntry =>
  ({ userId, name, current: true, morning: m, afternoon: a, night: n, marks });

describe('MyDepartmentComponent', () => {
  let fixture: ComponentFixture<MyDepartmentComponent>;
  let component: MyDepartmentComponent;
  let depts: jasmine.SpyObj<DepartmentService>;
  let tasks: jasmine.SpyObj<TaskService>;
  let role: string;
  let notify: jasmine.SpyObj<NotificationService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    role = 'TL';
    depts = jasmine.createSpyObj('DepartmentService', ['getMyDepartments', 'getDepartmentDetail', 'getAttendance', 'markAttendance', 'getAttendanceReport', 'getSummary', 'getSummaryMatrix', 'getUsersMatrix', 'getAttendanceMatrix', 'memberProfile', 'setMemberRole']);
    depts.getMyDepartments.and.callFake(() => of(role === 'TL'
      ? [{ _id: 'd1', name: 'Stage Crew' } as any]
      : [{ _id: 'ALL', name: 'All departments' } as any, { _id: 'd1', name: 'Stage Crew' } as any, { _id: 'd2', name: 'Decor' } as any]));
    depts.getDepartmentDetail.and.returnValue(of({ _id: 'd1', name: 'Stage Crew', description: 'Lights and sound', tls: [], volunteerCount: 2 } as any));
    depts.getAttendance.and.returnValue(of({
      date: '2026-11-18', department: { _id: 'd1', name: 'Stage Crew' },
      roster: [
        entry('u1', 'Anil Kumar', true, false, false, { morning: { by: 'Ravi Lead', at: '2026-11-18T03:44:00.000Z' } }),
        entry('u2', 'Bela Sen')
      ]
    } as any));
    depts.getSummary.and.returnValue(of({ date: '2026-11-18', departments: [{ _id: 'd2', name: 'Decor', volunteerCount: 3, marked: 1, morning: 1, afternoon: 0, night: 0 }] } as any));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    tasks = jasmine.createSpyObj('TaskService', ['list']);
    tasks.list.and.returnValue(Promise.resolve([{ _id: 't1', status: 'new' }, { _id: 't2', status: 'closed' }, { _id: 't3', status: 'in_progress' }] as any));

    await TestBed.configureTestingModule({
      declarations: [MyDepartmentComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: DepartmentService, useValue: depts },
        { provide: AuthService, useValue: { user: new BehaviorSubject<any>({ _id: 'me', get role() { return role; } }) } },
        { provide: NotificationService, useValue: notify },
        { provide: ConfirmationService, useValue: confirm },
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }), currentActiveEvent: { _id: 'e1', name: 'BiG 7.0' } } },
        { provide: TaskService, useValue: tasks }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(MyDepartmentComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('B-004: a chip per slot; the hover says who marked it and when', fakeAsync(() => {
    start();
    const rows = Array.from(el().querySelectorAll('.myd-row:not(.myd-all)'));
    // Mark all is the list's header row, chips in the same columns
    expect(el().querySelectorAll('.myd-row.myd-all .myd-slot.all').length).toBe(3);
    expect(rows.length).toBe(2);
    const chips = Array.from(rows[0].querySelectorAll('.myd-slot')) as HTMLButtonElement[];
    expect(chips.map(c => c.textContent!.replace(/wb_sunny|wb_twilight|bedtime/g, '').trim())).toEqual(['Morning', 'Afternoon', 'Night']);
    expect(chips[0].classList).toContain('on');
    const anil = component.roster[0];
    expect(component.markTip(anil, 'morning')).toMatch(/^Morning — marked by Ravi Lead · /);
    expect(component.markTip(anil, 'night')).toBe('Night — not marked');
    expect(rows[0].querySelector('.myd-count')!.textContent!.trim()).toBe('1/3');
  }));

  it('B-004: Mark all toggles a slot for everyone; unsaved changes are counted; the hover says "not saved yet"', fakeAsync(() => {
    start();
    expect(component.unsavedCount).toBe(0);
    expect(el().querySelector('.myd-savebar')!.textContent).toContain('All saved');
    component.markAll('night');
    expect(component.roster.every(r => r.night)).toBeTrue();
    expect(component.unsavedCount).toBe(2);
    expect(component.markTip(component.roster[0], 'night')).toBe('Night — ticked, not saved yet');
    component.markAll('night');                                       // everyone already: clears
    expect(component.roster.every(r => !r.night)).toBeTrue();
    expect(component.unsavedCount).toBe(0);
    component.toggleSlot(component.roster[0], 'morning');
    expect(component.markTip(component.roster[0], 'morning')).toBe('Morning — will be cleared on Save');
    fixture.detectChanges();
    expect(el().querySelector('.myd-savebar.dirty')!.textContent).toContain('1 unsaved change');
  }));

  it('B-004: a VOL sees the chips read-only, with no Mark all and no save bar', fakeAsync(() => {
    role = 'VOL';
    // A VOL gets their own department only
    depts.getMyDepartments.and.returnValue(of([{ _id: 'd1', name: 'Stage Crew' } as any]));
    start();
    expect(component.canMark).toBeFalse();
    expect(el().querySelector('.myd-all')).toBeNull();
    expect(el().querySelector('.myd-savebar')).toBeNull();
    expect((el().querySelector('.myd-slot') as HTMLButtonElement).disabled).toBeTrue();
    component.markAll('morning');
    expect(component.roster[1].morning).toBeFalse();
  }));

  it('B-005: the department card is on top with a Tasks marker; tasks open in a slide panel', fakeAsync(() => {
    start();
    expect(tasks.list).toHaveBeenCalledWith('d1');
    expect(component.openTasks).toBe(2);
    expect(component.tasksLabel).toBe('Tasks · 2 open');
    fixture.detectChanges();
    const card = el().querySelector('.myd-hero') as HTMLElement;
    expect(card.querySelector('.myd-tasks.has .myd-dot')).not.toBeNull();
    // The card comes before the attendance tabs; no task list on the page itself
    const all = Array.from(el().querySelectorAll('.myd-hero, .myd-tabs, app-task-list'));
    expect(all[0].classList).toContain('myd-hero');
    expect(el().querySelector('app-task-list')).toBeNull();
    (card.querySelector('.myd-tasks') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.tasksOpen).toBeTrue();
    expect(el().querySelector('app-task-list')).not.toBeNull();
    component.closeTasks();
    flushMicrotasks();
    expect(tasks.list).toHaveBeenCalledTimes(2);                     // the marker refreshes on close
  }));

  it('B-005: no tasks at all reads "No tasks"; all closed says so', fakeAsync(() => {
    tasks.list.and.returnValue(Promise.resolve([]));
    start();
    expect(component.tasksLabel).toBe('No tasks');
    tasks.list.and.returnValue(Promise.resolve([{ _id: 't', status: 'closed' }] as any));
    component.loadTaskCount();
    flushMicrotasks();
    expect(component.tasksLabel).toBe('Tasks · all 1 closed');
  }));

  it('B-006: in the All view, tapping a department row opens it and sets the dropdown', fakeAsync(() => {
    role = 'ADMIN';
    start();
    expect(component.isAllView).toBeTrue();
    const row = el().querySelector('.myd-pickrow') as HTMLElement;
    expect(row.textContent).toContain('Decor');
    row.click();
    flushMicrotasks();
    expect(component.selectedDeptId).toBe('d2');
    expect(component.isAllView).toBeFalse();
    expect(depts.getDepartmentDetail).toHaveBeenCalledWith('d2');
    component.openDepartment('not-mine');                             // not in the list: ignored
    expect(component.selectedDeptId).toBe('d2');
  }));

  // ── Redesign + a member's details (2026-11-19) ──

  it('stat cards count the saved marks of the day; "Not marked" shows only them', fakeAsync(() => {
    start();
    expect(component.markedCount).toBe(1);
    const stats = Array.from(el().querySelectorAll('.myd-stat'));
    expect(stats.map(x => x.querySelector('b')!.textContent!.trim())).toEqual(['2', '1', '1', '2']);
    component.toggleSlot(component.roster[1], 'night');                  // a tick counts once saved
    expect(component.markedCount).toBe(1);
    (el().querySelector('.myd-stat.warn') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.onlyUnmarked).toBeTrue();
    expect(Array.from(el().querySelectorAll('.myd-row .myd-nm b')).map(b => b.textContent)).toEqual(['Bela Sen']);
  }));

  it('All view: totals over the departments for the day', fakeAsync(() => {
    role = 'ADMIN';
    start();
    expect(component.allTotals).toEqual({ people: 3, marked: 1, unmarked: 2 });
    expect(el().querySelectorAll('.myd-stat').length).toBe(4);
  }));

  it('a TL taps a person to open their details; a VOL cannot', fakeAsync(() => {
    start();
    (el().querySelector('.myd-who') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.member).toEqual({ userId: 'u1', name: 'Anil Kumar' });
    expect(el().querySelector('app-vol-profile')).not.toBeNull();
    component.closeMember();
    expect(component.member).toBeNull();

    role = 'VOL';
    component.userRole = 'VOL';
    fixture.detectChanges();
    expect((el().querySelector('.myd-who') as HTMLButtonElement).disabled).toBeTrue();
    component.openMember('u1', 'Anil Kumar');
    expect(component.member).toBeNull();
  }));

  it('Role: confirm, change it, reload the profile; refusals show the server message', fakeAsync(() => {
    start();
    component.openMember('u2', 'Bela Sen');
    component.memberProfile = { _id: 'u2', name: 'Bela Sen', role: 'VOL', can: { role: true, location: true } } as any;
    fixture.detectChanges();
    expect(el().querySelector('.myd-role')!.textContent).toContain('Make Team Lead');
    confirm.confirm.and.returnValue(of(false));
    component.changeRole('TL');
    expect(depts.setMemberRole).not.toHaveBeenCalled();
    confirm.confirm.and.returnValue(of(true));
    depts.setMemberRole.and.returnValue(Promise.resolve({ _id: 'u2', role: 'TL' }));
    component.changeRole('TL');
    flushMicrotasks();
    expect(confirm.confirm.calls.mostRecent().args[0].message).toContain('becomes a Team Lead of Stage Crew');
    expect(depts.setMemberRole).toHaveBeenCalledWith('d1', 'u2', 'e1', 'TL');
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Bela Sen is now a Team Lead');
    expect(depts.getDepartmentDetail).toHaveBeenCalledTimes(2);           // the TL list refreshes

    depts.setMemberRole.and.returnValue(Promise.reject({ error: { message: 'Bela Sen leads more than one department. Change them in Admin › Users.' } }));
    component.changeRole('VOL');
    flushMicrotasks();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('Bela Sen leads more than one department. Change them in Admin › Users.');
    expect(component.roleBusy).toBeFalse();
  }));

  it('roleNote says why the Role buttons are missing', fakeAsync(() => {
    start();
    component.openMember('me', 'Me Myself');
    expect(component.roleNote({ name: 'Me Myself', role: 'TL', teams: ['Stage Crew'] } as any)).toBe('You cannot change your own role.');
    component.openMember('u9', 'Devi');
    expect(component.roleNote({ name: 'Devi', role: 'TL', teams: ['Decor', 'Stage Crew'] } as any)).toContain('Admin › Users');
  }));
});
