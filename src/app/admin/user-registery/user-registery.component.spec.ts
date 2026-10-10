import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { UserRegisteryComponent } from './user-registery.component';
import { AdminService, UserDeleteCheck } from '../admin.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';
import { AvatarService } from '../../core/avatar.service';

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
  let userSubject: BehaviorSubject<any>;

  const authStub = {
    get user() { return userSubject; },
    deptNameToKey: (name: string) => (name || '').toLowerCase().replace(/\s+/g, '-'),
    getEffectivePermissionMap: (u: any) => {
      const map: any = {};
      (u.permissions || []).forEach((p: string) => { const [k, l] = p.split(':'); map[k] = l; });
      return map;
    }
  };

  const setup = async (actor: any) => {
    userSubject = new BehaviorSubject<any>(actor);
    adminSpy = jasmine.createSpyObj('AdminService', [
      'getAllUsers', 'getRoles', 'getDepartments', 'checkDeleteUser', 'deleteUser', 'reactivateUser'
    ]);
    // Mirror the backend: deactivated users only come back when asked for
    // Fresh copies each call, so a test mutating a user can't leak into the next
    adminSpy.getAllUsers.and.callFake((includeInactive = false) =>
      of(JSON.parse(JSON.stringify(includeInactive ? mockUsers : mockUsers.filter(u => u.isActive !== false)))));
    adminSpy.getRoles.and.returnValue(of([]));
    adminSpy.getDepartments.and.returnValue(of([ops, box]));
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    confirmSpy = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    avatarSpy = jasmine.createSpyObj('AvatarService', ['effectiveVersion', 'changePhoto', 'remove']);
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
      expect(adminSpy.getAllUsers).toHaveBeenCalledWith(true);
    });

    it('does not ask for deactivated users as ADMIN', async () => {
      await setup(adminActor);
      expect(adminSpy.getAllUsers).toHaveBeenCalledWith(false);
      expect(component.deactivatedUsers.length).toBe(0);
    });

    it('builds the TL form department list from their own department, without calling /admin/departments', async () => {
      await setup(tlActor);
      expect(adminSpy.getDepartments).not.toHaveBeenCalled();
      expect(component.departments).toEqual([ops]);
    });
  });

  describe('summary counts and filters', () => {
    beforeEach(async () => await setup(devActor));

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
});
