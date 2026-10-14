import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { Ticket } from '../../../models/ticket.model';
import { EmailBatch, EmailConfig, TicketEmailMode } from '../../../models/email.model';
import { EmailService } from '../../../core/email.service';
import { NotificationService } from '../../../core/notification.service';
import { ticketEmailStatus } from '../../box-office.utils';
import { rememberTester, recallTester, isValidEmail } from '../email-tester';

export interface TicketEmailDialogData {
  tickets: Ticket[];
  config: EmailConfig;
}

/**
 * Confirm + send Ticket Emails for the selected bookings (Email epic).
 * Shows who'll get one, lets staff choose unsent-only or resend-all, and in
 * test mode requires a tester address that every email is redirected to.
 * Closes with the started batch (or nothing if cancelled).
 */
@Component({
  selector: 'app-ticket-email-dialog',
  templateUrl: './ticket-email-dialog.component.html',
  styleUrls: ['../email-dialog.css']
})
export class TicketEmailDialogComponent {

  mode: TicketEmailMode = 'unsent';
  tester = recallTester();
  sending = false;
  testing = false;
  error = '';

  readonly notSent: Ticket[];
  readonly alreadySent: Ticket[];
  readonly inProgress: Ticket[];
  readonly noEmail: Ticket[];

  constructor(
    public dialogRef: MatDialogRef<TicketEmailDialogComponent, EmailBatch>,
    @Inject(MAT_DIALOG_DATA) public data: TicketEmailDialogData,
    private emailService: EmailService,
    private notificationService: NotificationService
  ) {
    const hasEmail = (t: Ticket) => isValidEmail(t.email);
    this.inProgress = data.tickets.filter(t => ticketEmailStatus(t) === 'sending');
    const rest = data.tickets.filter(t => ticketEmailStatus(t) !== 'sending');
    this.noEmail = rest.filter(t => !hasEmail(t));
    this.alreadySent = rest.filter(t => hasEmail(t) && ticketEmailStatus(t) === 'sent');
    this.notSent = rest.filter(t => hasEmail(t) && ticketEmailStatus(t) !== 'sent');
    // Nothing new to send but some already sent → resending is the only useful choice.
    if (!this.notSent.length && this.alreadySent.length) this.mode = 'all';
  }

  get single(): boolean {
    return this.data.tickets.length === 1;
  }

  get toSendCount(): number {
    return this.mode === 'all' ? this.notSent.length + this.alreadySent.length : this.notSent.length;
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

  get testerValid(): boolean {
    return !this.safeMode || isValidEmail(this.tester);
  }

  get canSend(): boolean {
    return this.toSendCount > 0 && this.testerValid && !this.overCap && !this.sending;
  }

  /** First booking that would actually get an email — used for the test copy. */
  get sampleTicket(): Ticket | undefined {
    return this.notSent[0] || this.alreadySent[0] || this.data.tickets[0];
  }

  send() {
    if (!this.canSend) return;
    this.sending = true;
    this.error = '';
    if (this.safeMode) rememberTester(this.tester);
    const ids = this.data.tickets.map(t => t._id!).filter(Boolean);
    this.emailService.sendTicketEmails(ids, this.mode, this.safeMode ? this.tester.trim() : undefined).subscribe({
      next: batch => this.dialogRef.close(batch),
      error: err => {
        this.sending = false;
        this.error = err?.error?.message || 'Could not start sending. Please try again.';
      }
    });
  }

  sendTest() {
    const ticket = this.sampleTicket;
    if (!ticket?._id || this.testing) return;
    this.testing = true;
    this.emailService.sendTest('ticket', ticket._id).subscribe({
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
