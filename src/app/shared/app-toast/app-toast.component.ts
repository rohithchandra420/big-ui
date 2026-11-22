import { Component, Inject, OnDestroy, OnInit } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

export type ToastKind = 'success' | 'error';

export interface ToastData {
  kind: ToastKind;
  message: string;
  /** ms before it closes by itself; 0 = stays until closed (errors, user 2026-11-22). */
  duration: number;
}

/**
 * B-043: the app's alert (option A of the mock, user 2026-11-22): a light
 * card with a coloured icon and a close button. Success closes by itself
 * after a few seconds, with a thin bar showing the time left; hovering
 * pauses it. Errors stay until closed. Styles: `.app-toast` in styles.css.
 */
@Component({
  selector: 'app-toast',
  template: `
    <div class="app-toast" [class.ok]="data.kind === 'success'" [class.err]="data.kind === 'error'"
         [attr.role]="data.kind === 'error' ? 'alert' : 'status'"
         (mouseenter)="pause()" (mouseleave)="resume()">
      <span class="at-ic"><mat-icon class="ms-fill">{{ data.kind === 'error' ? 'error' : 'check_circle' }}</mat-icon></span>
      <span class="at-msg">{{ data.message }}</span>
      <button type="button" class="at-x" aria-label="Close" (click)="close()"><mat-icon>close</mat-icon></button>
      <i class="at-bar" *ngIf="data.duration" [style.animation-duration.ms]="data.duration" [class.paused]="paused"></i>
    </div>`
})
export class AppToastComponent implements OnInit, OnDestroy {
  paused = false;
  private left = 0;
  private startedAt = 0;
  private timer: any = null;

  constructor(@Inject(MAT_SNACK_BAR_DATA) public data: ToastData, private ref: MatSnackBarRef<AppToastComponent>) { }

  ngOnInit() {
    this.left = this.data.duration;
    if (this.left) this.start();
  }

  ngOnDestroy() { clearTimeout(this.timer); }

  private start() {
    this.startedAt = Date.now();
    this.timer = setTimeout(() => this.close(), this.left);
  }

  pause() {
    if (!this.data.duration || this.paused) return;
    clearTimeout(this.timer);
    this.left = Math.max(0, this.left - (Date.now() - this.startedAt));
    this.paused = true;
  }

  resume() {
    if (!this.data.duration || !this.paused) return;
    this.paused = false;
    this.start();
  }

  close() { this.ref.dismiss(); }
}
