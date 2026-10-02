import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

/**
 * Generic confirm-prompt dialog — replaces native window.confirm() app-wide
 * with something styled consistently with the rest of the app (MatDialog
 * already gets the right shell via the global .mat-mdc-dialog-* overrides in
 * styles.css, same as every other dialog here — DepartmentDeleteDialog etc.
 * — so nothing new needed there; this just makes that shell reusable without
 * a dedicated component per confirm prompt).
 */
export interface ConfirmDialogData {
  title: string;
  message: string;
  /** Defaults to 'Confirm'. */
  confirmText?: string;
  /** Defaults to 'Cancel'. */
  cancelText?: string;
  /** true → confirm button styled .btn-danger (destructive actions, e.g.
   *  delete/vacate); false/omitted → .btn-cta (neutral/positive actions). */
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  templateUrl: './confirm-dialog.component.html',
})
export class ConfirmDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) { }

  confirm() { this.dialogRef.close(true); }
  cancel() { this.dialogRef.close(false); }
}
