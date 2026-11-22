import { Injectable } from "@angular/core";
import { MatSnackBar } from '@angular/material/snack-bar';
import { AppToastComponent, ToastData, ToastKind } from '../shared/app-toast/app-toast.component';

/** B-043: success closes by itself after this long; errors stay until closed (user, 2026-11-22). */
export const SUCCESS_TOAST_MS = 4000;

@Injectable()
export class NotificationService {

    constructor(private _snackBar: MatSnackBar) {

    }

    openSucessSnackBar(message) {
        this.show('success', message, SUCCESS_TOAST_MS);
    }

    openErrorSnackBar(message) {
        this.show('error', message, 0);
    }

    private show(kind: ToastKind, message: any, duration: number) {
        const data: ToastData = { kind, message: toastText(message), duration };
        // The toast runs its own timer (it pauses on hover), so no snack-bar duration here.
        this._snackBar.openFromComponent(AppToastComponent, {
            data,
            horizontalPosition: 'end',
            verticalPosition: 'bottom',
            panelClass: ['app-toast-panel'],
        });
    }
}

/** Some callers pass an Error (e.g. the login page); show its text, never "Error: …". */
export function toastText(message: any): string {
    if (message instanceof Error) return message.message;
    if (typeof message === 'string') return message;
    return message?.message ? String(message.message) : String(message ?? '');
}
