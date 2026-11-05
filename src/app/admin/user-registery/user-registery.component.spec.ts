import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, Subject, of, throwError } from 'rxjs';

import { UserRegisteryComponent } from './user-registery.component';
import { AdminService, UserDeleteCheck } from '../admin.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';
import { AvatarService } from '../../core/avatar.service';
import { EventService } from '../../core/event.service';
import { StaffBandService } from '../../core/staff-band.service';

const ops = { _id: 'd-ops', name: 'Operations' };
const box = { _id: 'd-box', name: 'Box Office' };

const mkUser = (id: string, name: string, role: string, dept: any = ops, extra: any = {}) => ({
  _id: id,
  name,
  email: `${id}@test.com`,
  role: { _id: 'r-' + role, name: role },
  departments: dept ? [{ department: dept }] : [],
  permissions: [],
  dateOfJoining: '2026-01-01T00:00:00.000Z',
  ...extra
});

const mockUsers = [
  mkUser('dev1', 'Dev One', 'DEV'),
  mkUser('adm1', 'Admin One', 'ADMIN'),
  mkUser('tl1', 'Lead Ops', 'TL', ops),
  mkUser('tl2', 'Lead Box', 'TL', box),
  mkUser('vol1', 'Vol Ops', 'VOL', ops, { permissions: ['operations:write'] }),
  mkUser('vol2', 'Vol Box', 'VOL', box),
  mkUser('vol3', 'Vol Nowhere', 'VOL', null),
  mkUser('gone', 'Gone Vol', 'VOL', ops, { isActive: false, deactivatedAt: '2026-09-01T00:00:00.000Z' }),
];

const historyCheck = (action: 'delete' | 'deactivate', extra: Partial<UserDeleteCheck> = {}): UserDeleteCheck => ({
  action,
  hasHistory: action === 'deactivate',
  attendanceCount: 0,
  attendanceMarkedCount: 0,
  eventsCreatedCount: 0,
  ...extra
});

