import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { DepartmentDetailComponent } from './department-detail.component';
import { AdminService, DeptDetail } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';
import { AuthService } from '../../../core/auth.service';
import { VolunteersService } from '../../../volunteers/volunteers.service';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';

const mockDetail: DeptDetail = {
  _id: 'd1',
  name: 'Box Office',
  key: 'box-office',
  description: 'Handles ticket sales',
  tls: [{ _id: 'tl1', name: 'Alice TL' }],
  volunteers: [{ _id: 'v1', name: 'Bob VOL', departments: [{ department: { _id: 'd1', name: 'Box Office' }, access: ['read'] }] }]
};

const allUsers = [
  { _id: 'tl1', name: 'Alice TL', role: { name: 'TL' }, departments: [] },
  { _id: 'tl2', name: 'Carol DIR', role: { name: 'DIR' }, departments: [] },
  { _id: 'v1', name: 'Bob VOL', role: { name: 'VOL' }, departments: [{ department: { _id: 'd1', name: 'Box Office' }, access: ['read'] }] },
  { _id: 'v2', name: 'Dave VOL', role: { name: 'VOL' }, departments: [{ department: { _id: 'd9', name: 'Finance' }, access: ['read'] }] },
  { _id: 'v3', name: 'Eve VOL', role: { name: 'VOL' }, departments: [] }
];

