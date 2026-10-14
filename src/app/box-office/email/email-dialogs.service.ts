import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { Ticket } from '../../models/ticket.model';
import { EmailBatch } from '../../models/email.model';
import { EmailService } from '../../core/email.service';
import { EmailBatchTrackerService } from '../../core/email-batch-tracker.service';
import { TicketEmailDialogComponent, TicketEmailDialogData } from './ticket-email-dialog/ticket-email-dialog.component';
import { CustomEmailDialogComponent, CustomEmailDialogData } from './custom-email-dialog/custom-email-dialog.component';

/**
 * One way to send emails from anywhere in Box Office (Email epic): reads a
 * fresh email config (who can send, test mode, today's allowance), opens the
 * right dialog, and hands the started batch to the app-wide progress tracker.
 * Emits the batch, or undefined if cancelled / not allowed.
 */
@Injectable({ providedIn: 'root' })
export class EmailDialogsService {

  constructor(
    private dialog: MatDialog,
    private emailService: EmailService,
    private tracker: EmailBatchTrackerService
  ) { }

  openTicketEmail(tickets: Ticket[]): Observable<EmailBatch | undefined> {
    return this.emailService.getConfig(true).pipe(
      switchMap(config => {
        if (!config.canSendTicket || !tickets.length) return of(undefined);
        return this.dialog.open<TicketEmailDialogComponent, TicketEmailDialogData, EmailBatch>(TicketEmailDialogComponent, {
          width: '560px', maxWidth: '95vw', autoFocus: false, data: { tickets, config }
        }).afterClosed();
      }),
      tap(batch => {
        if (batch) this.tracker.track(batch, this.label('ticket', batch, tickets));
      })
    );
  }

  openCustomEmail(tickets: Ticket[]): Observable<EmailBatch | undefined> {
    return this.emailService.getConfig(true).pipe(
      switchMap(config => {
        if (!config.canSendCustom || !tickets.length) return of(undefined);
        return this.dialog.open<CustomEmailDialogComponent, CustomEmailDialogData, EmailBatch>(CustomEmailDialogComponent, {
          width: '720px', maxWidth: '95vw', autoFocus: false, data: { tickets, config }
        }).afterClosed();
      }),
      tap(batch => {
        if (batch) this.tracker.track(batch, this.label('custom', batch, tickets));
      })
    );
  }

  private label(type: 'ticket' | 'custom', batch: EmailBatch, tickets: Ticket[]): string {
    const what = type === 'ticket' ? 'Ticket email' : 'Custom email';
    if (tickets.length === 1) return `${what} · ${tickets[0].first_name} ${tickets[0].last_name}`.trim();
    return `${what}s · ${batch.total} booking${batch.total === 1 ? '' : 's'}`;
  }
}