describe('UserRegisteryComponent', () => {
  let component: UserRegisteryComponent;
  let fixture: ComponentFixture<UserRegisteryComponent>;
  let adminSpy: jasmine.SpyObj<AdminService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let confirmSpy: jasmine.SpyObj<ConfirmationService>;
  let avatarSpy: jasmine.SpyObj<AvatarService>;
  let bandSpy: jasmine.SpyObj<StaffBandService>;
  let userSubject: BehaviorSubject<any>;

  const authStub = {
    get user() { return userSubject; },
    deptNameToKey: (name: string) => (name || '').toLowerCase().replace(/\s+/g, '-'),
    deptKeyOf: (d: any) => d?.key || (d?.name || '').toLowerCase().replace(/\s+/g, '-'),
    getEffectivePermissionMap: (u: any) => {
      const map: any = {};
      (u.permissions || []).forEach((p: string) => { const [k, l] = p.split(':'); map[k] = l; });
      return map;
    }
  };

  const setup = async (actor: any) => {
    userSubject = new BehaviorSubject<any>(actor);
    adminSpy = jasmine.createSpyObj('AdminService', [
      'getAllUsers', 'getRoles', 'getDepartments', 'checkDeleteUser', 'deleteUser', 'reactivateUser',
      'addEventStaff', 'removeEventStaff', 'bulkDeleteUsers'
    ]);
    // Mirror the backend: deactivated users only come back when asked for
    // Fresh copies each call, so a test mutating a user can't leak into the next
    adminSpy.getAllUsers.and.callFake((includeInactive = false, eventId = '') => {
      const list = JSON.parse(JSON.stringify(includeInactive ? mockUsers : mockUsers.filter(u => u.isActive !== false)));
      // Staff list: with an event, the backend marks who is on it (top roles always; vol1 listed).
      if (eventId) list.forEach((u: any) => { u.onEvent = ['DEV', 'DIR', 'ADMIN'].includes(u.role.name) || u._id === 'vol1'; });
      return of(list);
    });
    adminSpy.addEventStaff.and.returnValue(of({ added: 2 }));
    adminSpy.removeEventStaff.and.returnValue(of({ removed: 1 }));
    const activeEvent = new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' });
    adminSpy.getRoles.and.returnValue(of([]));
    adminSpy.getDepartments.and.returnValue(of([ops, box]));
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirmSpy = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    avatarSpy = jasmine.createSpyObj('AvatarService', ['effectiveVersion', 'changePhoto', 'remove']);
    bandSpy = jasmine.createSpyObj('StaffBandService', ['get', 'link', 'replace', 'scan']);
    bandSpy.get.and.callFake(() => Promise.reject({ status: 403 }));
    avatarSpy.effectiveVersion.and.callFake((_id: string, v: any) => v || 0);

    await TestBed.configureTestingModule({
      declarations: [UserRegisteryComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule, ReactiveFormsModule],
      providers: [
        { provide: AdminService, useValue: adminSpy },
        { provide: AuthService, useValue: authStub },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: ConfirmationService, useValue: confirmSpy },
        { provide: MatDialog, useValue: { openDialogs: [] } },
        { provide: AvatarService, useValue: avatarSpy },
        { provide: EventService, useValue: { activeEvent, get currentActiveEvent() { return activeEvent.value; } } },
        { provide: StaffBandService, useValue: bandSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(UserRegisteryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const devActor = { _id: 'dev1', role: 'DEV', departments: [{ department: ops }] };
  const adminActor = { _id: 'adm1', role: 'ADMIN', departments: [{ department: ops }] };
  const tlActor = { _id: 'tl1', role: 'TL', departments: [{ department: ops }] };

  describe('loading', () => {
    it('asks for deactivated users only as DEV/DIR', async () => {
      await setup(devActor);
      expect(adminSpy.getAllUsers).toHaveBeenCalledWith(true, 'e1');
    });

    it('does not ask for deactivated users as ADMIN', async () => {
      await setup(adminActor);
      expect(adminSpy.getAllUsers).toHaveBeenCalledWith(false, 'e1');
      expect(component.deactivatedUsers.length).toBe(0);
    });

    it('builds the TL form department list from their own department, without calling /admin/departments', async () => {
      await setup(tlActor);
      expect(adminSpy.getDepartments).not.toHaveBeenCalled();
      expect(component.departments).toEqual([ops]);
    });
  });

  describe('summary counts and filters', () => {
    // These test the other filters, so they look at everyone, not just the event's staff.
    beforeEach(async () => { await setup(devActor); component.staffFilter = ''; });

    it('counts only active users in the role cards', () => {
      expect(component.adminsCount).toBe(2);
      expect(component.leadsCount).toBe(2);
      expect(component.volunteersCount).toBe(3);
      expect(component.noDeptCount).toBe(1);
      expect(component.deactivatedUsers.length).toBe(1);
    });

    it('hides deactivated users from the default table', () => {
      expect(component.filteredUsers.map(u => u._id)).not.toContain('gone');
    });

    it('shows only deactivated users under the Deactivated card', () => {
      component.toggleDeactivated();
      expect(component.statusFilter).toBe('deactivated');
      expect(component.filteredUsers.map(u => u._id)).toEqual(['gone']);

      component.toggleDeactivated();
      expect(component.statusFilter).toBe('active');
    });

    it('shows active and deactivated users together under the "All" status', () => {
      component.statusFilter = 'all';
      expect(component.filteredUsers.length).toBe(mockUsers.length);
    });

    it('combines the status filter with role filters', () => {
      component.statusFilter = 'all';
      component.toggleFilter('volunteers');
      expect(component.filteredUsers.map(u => u._id)).toContain('gone');
      expect(component.filteredUsers.length).toBe(4);
    });

    it('clearing filters goes back to active users only', () => {
      component.statusFilter = 'deactivated';
      expect(component.hasFilters).toBeTrue();
      component.clearFilters();
      expect(component.statusFilter).toBe('active');
      expect(component.hasFilters).toBeFalse();
    });

    it('toggles a stat card off when tapped twice', () => {
      component.toggleFilter('leads');
      component.toggleFilter('leads');
      expect(component.activeFilter).toBeNull();
    });

    it('combines stat card, role, department and search filters', () => {
      component.toggleFilter('volunteers');
      component.deptFilter = 'd-ops';
      expect(component.filteredUsers.map(u => u._id)).toEqual(['vol1']);

      component.clearFilters();
      component.staffFilter = ''; // Clear goes back to "On <event>"
      component.roleFilter = 'TL';
      component.searchTerm = 'box';
      expect(component.filteredUsers.map(u => u._id)).toEqual(['tl2']);
    });

    it('searches by email as well as name', () => {
      component.searchTerm = 'vol3@';
      expect(component.filteredUsers.map(u => u._id)).toEqual(['vol3']);
    });

    it('sorts the table by name', () => {
      const names = component.filteredUsers.map(u => u.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('resets to the first page when a filter changes', () => {
      component.pageIndex = 2;
      component.toggleFilter('admins');
      expect(component.pageIndex).toBe(0);
    });

    it('lists roles in DEV, DIR, ADMIN, TL, VOL order', () => {
      expect(component.roleFilterOptions).toEqual(['DEV', 'ADMIN', 'TL', 'VOL']);
    });

    it('lists each home department once, sorted by name', () => {
      const names = component.deptFilterOptions.map(d => d.name);
      expect(new Set(component.deptFilterOptions.map(d => d._id)).size).toBe(names.length);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
      expect(names.length).toBeGreaterThan(1);
    });

    // Regression (v1.14.1): deptFilterOptions used to be a getter returning new
    // objects every change-detection pass, so *ngFor re-created every
    // <app-option> each pass — which froze the whole tab on UAT.
    it('keeps the same filter option objects across reads', () => {
      expect(component.deptFilterOptions).toBe(component.deptFilterOptions);
      expect(component.roleFilterOptions).toBe(component.roleFilterOptions);
      expect(component.deptFilterOptions[0]).toBe(component.deptFilterOptions[0]);
    });

    it('does not re-create the dropdown options on repeated change detection', () => {
      fixture.detectChanges();
      const before = Array.from(fixture.nativeElement.querySelectorAll('app-option'));
      expect(before.length).toBeGreaterThan(0);
      fixture.detectChanges();
      fixture.detectChanges();
      const after = Array.from(fixture.nativeElement.querySelectorAll('app-option'));
      expect(after.length).toBe(before.length);
      after.forEach((el, i) => expect(el).toBe(before[i]));
    });

    it('rebuilds the filter options when the user list reloads', () => {
      const old = component.deptFilterOptions;
      component.loadUsers();
      expect(component.deptFilterOptions).not.toBe(old);
      expect(component.deptFilterOptions).toEqual(old);
    });

    it('tracks filter options by role name and department id', () => {
      expect(component.trackRoleOption(0, 'TL')).toBe('TL');
      expect(component.trackDeptOption(0, { _id: 'd-ops' })).toBe('d-ops');
    });
  });

  describe('panel', () => {
    beforeEach(async () => await setup(devActor));

    it('opens a user in view mode, then switches to edit', () => {
      const vol = component.users.find(u => u._id === 'vol1');
      component.openUser(vol);
      expect(component.panelOpen).toBeTrue();
      expect(component.panelMode).toBe('view');

      component.startEdit();
      expect(component.panelMode).toBe('edit');
    });

    // Hospitality H5: the wrist band row shows only when the server allows it.
    it('shows the wrist band row only when allowed, and links a band for the picked event', async () => {
      const vol = component.users.find(u => u._id === 'vol1');
      component.openUser(vol);
      await fixture.whenStable();
      expect(component.band).toBeNull();          // 403 → no row

      bandSpy.get.and.callFake(() => Promise.resolve({ current: null, bands: [], canChange: true }));
      component.openUser(vol);
      await fixture.whenStable();
      expect(component.band?.current).toBeNull();
      expect(bandSpy.get).toHaveBeenCalledWith('vol1', 'e1');

      bandSpy.scan.and.returnValue(Promise.resolve('BAND-RAW-01'));
      bandSpy.link.and.returnValue(Promise.resolve({ band: { _id: 'b1', code: 'X' } }));
      await component.changeBand(false);
      expect(bandSpy.link).toHaveBeenCalledWith('vol1', 'e1', 'BAND-RAW-01');
    });

    it('cancelling an edit returns to view; cancelling a create closes the panel', () => {
      component.openUser(component.users[0]);
      component.startEdit();
      component.onFormCancelled();
      expect(component.panelMode).toBe('view');
      expect(component.panelOpen).toBeTrue();

      component.openCreate();
      component.onFormCancelled();
      expect(component.panelOpen).toBeFalse();
    });

    it('does not enter edit mode for a deactivated user', () => {
      component.openUser(component.users.find(u => u._id === 'gone'));
      component.startEdit();
      expect(component.panelMode).toBe('view');
    });

    it('lists department access with real department names', () => {
      const rows = component.permissionRows(component.users.find(u => u._id === 'vol1'));
      expect(rows).toEqual([{ dept: 'Operations', level: 'write' }]);
    });
  });

  describe('permissions', () => {
    it('ADMIN cannot delete a DEV, themselves, or a deactivated user', async () => {
      await setup(adminActor);
      const byId = (id: string) => mockUsers.find(u => u._id === id);
      expect(component.canDeleteUser(byId('dev1'))).toBeFalse();
      expect(component.canDeleteUser(byId('adm1'))).toBeFalse();
      expect(component.canDeleteUser(byId('gone'))).toBeFalse();
      expect(component.canDeleteUser(byId('vol1'))).toBeTrue();
      expect(component.canReactivateUser(byId('gone'))).toBeFalse();
    });

    it('DEV can reactivate a deactivated user', async () => {
      await setup(devActor);
      expect(component.canReactivateUser(mockUsers.find(u => u._id === 'gone'))).toBeTrue();
    });

    it('TL can edit only their own department and cannot delete or create', async () => {
      await setup(tlActor);
      const byId = (id: string) => mockUsers.find(u => u._id === id);
      expect(component.canEditUser(byId('vol1'))).toBeTrue();
      expect(component.canEditUser(byId('vol2'))).toBeFalse();
      expect(component.canDeleteUser(byId('vol1'))).toBeFalse();
      expect(component.canCreateUsers).toBeFalse();
    });
  });

  describe('delete', () => {
    beforeEach(async () => await setup(devActor));
    const vol = () => component.users.find(u => u._id === 'vol1');

    it('confirms a permanent delete for a user with no history, then deletes', () => {
      adminSpy.checkDeleteUser.and.returnValue(of(historyCheck('delete')));
      adminSpy.deleteUser.and.returnValue(of({ result: 'deleted' as const }));
      confirmSpy.confirm.and.returnValue(of(true));

      component.deleteUser(vol());

      const data = confirmSpy.confirm.calls.mostRecent().args[0];
      expect(data.title).toBe('Delete User');
      expect(data.danger).toBeTrue();
      expect(adminSpy.deleteUser).toHaveBeenCalledWith('vol1');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Vol Ops has been deleted');
    });

    it('confirms a deactivation, with the record counts, for a user with history', () => {
      adminSpy.checkDeleteUser.and.returnValue(of(historyCheck('deactivate', { attendanceCount: 3, eventsCreatedCount: 1 })));
      adminSpy.deleteUser.and.returnValue(of({ result: 'deactivated' as const }));
      confirmSpy.confirm.and.returnValue(of(true));

      component.deleteUser(vol());

      const data = confirmSpy.confirm.calls.mostRecent().args[0];
      expect(data.title).toBe('Deactivate User');
      expect(data.message).toContain('3 attendance entries');
      expect(data.message).toContain('1 event created');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Vol Ops has been deactivated');
    });

    it('does nothing when the confirmation is cancelled', () => {
      adminSpy.checkDeleteUser.and.returnValue(of(historyCheck('delete')));
      confirmSpy.confirm.and.returnValue(of(false));

      component.deleteUser(vol());

      expect(adminSpy.deleteUser).not.toHaveBeenCalled();
    });

    it('shows the server message if the check is refused', () => {
      adminSpy.checkDeleteUser.and.returnValue(throwError(() => ({ error: { message: 'Forbidden: nope' } })));

      component.deleteUser(vol());

      expect(confirmSpy.confirm).not.toHaveBeenCalled();
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Forbidden: nope');
    });
  });

  describe('photo', () => {
    const byId = (id: string) => mockUsers.find(u => u._id === id);

    it('TL can change only their own photo; DEV/DIR/ADMIN anyone active', async () => {
      await setup(tlActor);
      expect(component.canChangePhoto(byId('tl1'))).toBeTrue();
      expect(component.canChangePhoto(byId('vol1'))).toBeFalse();
    });

    it('ADMIN can change any active user\'s photo, but not a deactivated one', async () => {
      await setup(adminActor);
      expect(component.canChangePhoto(byId('vol2'))).toBeTrue();
      expect(component.canChangePhoto(byId('gone'))).toBeFalse();
    });

    it('stores the new version on the user after a change', async () => {
      await setup(devActor);
      avatarSpy.changePhoto.and.returnValue(of(555));
      const vol = component.users.find(u => u._id === 'vol1');

      component.changePhoto(vol);

      expect(avatarSpy.changePhoto).toHaveBeenCalledWith('vol1', 'Photo for Vol Ops');
      expect(vol.avatarVersion).toBe(555);
      expect(component.photoBusy).toBeFalse();
    });

    it('removes a photo only after confirmation', async () => {
      await setup(devActor);
      avatarSpy.remove.and.returnValue(of(0));
      const vol = component.users.find(u => u._id === 'vol1');
      vol.avatarVersion = 10;

      confirmSpy.confirm.and.returnValue(of(false));
      component.removePhoto(vol);
      expect(avatarSpy.remove).not.toHaveBeenCalled();

      confirmSpy.confirm.and.returnValue(of(true));
      component.removePhoto(vol);
      expect(avatarSpy.remove).toHaveBeenCalledWith('vol1');
      expect(vol.avatarVersion).toBe(0);
    });
  });

  describe('reactivate', () => {
    beforeEach(async () => await setup(devActor));

    it('reactivates after confirmation and reloads the list', () => {
      adminSpy.reactivateUser.and.returnValue(of({}));
      confirmSpy.confirm.and.returnValue(of(true));
      adminSpy.getAllUsers.calls.reset();

      component.reactivateUser(mockUsers.find(u => u._id === 'gone'));

      expect(adminSpy.reactivateUser).toHaveBeenCalledWith('gone');
      expect(adminSpy.getAllUsers).toHaveBeenCalled();
    });
  });

  // ── Staff list (STAFF_LIST_CONTEXT.md) ─────────────────
  describe('event staff list', () => {
    const adminActor = { _id: 'adm1', name: 'Admin One', role: 'ADMIN', departments: [] };
    const el = () => fixture.nativeElement as HTMLElement;

    it('asks for the sidebar event and shows who is on it', async () => {
      await setup(adminActor);
      expect(adminSpy.getAllUsers.calls.mostRecent().args[1]).toBe('e1');
      expect(component.showStaff).toBeTrue();
      expect(component.staffCount).toBe(3); // DEV, ADMIN always + vol1
      fixture.detectChanges();
      expect(el().textContent).toContain('3 on BiG 7.0');
    });

    it('filters by on / not on the event', async () => {
      await setup(adminActor);
      expect(component.staffFilter).toBe('on'); // the default
      expect(component.hasFilters).toBeFalse();
      component.staffFilter = 'off';
      expect(component.filteredUsers.map(u => u._id).sort()).toEqual(['tl1', 'tl2', 'vol2', 'vol3']);
      component.staffFilter = 'on';
      expect(component.filteredUsers.map(u => u._id).sort()).toEqual(['adm1', 'dev1', 'vol1']);
      component.staffFilter = '';
      expect(component.hasFilters).toBeTrue();
      component.clearFilters();
      expect(component.staffFilter).toBe('on');
    });

    it('only TL / VOL can be picked; pick all takes the whole filtered list', async () => {
      await setup(adminActor);
      component.staffFilter = '';
      const dev = component.users.find(u => u._id === 'dev1');
      component.togglePick(dev);
      expect(component.selectedIds.size).toBe(0);
      component.togglePickAll();
      expect([...component.selectedIds].sort()).toEqual(['tl1', 'tl2', 'vol1', 'vol2', 'vol3']);
      expect(component.allPicked).toBeTrue();
      component.togglePickAll();
      expect(component.selectedIds.size).toBe(0);
    });

    it('adds the picked people to the event, then reloads', async () => {
      await setup(adminActor);
      component.togglePick(component.users.find(u => u._id === 'tl1'));
      component.togglePick(component.users.find(u => u._id === 'vol2'));
      const calls = adminSpy.getAllUsers.calls.count();
      component.changeStaff(true);
      expect(adminSpy.addEventStaff).toHaveBeenCalledWith('e1', ['tl1', 'vol2']);
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('2 people added to BiG 7.0');
      expect(component.selectedIds.size).toBe(0);
      expect(adminSpy.getAllUsers.calls.count()).toBe(calls + 1);
    });

    it('removes one person from the side panel', async () => {
      await setup(adminActor);
      component.changeStaff(false, ['vol1']);
      expect(adminSpy.removeEventStaff).toHaveBeenCalledWith('e1', ['vol1']);
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('1 person removed from BiG 7.0');
    });

    it('says so when the change fails', async () => {
      await setup(adminActor);
      adminSpy.addEventStaff.and.returnValue(throwError(() => ({ status: 500 })));
      component.changeStaff(true, ['tl1']);
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalled();
      expect(component.staffBusy).toBeFalse();
    });

    it('bulk delete: previews, confirms with the counts, then removes and reloads', async () => {
      await setup(adminActor);
      adminSpy.bulkDeleteUsers.and.returnValues(
        of({ results: [
          { _id: 'tl1', name: 'Lead Ops', result: 'delete' },
          { _id: 'vol2', name: 'Vol Box', result: 'deactivate' },
          { _id: 'vol3', name: 'Vol Nowhere', result: 'refused', reason: 'User is already deactivated' }
        ], counts: { delete: 1, deactivate: 1, refused: 1 } } as any),
        of({ results: [], counts: { deleted: 1, deactivated: 1, refused: 1 } } as any)
      );
      confirmSpy.confirm.and.returnValue(of(true));
      ['tl1', 'vol2', 'vol3'].forEach(id => component.togglePick(component.users.find(u => u._id === id)));
      const calls = adminSpy.getAllUsers.calls.count();

      component.deleteSelected();

      expect(adminSpy.bulkDeleteUsers.calls.first().args).toEqual([['tl1', 'vol2', 'vol3'], true]);
      const dialog = confirmSpy.confirm.calls.mostRecent().args[0];
      expect(dialog.title).toBe('Remove 2 people');
      expect(dialog.danger).toBeTrue();
      expect(dialog.message).toContain('1 person will be deleted permanently');
      expect(dialog.message).toContain('1 person has records, so is deactivated instead');
      expect(dialog.message).toContain('Vol Nowhere (User is already deactivated)');
      expect(adminSpy.bulkDeleteUsers.calls.mostRecent().args).toEqual([['tl1', 'vol2', 'vol3'], false]);
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('1 deleted, 1 deactivated, 1 skipped');
      expect(component.selectedIds.size).toBe(0);
      expect(adminSpy.getAllUsers.calls.count()).toBe(calls + 1);
    });

    it('bulk delete: nothing happens when the confirm is cancelled', async () => {
      await setup(adminActor);
      adminSpy.bulkDeleteUsers.and.returnValue(of({ results: [{ _id: 'tl1', name: 'Lead Ops', result: 'delete' }], counts: { delete: 1 } } as any));
      confirmSpy.confirm.and.returnValue(of(false));
      component.togglePick(component.users.find(u => u._id === 'tl1'));
      component.deleteSelected();
      expect(adminSpy.bulkDeleteUsers).toHaveBeenCalledTimes(1);
    });

    it('bulk delete: says so when nobody can be removed', async () => {
      await setup(adminActor);
      adminSpy.bulkDeleteUsers.and.returnValue(of({ results: [{ _id: 'tl1', name: 'Lead Ops', result: 'refused', reason: 'x' }], counts: { refused: 1 } } as any));
      component.togglePick(component.users.find(u => u._id === 'tl1'));
      component.deleteSelected();
      expect(confirmSpy.confirm).not.toHaveBeenCalled();
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('None of the selected people can be removed.');
    });

    it('loads the staff flags when the sidebar event arrives after the page opened (race fix)', async () => {
      const replies: { [ev: string]: Subject<any[]> } = {};
      await setup(adminActor);
      const events = TestBed.inject(EventService) as any;
      adminSpy.getAllUsers.and.callFake((_inactive = false, ev = '') => (replies[ev] = new Subject<any[]>()));

      // Page (re)opens with no event yet, then the event arrives before the first list does.
      events.activeEvent.next(null);
      component.loadUsers();
      events.activeEvent.next({ _id: 'e2', name: 'BiG 8.0' });

      replies['e2'].next(JSON.parse(JSON.stringify(mockUsers)).map((u: any) => ({ ...u, onEvent: false })));
      replies[''].next(JSON.parse(JSON.stringify(mockUsers)));   // the old, event-less reply arrives last
      expect(component.showStaff).toBeTrue();
      expect(component.staffEvent?.name).toBe('BiG 8.0');
    });

    it('has no staff controls for a TL', async () => {
      await setup({ _id: 'tl1', name: 'Lead Ops', role: 'TL', departments: [{ department: ops }] });
      expect(adminSpy.getAllUsers.calls.mostRecent().args[1]).toBe('');
      expect(component.showStaff).toBeFalse();
    });
  });
});