describe('DepartmentDetailComponent', () => {
  let component: DepartmentDetailComponent;
  let fixture: ComponentFixture<DepartmentDetailComponent>;
  let adminServiceSpy: jasmine.SpyObj<AdminService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let volunteersSpy: jasmine.SpyObj<VolunteersService>;

  beforeEach(async () => {
    volunteersSpy = jasmine.createSpyObj('VolunteersService', ['need', 'setNeed']);
    volunteersSpy.need.and.returnValue(Promise.resolve({ needed: 4, have: 1, canSet: true }));
    volunteersSpy.setNeed.and.returnValue(Promise.resolve({ needed: 6, have: 1, canSet: true }));
    adminServiceSpy = jasmine.createSpyObj('AdminService', [
      'getDepartmentDetail', 'getAllUsers', 'updateDepartment', 'createDepartment', 'getDepartments'
    ]);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);

    adminServiceSpy.getDepartments.and.returnValue(of([
      { _id: 'd-m1', name: 'Workshop Tent A', key: 'workshop' }, { _id: 'd-x', name: 'Operations', key: 'general' }
    ] as any));
    adminServiceSpy.getDepartmentDetail.and.returnValue(of(mockDetail));
    adminServiceSpy.getAllUsers.and.returnValue(of(allUsers));

    await TestBed.configureTestingModule({
      declarations: [DepartmentDetailComponent, AppSelectComponent, AppOptionComponent],
      imports: [
        MatAutocompleteModule, ReactiveFormsModule
      ],
      providers: [
        { provide: AdminService, useValue: adminServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: VolunteersService, useValue: volunteersSpy },
        { provide: AuthService, useValue: {
          deptKeyOf: (d: any) => (['general', 'box-office', 'tenting', 'workshop', 'hospitality', 'medical', 'wash'].includes(d?.key) ? d.key : (d ? 'general' : ''))
        } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(DepartmentDetailComponent);
    component = fixture.componentInstance;
    component.deptId = 'd1';
    component.reset();
    fixture.detectChanges();
  });

  it('loads the department and shows its details first (view mode)', () => {
    expect(component.mode).toBe('view');
    expect(adminServiceSpy.getDepartmentDetail).toHaveBeenCalledWith('d1', '');
    expect(component.detail).toEqual(mockDetail);
  });

  it('shows error notification when detail load fails', () => {
    adminServiceSpy.getDepartmentDetail.and.returnValue(throwError(() => new Error('fail')));
    component.loadDetail('d1');
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Error loading department');
  });

  it('view shows the name and key in the panel header, and an Edit button', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.panel-title')!.textContent!.trim()).toBe('Box Office');
    expect(el.querySelector('.panel-sub')!.textContent).toContain('box-office');
    expect(el.querySelector('.panel-actions .btn-cta')!.textContent).toContain('Edit');
  });

  it('Edit switches the panel to the form; Esc goes back to the details, then closes', () => {
    const closed = spyOn(component.closed, 'emit');
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.panel-actions .btn-cta') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.mode).toBe('edit');
    expect(el.querySelector('.panel-title')!.textContent).toContain('Edit department');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.mode).toBe('view');
    expect(closed).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalled();
  });

  describe('create mode', () => {
    beforeEach(() => {
      component.deptId = null;
      component.reset();
      fixture.detectChanges();
    });

    it('offers only the built-in keys, and says when the picked key is shared', () => {
      expect(component.accessKeys.map(k => k.key)).toEqual(['general', 'box-office', 'tenting', 'workshop', 'hospitality', 'medical', 'wash', 'volunteer']);
      component.editForm.get('key')!.setValue('workshop');
      expect(component.sharedWith).toBe('Workshop Tent A');
      expect(component.keyAbout).toContain('door');
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('Shared with: Workshop Tent A — same access');
      component.editForm.get('key')!.setValue('wash');
      expect(component.sharedWith).toBe('');
    });

    it('starts on "general" (no page access) and the key never follows the name', () => {
      expect(component.mode).toBe('create');
      expect(component.editForm.get('key')!.value).toBe('general');
      component.editForm.get('name')!.setValue('Box Office');
      expect(component.editForm.get('key')!.value).toBe('general');
      expect(component.sharedWith).toBe('');   // nothing to share on "general"
      expect(component.formInvalid).toBeFalse();
    });

    it('refuses a key that is not built-in', () => {
      component.editForm.get('name')!.setValue('Ops');
      component.editForm.get('key')!.setValue('finance');
      expect(component.formInvalid).toBeTrue();
      component.editForm.get('key')!.setValue('');
      expect(component.formInvalid).toBeTrue();
    });

    it('creates the department, then adds the chosen members', () => {
      const changed = spyOn(component.changed, 'emit');
      adminServiceSpy.createDepartment.and.returnValue(of({ _id: 'd5', name: 'Finance' }));
      adminServiceSpy.updateDepartment.and.returnValue(of({}));
      component.editForm.get('name')!.setValue('Finance');
      component.editForm.get('key')!.setValue('wash');   // the picked built-in key is what is sent
      component.editedTls = [{ _id: 'tl2', name: 'Carol DIR' }];
      component.save();
      expect(adminServiceSpy.createDepartment).toHaveBeenCalledWith({ name: 'Finance', key: 'wash', description: '' });
      expect(adminServiceSpy.updateDepartment).toHaveBeenCalledWith('d5', { addUserIds: ['tl2'] });
      expect(changed).toHaveBeenCalledWith('d5');
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Department created');
    });

    it('creates without a second request when no members were added', () => {
      adminServiceSpy.createDepartment.and.returnValue(of({ _id: 'd5', name: 'Finance' }));
      component.editForm.get('name')!.setValue('Finance');
      component.save();
      expect(adminServiceSpy.updateDepartment).not.toHaveBeenCalled();
    });

    it('Cancel closes the panel', () => {
      const closed = spyOn(component.closed, 'emit');
      component.cancel();
      expect(closed).toHaveBeenCalled();
    });
  });

  describe('volunteers needed (for the sidebar event)', () => {
    it('is hidden without an event, and nothing is sent', () => {
      expect(component.showNeeded).toBeFalse();
      adminServiceSpy.updateDepartment.and.returnValue(of({}));
      component.enterEditMode();
      component.save();
      expect(volunteersSpy.need).not.toHaveBeenCalled();
      expect(volunteersSpy.setNeed).not.toHaveBeenCalled();
    });

    it('Edit shows the saved number and sends it only when changed', fakeAsync(() => {
      component.eventId = 'e1';
      adminServiceSpy.updateDepartment.and.returnValue(of({}));
      component.enterEditMode();
      flushMicrotasks();
      expect(volunteersSpy.need).toHaveBeenCalledWith('e1', 'd1');
      expect(component.editForm.get('needed')!.value).toBe(4);
      component.save();
      flushMicrotasks();
      expect(volunteersSpy.setNeed).not.toHaveBeenCalled();

      component.enterEditMode();
      flushMicrotasks();
      component.editForm.get('needed')!.setValue(6);
      component.save();
      flushMicrotasks();
      expect(volunteersSpy.setNeed).toHaveBeenCalledWith('e1', 'd1', 6);
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Department updated');
    }));

    it('Create sends the number for the new department; a bad number blocks Save', fakeAsync(() => {
      component.deptId = null;
      component.eventId = 'e1';
      component.reset();
      adminServiceSpy.createDepartment.and.returnValue(of({ _id: 'd5', name: 'Finance' }));
      component.editForm.get('name')!.setValue('Finance');
      component.editForm.get('needed')!.setValue(2.5);
      expect(component.formInvalid).toBeTrue();
      component.editForm.get('needed')!.setValue(8);
      component.save();
      flushMicrotasks();
      expect(volunteersSpy.setNeed).toHaveBeenCalledWith('e1', 'd5', 8);
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Department created');

      component.editForm.get('key')!.setValue('volunteer');   // the Unassigned pool has no number
      expect(component.showNeeded).toBeFalse();
    }));
  });

  describe('enterEditMode()', () => {
    it('copies the Team Leads into the working set', () => {
      component.enterEditMode();
      expect(component.editedTls).toEqual([{ _id: 'tl1', name: 'Alice TL' }]);
    });

    it('populates the edit form with current name and description', () => {
      component.enterEditMode();
      expect(component.editForm.get('name')!.value).toBe('Box Office');
      expect(component.editForm.get('description')!.value).toBe('Handles ticket sales');
    });

    it('switches to edit mode', () => {
      component.enterEditMode();
      expect(component.mode).toBe('edit');
    });

    it('triggers getAllUsers when users have not been loaded yet', () => {
      component.usersLoaded = false;
      component.enterEditMode();
      expect(adminServiceSpy.getAllUsers).toHaveBeenCalled();
    });

    it('does not call getAllUsers again if already loaded', () => {
      component.usersLoaded = true;
      component.enterEditMode();
      expect(adminServiceSpy.getAllUsers).not.toHaveBeenCalled();
    });
  });

  describe('cancel()', () => {
    it('leaves edit for the details', () => {
      component.enterEditMode();
      component.cancel();
      expect(component.mode).toBe('view');
    });
  });

  describe('removeTl()', () => {
    it('removes the specified TL from editedTls', () => {
      component.enterEditMode();
      component.editedTls = [{ _id: 'tl1', name: 'Alice TL' }, { _id: 'tl2', name: 'Carol DIR' }];
      component.removeTl('tl1');
      expect(component.editedTls.map(t => t._id)).not.toContain('tl1');
      expect(component.editedTls.map(t => t._id)).toContain('tl2');
    });
  });

  describe('save()', () => {
    beforeEach(() => {
      component.detail = mockDetail;
      component.enterEditMode();
      adminServiceSpy.updateDepartment.and.returnValue(of({}));
    });

    it('sends addUserIds for newly added users', () => {
      // Add a new TL (tl2 was not in original)
      component.editedTls.push({ _id: 'tl2', name: 'Carol DIR' });
      component.save();
      const payload = adminServiceSpy.updateDepartment.calls.mostRecent().args[1];
      expect(payload.addUserIds).toContain('tl2');
    });

    it('sends removeUserIds for users that were removed', () => {
      // Remove original TL (tl1)
      component.editedTls = [];
      component.save();
      const payload = adminServiceSpy.updateDepartment.calls.mostRecent().args[1];
      expect(payload.removeUserIds).toContain('tl1');
    });

    it('never sends volunteers: they are assigned on the Volunteers page', () => {
      component.editedTls = [];
      component.save();
      const payload = adminServiceSpy.updateDepartment.calls.mostRecent().args[1];
      expect(payload.removeUserIds).toEqual(['tl1']);   // v1 stays out of both lists
      expect(payload.addUserIds).toEqual([]);
    });

    it('sends empty arrays when nothing changed', () => {
      component.save();
      const payload = adminServiceSpy.updateDepartment.calls.mostRecent().args[1];
      expect(payload.addUserIds).toHaveSize(0);
      expect(payload.removeUserIds).toHaveSize(0);
    });

    it('exits edit mode and reloads detail on success', () => {
      component.save();
      expect(component.mode).toBe('view');
      expect(adminServiceSpy.getDepartmentDetail).toHaveBeenCalledTimes(2);
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Department updated');
    });

    it('shows error notification and stays in edit mode on API failure', () => {
      adminServiceSpy.updateDepartment.and.returnValue(
        throwError(() => ({ error: { message: 'Server error' } }))
      );
      component.save();
      expect(component.mode).toBe('edit');
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Server error');
    });

    it('does nothing if form is invalid', () => {
      component.editForm.get('name')!.setValue('');
      component.save();
      expect(adminServiceSpy.updateDepartment).not.toHaveBeenCalled();
    });
  });

});
