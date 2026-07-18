import { Component } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { AdminService } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';

@Component({
  selector: 'app-department-create-dialog',
  templateUrl: './department-create-dialog.component.html',
})
export class DepartmentCreateDialogComponent {
  form = new FormGroup({
    name: new FormControl('', Validators.required),
    description: new FormControl('')
  });
  saving = false;

  constructor(
    private dialogRef: MatDialogRef<DepartmentCreateDialogComponent>,
    private adminService: AdminService,
    private notificationService: NotificationService
  ) {}

  save() {
    if (this.form.invalid || this.saving) return;
    this.saving = true;
    const { name, description } = this.form.value;
    this.adminService.createDepartment({ name: name!.trim(), description: description || '' }).subscribe({
      next: (dept) => {
        this.saving = false;
        this.dialogRef.close(dept);
      },
      error: (err) => {
        this.saving = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Error creating department');
      }
    });
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
