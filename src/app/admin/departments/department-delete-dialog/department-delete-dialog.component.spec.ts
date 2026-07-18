import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { DepartmentDeleteDialogComponent } from './department-delete-dialog.component';

describe('DepartmentDeleteDialogComponent', () => {
  let component: DepartmentDeleteDialogComponent;
  let fixture: ComponentFixture<DepartmentDeleteDialogComponent>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<DepartmentDeleteDialogComponent>>;

  const dataWithUsers = {
    deptName: 'Finance',
    users: [{ _id: 'u1', name: 'Alice' }, { _id: 'u2', name: 'Bob' }]
  };

  const dataEmpty = { deptName: 'Empty Dept', users: [] };

  beforeEach(async () => {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      declarations: [DepartmentDeleteDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: dataWithUsers }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(DepartmentDeleteDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should expose injected dialog data', () => {
    expect(component.data.deptName).toBe('Finance');
    expect(component.data.users).toHaveSize(2);
  });

  it('confirm() closes dialog with true', () => {
    component.confirm();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(true);
  });

  it('cancel() closes dialog with false', () => {
    component.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith(false);
  });

  it('shows zero users when dept has no assigned users', async () => {
    // Re-configure with empty data
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      declarations: [DepartmentDeleteDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: dataEmpty }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    const f = TestBed.createComponent(DepartmentDeleteDialogComponent);
    f.detectChanges();
    expect(f.componentInstance.data.users).toHaveSize(0);
  });
});
