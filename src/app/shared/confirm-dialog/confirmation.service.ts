import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

/**
 * Thin wrapper around MatDialog so call sites don't need to import MatDialog
 * + ConfirmDialogComponent + wire up .afterClosed() every time. Emits a
 * single boolean (true = confirmed) rather than the raw dialog result, so
 * dismissing via the backdrop/Esc (undefined) reads the same as clicking
 * Cancel (false).
 */
@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  constructor(private dialog: MatDialog) { }

  confirm(data: ConfirmDialogData): Observable<boolean> {
    const ref = this.dialog.open(ConfirmDialogComponent, { width: '420px', data });
    return ref.afterClosed().pipe(map(result => !!result));
  }
}
