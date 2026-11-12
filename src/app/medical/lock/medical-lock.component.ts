import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { MedicalLockService } from '../medical-lock.service';

/** Covers a Medical page while the desk is locked; the password unlocks it (MEDICAL_CONTEXT.md, idle lock). */
@Component({
  selector: 'app-medical-lock',
  template: `
    <div class="md-lock" *ngIf="locked" role="dialog" aria-modal="true" aria-labelledby="md-lock-title">
      <form class="md-lock-card" (ngSubmit)="unlock()">
        <span class="md-lock-ic"><mat-icon class="ms-fill">lock</mat-icon></span>
        <h2 id="md-lock-title">Medical Desk is locked</h2>
        <p>Health records are hidden after {{ lock.lockMinutes }} minutes without activity. Enter your password to continue.</p>
        <label class="field">
          <span class="sr-only">Password</span>
          <input #pw type="password" name="password" [(ngModel)]="password" autocomplete="current-password" placeholder="Your password" required>
        </label>
        <div class="field-error" *ngIf="error">{{ error }}</div>
        <button type="submit" class="btn-cta" [disabled]="busy || !password">{{ busy ? 'Checking…' : 'Unlock' }}</button>
        <a class="md-lock-leave" routerLink="/">Leave the Medical Desk</a>
      </form>
    </div>`
})
export class MedicalLockComponent implements OnInit, OnDestroy {
  @ViewChild('pw') pw?: ElementRef<HTMLInputElement>;
  locked = false;
  password = '';
  error = '';
  busy = false;
  private sub?: Subscription;

  constructor(public lock: MedicalLockService) {}

  ngOnInit(): void {
    this.lock.enter();
    this.sub = this.lock.locked$.subscribe(v => {
      this.locked = v;
      if (v) setTimeout(() => this.pw?.nativeElement.focus());
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.lock.leave();
  }

  async unlock(): Promise<void> {
    if (!this.password || this.busy) return;
    this.busy = true;
    this.error = '';
    try {
      await this.lock.unlock(this.password);
      this.password = '';
    } catch (err: any) {
      this.error = err?.error?.message || 'Could not unlock. Try again.';
    } finally {
      this.busy = false;
    }
  }
}
