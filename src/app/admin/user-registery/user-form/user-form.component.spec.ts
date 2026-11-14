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

const general = { _id: 'd-gen', name: 'General', key: 'general' };
const box = { _id: 'd-box', name: 'Box Office', key: 'box-office' };

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
    deptKeyOf: (d: any) => (['general', 'box-office', 'tenting', 'workshop', 'hospitality', 'medical', 'wash'].includes(d?.key) ? d.key : (d ? 'general' : ''))
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

    it('starts with no extra access, and has no row for "general" (it gives nothing)', () => {
      expect('general' in component.keySelections).toBeFalse();
      expect(component.keySelections['box-office']).toBe('none');
      expect(component.buildPermissions()).toEqual([]);
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
      component.setKeyLevel('box-office', 'manage');

      component.submit();

      const payload = adminSpy.createUser.calls.mostRecent().args[0];
      expect(payload.departmentIds).toEqual(['d-box']);
      expect(payload.permissions).toEqual(['box-office:manage']);
      expect(payload.foodPreference).toBe('veg');   // Veg unless changed
      expect(savedSpy).toHaveBeenCalledWith(created);
    });

    it('puts the new user on the sidebar event when one is given (staff list)', () => {
      adminSpy.createUser.and.returnValue(of({ _id: 'new3', name: 'X' }));
      fillCreateForm();
      component.submit();
      expect(adminSpy.createUser.calls.mostRecent().args[0].eventId).toBeUndefined();
      component.eventId = 'e1';
      component.submit();
      expect(adminSpy.createUser.calls.mostRecent().args[0].eventId).toBe('e1');
    });

    it('sends Non-veg when picked', () => {
      adminSpy.createUser.and.returnValue(of({ _id: 'new2', name: 'X' }));
      fillCreateForm();
      component.form.controls.foodPreference.setValue('non-veg');
      component.submit();
      expect(adminSpy.createUser.calls.mostRecent().args[0].foodPreference).toBe('non-veg');
    });

    it('shows one row per built-in key that gives something — even with no department on it yet', () => {
      expect(component.accessKeys.map(k => k.key)).toEqual(['box-office', 'tenting', 'workshop', 'hospitality', 'medical', 'wash']);
      expect(component.accessKeys.find(k => k.key === 'box-office')!.names).toBe('Box Office');
      expect(component.accessKeys.find(k => k.key === 'wash')!.names).toBe('');
    });

    it('each row offers only the tiers its key uses', () => {
      const tiers = (key: string) => component.accessKeys.find(k => k.key === key)!.tiers.map(t => t.tier);
      expect(tiers('hospitality')).toEqual(['manage']);
      expect(tiers('medical')).toEqual(['read']);
      expect(tiers('wash')).toEqual(['read', 'write', 'manage']);
      const rows = fixture.nativeElement.querySelectorAll('.dept-row');
      expect(rows.length).toBe(6);
      const hospitality = Array.from(rows as NodeListOf<HTMLElement>).find(r => r.textContent!.includes('Hospitality'))!;
      expect(hospitality.querySelectorAll('.access-chip').length).toBe(1);
    });

    it('departments sharing a key are one row; picks survive the department list arriving late', () => {
      const tentB = { _id: 'd-w1', name: 'Workshop Tent B', key: 'workshop' };
      const tentA = { _id: 'd-w2', name: 'Workshop Tent A', key: 'workshop' };
      component.setKeyLevel('wash', 'write');
      component.departments = [general, box, tentB, tentA];
      component.ngOnChanges({ departments: { previousValue: [], currentValue: component.departments, firstChange: false, isFirstChange: () => false } } as any);
      expect(component.accessKeys.find(k => k.key === 'workshop')!.names).toBe('Workshop Tent A, Workshop Tent B');
      expect(component.keySelections['wash']).toBe('write');   // kept
      component.setKeyLevel('workshop', 'read');
      expect(component.buildPermissions()).toEqual(jasmine.arrayWithExactContents(['wash:write', 'workshop:read']));
    });

    it('picking a home department picks Read on its key by default; changing it moves the default', () => {
      const camp = { _id: 'd-camp', name: 'Camp Crew', key: 'tenting' };
      const mess = { _id: 'd-mess', name: 'Mess', key: 'hospitality' };
      component.departments = [general, box, camp, mess];
      component.ngOnChanges({ departments: { previousValue: [], currentValue: component.departments, firstChange: false, isFirstChange: () => false } } as any);

      component.form.controls.homeDepartment.setValue('d-camp');
      expect(component.keySelections['tenting']).toBe('read');
      component.form.controls.homeDepartment.setValue('d-box');
      expect(component.keySelections['tenting']).toBe('none');       // the default follows the department
      expect(component.keySelections['box-office']).toBe('read');

      component.form.controls.homeDepartment.setValue('d-gen');       // "general" gives nothing
      expect(component.buildPermissions()).toEqual([]);
      component.form.controls.homeDepartment.setValue('d-mess');      // Hospitality has no Read tier
      expect(component.keySelections['hospitality']).toBe('none');
    });

    it('the default never lowers or removes a level someone picked', () => {
      component.setKeyLevel('box-office', 'manage');
      component.form.controls.homeDepartment.setValue('d-box');
      expect(component.keySelections['box-office']).toBe('manage');
      component.form.controls.homeDepartment.setValue('d-gen');
      expect(component.keySelections['box-office']).toBe('manage');
    });

    it('says what the picked tier gives', () => {
      const wash = component.accessKeys.find(k => k.key === 'wash')!;
      expect(component.givesOf(wash)).toBe('');
      component.setKeyLevel('wash', 'manage');
      expect(component.givesOf(wash)).toContain('Setup');
    });

    it('clicking the active chip level clears it', () => {
      component.setKeyLevel('wash', 'read');
      component.setKeyLevel('wash', 'read');
      expect(component.keySelections['wash']).toBe('none');
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
      expect(component.keySelections['box-office']).toBe('write');
      expect('general' in component.keySelections).toBeFalse();   // an old general:read grant is not shown or re-sent
      expect(component.buildPermissions()).toEqual(['box-office:write']);   // opening Edit adds no default Read
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

    // Regression (v1.14.1): the fallback used to be a new array/object on every
    // read, so *ngFor re-created the <app-option> every change-detection pass.
    it('returns the same fallback role options on every read', () => {
      expect(component.roleOptions).toBe(component.roleOptions);
      expect(component.roleOptions[0]).toBe(component.roleOptions[0]);
      expect(component.trackRole(0, { name: 'VOL' })).toBe('VOL');
    });

    it('does not send department or date of joining', () => {
      adminSpy.updateUser.and.returnValue(of(editedUser));

      component.submit();

      const payload = adminSpy.updateUser.calls.mostRecent().args[0];
      expect(payload.departments).toBeUndefined();
      expect(payload.dateOfJoining).toBeUndefined();
      expect(payload.permissions).toEqual(['box-office:write']);
      expect(payload.foodPreference).toBe('veg');      // a TL may set it
    });
  });
});
