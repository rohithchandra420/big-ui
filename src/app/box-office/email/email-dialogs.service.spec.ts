import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { EmailDialogsService } from './email-dialogs.service';
import { EmailService } from '../../core/email.service';
import { EmailBatchTrackerService } from '../../core/email-batch-tracker.service';
import { Ticket } from '../../models/ticket.model';
import { EmailBatch, EmailConfig } from '../../models/email.model';

const ticket = (id: string, first: string) => new Ticket(1, first, 'Menon', `${id}@example.com`, '9', 'TXN', 'not_sent', 1, [], id);
const batch: EmailBatch = { id: 'b1', type: 'ticket', total: 2, done: 0, sent: 0, failed: 0, skipped: 0, finished: false, startedAt: '', finishedAt: null };

describe('EmailDialogsService', () => {
  let service: EmailDialogsService;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let trackerSpy: jasmine.SpyObj<EmailBatchTrackerService>;
  let config: EmailConfig;
  let closeWith: EmailBatch | undefined;

  beforeEach(() => {
    config = { canSend: true, canSendTicket: true, canSendCustom: true, safeMode: true };
    closeWith = batch;
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    dialogSpy.open.and.callFake(() => ({ afterClosed: () => of(closeWith) }) as any);
    trackerSpy = jasmine.createSpyObj('EmailBatchTrackerService', ['track']);
    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialog, useValue: dialogSpy },
        { provide: EmailService, useValue: { getConfig: () => of(config) } },
        { provide: EmailBatchTrackerService, useValue: trackerSpy }
      ]
    });
    service = TestBed.inject(EmailDialogsService);
  });

  it('opens the Ticket Email dialog with fresh config and tracks the batch', () => {
    const tickets = [ticket('a', 'Asha'), ticket('b', 'Ravi')];
    let result: EmailBatch | undefined;
    service.openTicketEmail(tickets).subscribe(b => result = b);
    expect(dialogSpy.open.calls.mostRecent().args[1]!.data).toEqual({ tickets, config });
    expect(result).toBe(batch);
    expect(trackerSpy.track).toHaveBeenCalledWith(batch, 'Ticket emails · 2 bookings');
  });

  it('names the booking when sending to just one', () => {
    service.openCustomEmail([ticket('a', 'Asha')]).subscribe();
    expect(trackerSpy.track).toHaveBeenCalledWith(batch, 'Custom email · Asha Menon');
  });

  it('does not open anything for people who cannot send', () => {
    config = { canSend: false };
    let result: EmailBatch | undefined = batch;
    service.openTicketEmail([ticket('a', 'Asha')]).subscribe(b => result = b);
    expect(dialogSpy.open).not.toHaveBeenCalled();
    expect(result).toBeUndefined();
  });

  it('opens the Ticket Email dialog but not Custom Email for someone without custom access', () => {
    config = { canSend: true, canSendTicket: true, canSendCustom: false, safeMode: true };
    let custom: EmailBatch | undefined = batch;
    service.openCustomEmail([ticket('a', 'Asha')]).subscribe(b => custom = b);
    expect(dialogSpy.open).not.toHaveBeenCalled();
    expect(custom).toBeUndefined();

    service.openTicketEmail([ticket('a', 'Asha')]).subscribe();
    expect(dialogSpy.open).toHaveBeenCalledTimes(1);
  });

  it('does not track a cancelled dialog', () => {
    closeWith = undefined;
    service.openTicketEmail([ticket('a', 'Asha')]).subscribe();
    expect(trackerSpy.track).not.toHaveBeenCalled();
  });
});
