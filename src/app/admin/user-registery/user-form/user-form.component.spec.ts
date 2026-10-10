import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';

import { UserFormComponent } from './user-form.component';
import { AdminService } from '../../admin.service';
import { AuthService } from '../../../core/auth.service';
import { NotificationService } from '../../../core/notification.service';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';

const general = { _id: 'd-gen', name: 'General' };
const box = { _id: 'd-box', name: 'Box Office' };

const editedUser = {
  _id: 'u1',
  name: 'Vol Box',
  email: 'vol@test.com',
  role: { _id: 'r-vol', name: 'VOL' },
  departments: [{ department: box }],
  permissions: ['box-office:write', 'general:read'],
  dateOfJoining: '2026-03-15T00:00:00.000Z'
};

describe('UserFormComponent', () => {
  let component: UserFormComponent;
  let fixture: ComponentFixture<UserFormComponent>;
  let adminSpy: jasmine.SpyObj<AdminService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;

  const authStub = {
    deptNameToKey: (name: string) => (name || '').toLowerCase().replace(/\s+/g, '-')
  };

  const create = async (inputs: Partial<UserFormComponent>) => {
    adminSpy = jasmine.createSpyObj('AdminService', ['createUser', 'updateUser']);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);

    await TestBed.configureTestingModule({
      declarations: [UserFormComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule, ReactiveFormsModule],
      providers: [
        { provide: AdminService, useValue: adminSpy },
        { provide: AuthService, useValue: authStub },
        { provide: NotificationService, useValue: notificationSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(UserFormComponent);
    component = fixture.componentInstance;
    Object.assign(component, inputs);
    fixture.detectChanges();
  };

  const fillCreateForm = () => component.form.patchValue({
    userName: 'New Person',
    email: 'new@test.com',
    password: 'Secure@123',
    confirmPassword: 'Secure@123',
    role: 'VOL',
    homeDepartment: 'd-box',
    dateOfJoining: '2026-10-01'
  });

  describe('create mode', () => {
    beforeEach(async () => await create({
      mode: 'create',
      roles: [{ _id: 'r-vol', name: 'VOL' }],
      departments: [general, box],
      isTopLevel: true
    }));

    it('defaults General to read access', () => {
      expect(component.deptSelections['d-gen']).toBe('read');
      expect(component.deptSelections['d-box']).toBe('none');
    });

    it('is invalid until the passwords match', () => {
      fillCreateForm();
      component.form.patchValue({ confirmPassword: 'Different@1' });
      expect(component.form.hasError('passwordMismatch')).toBeTrue();
      expect(component.form.invalid).toBeTrue();

      component.form.patchValue({ confirmPassword: 'Secure@123' });
      expect(component.form.valid).toBeTrue();
    });

    it('creates the user with the chosen permissions and emits it', () => {
      const created = { _id: 'new1', name: 'New Person' };
      adminSpy.createUser.and.returnValue(of(created));
      const savedSpy = spyOn(component.saved, 'emit');
      fillCreateForm();
      component.setDeptLevel('d-box', 'manage');

      component.submit();

      const payload = adminSpy.createUser.calls.mostRecent().args[0];
      expect(payload.departmentIds).toEqual(['d-box']);
      expect(payload.permissions).toEqual(['general:read', 'box-office:manage']);
      expect(savedSpy).toHaveBeenCalledWith(created);
    });

    it('clicking the active chip level clears it', () => {
      component.setDeptLevel('d-gen', 'read');
      expect(component.deptSelections['d-gen']).toBe('none');
    });

    it('reports a failed create and does not emit', () => {
      adminSpy.createUser.and.returnValue(throwError(() => ({})));
      const savedSpy = spyOn(component.saved, 'emit');
      fillCreateForm();

      component.submit();

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalled();
      expect(savedSpy).not.toHaveBeenCalled();
    });
  });

  describe('edit mode (top-level)', () => {
    beforeEach(async () => await create({
      mode: 'edit',
      user: editedUser,
      roles: [{ _id: 'r-vol', name: 'VOL' }],
      departments: [general, box],
      isTopLevel: true
    }));

    it('pre-fills the form and permission chips from the user', () => {
      expect(component.form.controls.userName.value).toBe('Vol Box');
      expect(component.form.controls.homeDepartment.value).toBe('d-box');
      expect(component.form.controls.dateOfJoining.value).toBe('2026-03-15');
      expect(component.deptSelections['d-box']).toBe('write');
      expect(component.deptSelections['d-gen']).toBe('read');
    });

    it('does not require the password fields', () => {
      expect(component.form.controls.password.disabled).toBeTrue();
      expect(component.form.valid).toBeTrue();
    });

    it('sends department and date of joining in the update', () => {
      adminSpy.updateUser.and.returnValue(of(editedUser));

      component.submit();

      const payload = adminSpy.updateUser.calls.mostRecent().args[0];
      expect(payload._id).toBe('u1');
      expect(payload.departments).toEqual([{ departmentId: 'd-box', access: ['read'] }]);
      expect(payload.dateOfJoining).toBe('2026-03-15');
    });
  });

  describe('edit mode (TL)', () => {
    beforeEach(async () => await create({
      mode: 'edit',
      user: editedUser,
      roles: [],
      departments: [box],
      isTopLevel: false
    }));

    it('locks role, home department and date of joining', () => {
      expect(component.form.controls.role.disabled).toBeTrue();
      expect(component.form.controls.homeDepartment.disabled).toBeTrue();
      expect(component.form.controls.dateOfJoining.disabled).toBeTrue();
    });

    it('falls back to the user\'s own role for the locked role dropdown', () => {
      expect(component.roleOptions.map(r => r.name)).toEqual(['VOL']);
    });

    it('does not send department or date of joining', () => {
      adminSpy.updateUser.and.returnValue(of(editedUser));

      component.submit();

      const payload = adminSpy.updateUser.calls.mostRecent().args[0];
      expect(payload.departments).toBeUndefined();
      expect(payload.dateOfJoining).toBeUndefined();
      expect(payload.permissions).toEqual(['box-office:write']);
    });
  });
});
