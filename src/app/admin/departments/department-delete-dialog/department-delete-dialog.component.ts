import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface DeleteDeptDialogData {
  deptName: string;
  users: { _id: string; name: string }[];
}

@Component({
  selector: 'app-department-delete-dialog',
  templateUrl: './department-delete-dialog.component.html',
})
export class DepartmentDeleteDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<DepartmentDeleteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeleteDeptDialogData
  ) {}

  confirm() { this.dialogRef.close(true); }
  cancel() { this.dialogRef.close(false); }
}
