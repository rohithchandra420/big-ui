import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Observable } from 'rxjs';

import { Ticket } from '../../../models/ticket.model';
import { EmailBatch } from '../../../models/email.model';
import { EmailService } from '../../../core/email.service';
import { EmailDialogsService } from '../email-dialogs.service';
import { ticketEmailStatus } from '../../box-office.utils';

/**
 * "Send Ticket Email" / "Custom Email" for one booking (Email epic) — used
 * in the Bookings detail panel and on Booking Found. Renders nothing for
 * people who can't send.
 */
@Component({
  selector: 'app-email-actions',
  template: `
    <div class="btn-row email-actions-row" *ngIf="canSend$ | async">
      <button class="btn-secondary" *ngIf="canSendTicket$ | async" (click)="sendTicket()" [disabled]="!ticket || busy">
        {{ alreadySent ? 'Resend Ticket Email' : 'Send Ticket Email' }}
      </button>
      <button class="btn-secondary" *ngIf="canSendCustom$ | async" (click)="sendCustom()" [disabled]="!ticket || busy">Custom Email</button>
    </div>`,
  styles: [`.email-actions-row { display: flex; flex-wrap: wrap; gap: 8px; }`]
})
export class EmailActionsComponent implements OnInit {

  @Input() ticket: Ticket | null = null;
  /** Fires when a send has started (the progress card follows it from there). */
  @Output() sent = new EventEmitter<EmailBatch>();

  canSend$!: Observable<boolean>;
  canSendTicket$!: Observable<boolean>;
  canSendCustom$!: Observable<boolean>;
  busy = false;

  constructor(private emailService: EmailService, private emailDialogs: EmailDialogsService) { }

  ngOnInit() {
    this.canSend$ = this.emailService.canSend();
    this.canSendTicket$ = this.emailService.canSendTicket();
    this.canSendCustom$ = this.emailService.canSendCustom();
  }

  get alreadySent(): boolean {
    return ticketEmailStatus(this.ticket) === 'sent';
  }

  sendTicket() {
    if (!this.ticket || this.busy) return;
    this.busy = true;
    this.emailDialogs.openTicketEmail([this.ticket]).subscribe({
      next: batch => {
        this.busy = false;
        // The page reloads from the server (which knows whether this was a
        // test-mode send that leaves the booking untouched).
        if (batch) this.sent.emit(batch);
      },
      error: () => this.busy = false
    });
  }

  sendCustom() {
    if (!this.ticket || this.busy) return;
    this.busy = true;
    this.emailDialogs.openCustomEmail([this.ticket]).subscribe({
      next: batch => {
        this.busy = false;
        if (batch) this.sent.emit(batch);
      },
      error: () => this.busy = false
    });
  }
}
