import { Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { EmailLogEntry, EmailLogStatus, EmailType } from '../../../models/email.model';
import { EmailService } from '../../../core/email.service';
import { EmailBatchTrackerService } from '../../../core/email-batch-tracker.service';
import { deliveryBadge, deliveryLabel, deliveryProblem, deliveryStatus } from '../email-delivery.utils';

const TYPE_LABELS: Record<EmailType, string> = { ticket: 'Ticket', custom: 'Custom', test: 'Test' };
const STATUS_LABELS: Record<EmailLogStatus, string> = {
  queued: 'Queued', sending: 'Sending…', sent: 'Sent', failed: 'Failed', skipped: 'Skipped'
};
const STATUS_BADGES: Record<EmailLogStatus, string> = {
  queued: 'bx', sending: 'bb', sent: 'bg', failed: 'br', skipped: 'ba'
};

/**
 * A booking's email history, newest first (Email epic) — Bookings detail
 * panel and Booking Found. Only shown to people who can send (the history
 * endpoint uses the same access rule). Refreshes when any batch finishes.
 */
@Component({
  selector: 'app-email-history',
  templateUrl: './email-history.component.html',
  styleUrls: ['./email-history.component.css']
})
export class EmailHistoryComponent implements OnInit, OnChanges, OnDestroy {

  @Input() ticketId: string | null | undefined = null;

  canSend = false;
  loading = false;
  items: EmailLogEntry[] = [];

  private subs: Subscription[] = [];

  constructor(private emailService: EmailService, private tracker: EmailBatchTrackerService) { }

  ngOnInit() {
    this.subs.push(this.emailService.canSend().subscribe(can => {
      this.canSend = can;
      this.load();
    }));
    this.subs.push(this.tracker.finished$.subscribe(() => this.load()));
  }

  ngOnChanges() {
    this.load();
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  load() {
    if (!this.canSend || !this.ticketId) {
      this.items = [];
      return;
    }
    const id = this.ticketId;
    this.loading = true;
    this.emailService.getBookingHistory(id).subscribe({
      next: items => {
        if (id !== this.ticketId) return;
        this.items = items;
        this.loading = false;
      },
      error: () => {
        this.items = [];
        this.loading = false;
      }
    });
  }

  trackById(_: number, e: EmailLogEntry): string {
    return e._id;
  }

  typeLabel(e: EmailLogEntry): string {
    return TYPE_LABELS[e.type] || e.type;
  }

  // Once Brevo has reported back (webhook), the delivery outcome replaces the
  // plain "Sent" badge — "Delivered" / "Bounced" says more than "Sent".
  statusLabel(e: EmailLogEntry): string {
    const d = deliveryStatus(e);
    return d ? deliveryLabel(d) : (STATUS_LABELS[e.status] || e.status);
  }

  statusBadge(e: EmailLogEntry): string {
    const d = deliveryStatus(e);
    return d ? deliveryBadge(d) : (STATUS_BADGES[e.status] || 'bx');
  }

  /** Send error (failed/skipped) or delivery problem (bounce reason etc.). */
  problem(e: EmailLogEntry): string {
    if (e.error && e.status !== 'sent') return e.error;
    return deliveryProblem(e);
  }

  /** First open time — approximate, see EmailDelivery.firstOpenedAt. */
  openedAt(e: EmailLogEntry): string | null {
    return deliveryStatus(e) ? (e.delivery?.firstOpenedAt || null) : null;
  }

  senderName(e: EmailLogEntry): string {
    return typeof e.sentBy === 'object' && e.sentBy ? e.sentBy.name : '';
  }
}
