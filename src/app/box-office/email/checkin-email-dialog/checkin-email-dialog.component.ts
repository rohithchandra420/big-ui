import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { Ticket } from '../../../models/ticket.model';
import { CheckinEmailMode, EmailBatch, EmailConfig } from '../../../models/email.model';
import { EmailService } from '../../../core/email.service';
import { NotificationService } from '../../../core/notification.service';
import { festivalDetailsCount } from '../../box-office.utils';
import { rememberTester, recallTester, isValidEmail } from '../email-tester';

export interface CheckinEmailDialogData {
  tickets: Ticket[];
  config: EmailConfig;
}

export const CHECKIN_DEFAULT_DAYS = 14;
export const CHECKIN_MAX_DAYS = 60;

/**
 * Early Check-In EC2 (EARLY_CHECKIN_CONTEXT.md): confirm + send the email
 * with a one-time link to fill in Festival Pass details. Same counts the
 * server uses (cancelled / no Festival Pass / mid-send are skipped), a "works
 * for N days" field, details-missing-only or all, and the tester address in
 * test mode. Closes with the started batch (or nothing if cancelled).
 */
@Component({
  selector: 'app-checkin-email-dialog',
  templateUrl: './checkin-email-dialog.component.html',
  styleUrls: ['../email-dialog.css', './checkin-email-dialog.component.css']
})
export class CheckinEmailDialogComponent {

  mode: CheckinEmailMode = 'missing';
  days: number | null = CHECKIN_DEFAULT_DAYS;
  readonly maxDays = CHECKIN_MAX_DAYS;
  readonly dayPresets = [7, 14, 30];
  tester = recallTester();
  sending = false;
  testing = false;
  error = '';

  previewOpen = false;
  previewing = false;
  previewHtml: SafeHtml | null = null;
  previewSubject = '';
  previewTo = '';

  /** Details missing, has a buyer email. */
  readonly missing: Ticket[];
  /** Every Festival Pass filled, has a buyer email. */
  readonly complete: Ticket[];
  /** Cancelled, or no active Festival Pass: never sent. */
  readonly notEligible: Ticket[];
  readonly inProgress: Ticket[];
  readonly noEmail: Ticket[];

  constructor(
    public dialogRef: MatDialogRef<CheckinEmailDialogComponent, EmailBatch>,
    @Inject(MAT_DIALOG_DATA) public data: CheckinEmailDialogData,
    private emailService: EmailService,
    private notificationService: NotificationService,
    private sanitizer: DomSanitizer
  ) {
    const counts = new Map(data.tickets.map(t => [t, festivalDetailsCount(t)]));
    this.notEligible = data.tickets.filter(t => t.bookingStatus === 'cancelled' || !counts.get(t)!.total);
    const eligible = data.tickets.filter(t => !this.notEligible.includes(t));
    this.inProgress = eligible.filter(t => t.earlyCheckin?.status === 'sending');
    const rest = eligible.filter(t => !this.inProgress.includes(t));
    const isMissing = (t: Ticket) => counts.get(t)!.filled < counts.get(t)!.total;
    // Like the server: in "missing" mode a complete booking is skipped before its email is looked at.
    this.noEmail = rest.filter(t => !isValidEmail(t.email));
    this.missing = rest.filter(t => isValidEmail(t.email) && isMissing(t));
    this.complete = rest.filter(t => isValidEmail(t.email) && !isMissing(t));
    // Nothing missing but some complete → sending to all is the only useful choice.
    if (!this.missing.length && this.complete.length) this.mode = 'all';
  }

  get single(): boolean {
    return this.data.tickets.length === 1;
  }

  get toSendCount(): number {
    return this.mode === 'all' ? this.missing.length + this.complete.length : this.missing.length;
  }

  get safeMode(): boolean {
    return !!this.data.config.safeMode;
  }

  get remaining(): number | null {
    const r = this.data.config.remainingToday;
    return r === undefined ? null : r;
  }

  get overCap(): boolean {
    return this.remaining !== null && this.toSendCount > this.remaining;
  }

  get daysValid(): boolean {
    const d = Number(this.days);
    return Number.isInteger(d) && d >= 1 && d <= CHECKIN_MAX_DAYS;
  }

  /** The day the link stops working, for the hint under the field. */
  get worksUntil(): Date | null {
    return this.daysValid ? new Date(Date.now() + Number(this.days) * 24 * 60 * 60 * 1000) : null;
  }

  get testerValid(): boolean {
    return !this.safeMode || isValidEmail(this.tester);
  }

  get canSend(): boolean {
    return this.toSendCount > 0 && this.daysValid && this.testerValid && !this.overCap && !this.sending;
  }

  /** First booking that would actually get an email — for the preview and the test copy. */
  get sampleTicket(): Ticket | undefined {
    return this.missing[0] || this.complete[0];
  }

  setDays(d: number) {
    this.days = d;
    if (this.previewOpen) this.loadPreview();
  }

  togglePreview() {
    this.previewOpen = !this.previewOpen;
    if (this.previewOpen) this.loadPreview();
  }

  loadPreview() {
    const ticket = this.sampleTicket;
    if (!ticket?._id || !this.daysValid) return;
    this.previewing = true;
    this.previewHtml = null;
    this.emailService.preview('checkin', ticket._id, { days: Number(this.days) }).subscribe({
      next: p => {
        this.previewing = false;
        this.previewSubject = p.subject;
        this.previewTo = p.to;
        // Built by big-api from escaped text; shown in a sandboxed iframe (no scripts).
        this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(p.html);
      },
      error: err => {
        this.previewing = false;
        this.error = err?.error?.message || 'Could not build the preview';
      }
    });
  }

  send() {
    if (!this.canSend) return;
    this.sending = true;
    this.error = '';
    if (this.safeMode) rememberTester(this.tester);
    const ids = this.data.tickets.map(t => t._id!).filter(Boolean);
    this.emailService.sendCheckinEmails(ids, Number(this.days), this.mode, this.safeMode ? this.tester.trim() : undefined).subscribe({
      next: batch => this.dialogRef.close(batch),
      error: err => {
        this.sending = false;
        this.error = err?.error?.message || 'Could not start sending. Please try again.';
      }
    });
  }

  sendTest() {
    const ticket = this.sampleTicket;
    if (!ticket?._id || this.testing || !this.daysValid) return;
    this.testing = true;
    this.emailService.sendTest('checkin', ticket._id, { days: Number(this.days) }).subscribe({
      next: res => {
        this.testing = false;
        this.notificationService.openSucessSnackBar(`Test email sent to ${res.to}`);
      },
      error: err => {
        this.testing = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not send the test email');
      }
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}
