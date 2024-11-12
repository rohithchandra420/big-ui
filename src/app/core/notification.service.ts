import { Injectable } from "@angular/core";
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class NotificationService {

    constructor(private _snackBar: MatSnackBar) {

    }

    openSucessSnackBar(message) {
        this._snackBar.open(message, 'Close', {
          duration: 50000,
          horizontalPosition: 'end',
          verticalPosition: 'bottom',
          panelClass: ['custom-snackbar', 'snackbar-success'],
        });
      }
    
      openErrorSnackBar(message) {
        this._snackBar.open(message, 'Close', {
          duration: 10000,
          horizontalPosition: 'end',
          verticalPosition: 'bottom',
          panelClass: ['custom-snackbar', 'snackbar-error'],
        });
      }
}