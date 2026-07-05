import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { DepartmentDetailComponent } from './department-detail.component';
import { AdminService, DeptDetail } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';

const mockDetail: DeptDetail = {
  _id: 'd1',
  name: 'Box Office',
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
  let router: Router;

  beforeEach(async () => {
    adminServiceSpy = jasmine.createSpyObj('AdminService', [
      'getDepartmentDetail', 'getAllUsers', 'updateDepartment'
    ]);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);

    adminServiceSpy.getDepartmentDetail.and.returnValue(of(mockDetail));
    adminServiceSpy.getAllUsers.and.returnValue(of(allUsers));

    await TestBed.configureTestingModule({
      declarations: [DepartmentDetailComponent],
      imports: [
        ReactiveFormsModule,
        RouterTestingModule
      ],
      providers: [
        { provide: AdminService, useValue: adminServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'd1' } } }
        }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(DepartmentDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads department detail on init using route param', () => {
    expect(adminServiceSpy.getDepartmentDetail).toHaveBeenCalledWith('d1');
    expect(component.detail).toEqual(mockDetail);
  });

  it('shows error notification when detail load fails', () => {
    adminServiceSpy.getDepartmentDetail.and.returnValue(throwError(() => new Error('fail')));
    component.loadDetail('d1');
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Error loading department');
  });

  describe('enterEditMode()', () => {
    it('copies TLs and volunteers into working sets', () => {
      component.enterEditMode();
      expect(component.editedTls).toEqual([{ _id: 'tl1', name: 'Alice TL' }]);
      expect(component.editedVolunteers.length).toBe(1);
      expect(component.editedVolunteers[0]._id).toBe('v1');
    });

    it('populates the edit form with current name and description', () => {
      component.enterEditMode();
      expect(component.editForm.get('name')!.value).toBe('Box Office');
      expect(component.editForm.get('description')!.value).toBe('Handles ticket sales');
    });

    it('sets editMode to true', () => {
      component.enterEditMode();
      expect(component.editMode).toBeTrue();
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

  describe('cancelEdit()', () => {
    it('sets editMode to false and clears warnings', () => {
      component.enterEditMode();
      component.volWarnings = { v2: 'Finance' };
      component.cancelEdit();
      expect(component.editMode).toBeFalse();
      expect(component.volWarnings).toEqual({});
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

  describe('removeVol()', () => {
    it('removes the specified volunteer from editedVolunteers', () => {
      component.enterEditMode();
      component.editedVolunteers = [
        { _id: 'v1', name: 'Bob VOL', departments: [] },
        { _id: 'v3', name: 'Eve VOL', departments: [] }
      ];
      component.removeVol('v1');
      expect(component.editedVolunteers.map(v => v._id)).not.toContain('v1');
    });

    it('clears the reassignment warning for the removed volunteer', () => {
      component.enterEditMode();
      component.editedVolunteers = [{ _id: 'v2', name: 'Dave VOL', departments: [] }];
      component.volWarnings = { v2: 'Finance' };
      component.removeVol('v2');
      expect(component.volWarnings['v2']).toBeUndefined();
    });
  });

  describe('onVolSelected()', () => {
    beforeEach(() => {
      component.allUsers = allUsers;
      component.detail = mockDetail;
      component.editedVolunteers = [];
      component.volWarnings = {};
    });

    it('adds selected volunteer to editedVolunteers', () => {
      component.onVolSelected({ _id: 'v3', name: 'Eve VOL' });
      expect(component.editedVolunteers.map(v => v._id)).toContain('v3');
    });

    it('records a warning when VOL is already in a different department', () => {
      // v2 belongs to Finance (d9), not Box Office (d1)
      component.onVolSelected({ _id: 'v2', name: 'Dave VOL' });
      expect(component.volWarnings['v2']).toBe('Finance');
    });

    it('does not record a warning when VOL belongs to the current department', () => {
      // v1 belongs to Box Office (d1) — same as current dept
      component.onVolSelected({ _id: 'v1', name: 'Bob VOL' });
      expect(component.volWarnings['v1']).toBeUndefined();
    });

    it('does not record a warning when VOL has no existing departments', () => {
      component.onVolSelected({ _id: 'v3', name: 'Eve VOL' });
      expect(component.volWarnings['v3']).toBeUndefined();
    });
  });

  describe('warningList', () => {
    it('returns warning entries for each vol in volWarnings', () => {
      component.editedVolunteers = [{ _id: 'v2', name: 'Dave VOL', departments: [] }];
      component.volWarnings = { v2: 'Finance' };
      const list = component.warningList;
      expect(list).toHaveSize(1);
      expect(list[0].name).toBe('Dave VOL');
      expect(list[0].fromDept).toBe('Finance');
    });

    it('returns empty array when no warnings', () => {
      component.volWarnings = {};
      expect(component.warningList).toHaveSize(0);
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

    it('sends empty arrays when nothing changed', () => {
      component.save();
      const payload = adminServiceSpy.updateDepartment.calls.mostRecent().args[1];
      expect(payload.addUserIds).toHaveSize(0);
      expect(payload.removeUserIds).toHaveSize(0);
    });

    it('exits edit mode and reloads detail on success', () => {
      component.save();
      expect(component.editMode).toBeFalse();
      expect(adminServiceSpy.getDepartmentDetail).toHaveBeenCalledTimes(2);
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalledWith('Department updated');
    });

    it('shows error notification and stays in edit mode on API failure', () => {
      adminServiceSpy.updateDepartment.and.returnValue(
        throwError(() => ({ error: { message: 'Server error' } }))
      );
      component.save();
      expect(component.editMode).toBeTrue();
      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Server error');
    });

    it('does nothing if form is invalid', () => {
      component.editForm.get('name')!.setValue('');
      component.save();
      expect(adminServiceSpy.updateDepartment).not.toHaveBeenCalled();
    });
  });

  it('goBack() navigates to /admin/departments', () => {
    const navSpy = spyOn(router, 'navigate');
    component.goBack();
    expect(navSpy).toHaveBeenCalledWith(['/admin/departments']);
  });
});
