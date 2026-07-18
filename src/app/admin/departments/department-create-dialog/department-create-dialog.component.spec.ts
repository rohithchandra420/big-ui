import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';
import { DepartmentCreateDialogComponent } from './department-create-dialog.component';
import { AdminService } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';

describe('DepartmentCreateDialogComponent', () => {
  let component: DepartmentCreateDialogComponent;
  let fixture: ComponentFixture<DepartmentCreateDialogComponent>;
  let adminServiceSpy: jasmine.SpyObj<AdminService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<DepartmentCreateDialogComponent>>;

  beforeEach(async () => {
    adminServiceSpy = jasmine.createSpyObj('AdminService', ['createDepartment']);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      declarations: [DepartmentCreateDialogComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: AdminService, useValue: adminServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(DepartmentCreateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('form is invalid when name is empty', () => {
    component.form.get('name')!.setValue('');
    expect(component.form.invalid).toBeTrue();
  });

  it('form is valid when name is provided', () => {
    component.form.get('name')!.setValue('Finance');
    expect(component.form.valid).toBeTrue();
  });

  it('cancel() closes dialog with null without calling API', () => {
    component.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(null);
    expect(adminServiceSpy.createDepartment).not.toHaveBeenCalled();
  });

  it('save() does nothing if form is invalid', () => {
    component.form.get('name')!.setValue('');
    component.save();
    expect(adminServiceSpy.createDepartment).not.toHaveBeenCalled();
  });

  it('save() calls createDepartment and closes dialog with result on success', () => {
    const created = { _id: 'd1', name: 'Finance', description: '' };
    adminServiceSpy.createDepartment.and.returnValue(of(created));
    component.form.get('name')!.setValue('Finance');
    component.form.get('description')!.setValue('');

    component.save();

    expect(adminServiceSpy.createDepartment).toHaveBeenCalledWith({ name: 'Finance', description: '' });
    expect(dialogRefSpy.close).toHaveBeenCalledWith(created);
  });

  it('save() shows error notification and does not close on API failure', () => {
    adminServiceSpy.createDepartment.and.returnValue(
      throwError(() => ({ error: { message: 'Duplicate name' } }))
    );
    component.form.get('name')!.setValue('Finance');

    component.save();

    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Duplicate name');
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('save() trims whitespace from name before sending', () => {
    adminServiceSpy.createDepartment.and.returnValue(of({ _id: 'd1', name: 'Finance', description: '' }));
    component.form.get('name')!.setValue('  Finance  ');

    component.save();

    expect(adminServiceSpy.createDepartment).toHaveBeenCalledWith(jasmine.objectContaining({ name: 'Finance' }));
  });
});
