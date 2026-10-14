import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, Subject } from 'rxjs';

import { EmailHistoryComponent } from './email-history.component';
import { EmailService } from '../../../core/email.service';
import { EmailBatchTrackerService } from '../../../core/email-batch-tracker.service';
import { EmailBatch, EmailLogEntry } from '../../../models/email.model';

const entry = (over: Partial<EmailLogEntry> = {}): EmailLogEntry => ({
  _id: 'e1', type: 'ticket', status: 'sent', to: 'a@example.com', subject: 'BiG 7.0 Tickets',
  sentBy: { _id: 'u1', name: 'Sam Admin' }, createdAt: '2026-10-14T10:00:00Z', sentAt: '2026-10-14T10:00:05Z', ...over
});

describe('EmailHistoryComponent', () => {
  let fixture: ComponentFixture<EmailHistoryComponent>;
  let component: EmailHistoryComponent;
  let emailSpy: jasmine.SpyObj<EmailService>;
  let finished$: Subject<EmailBatch>;

  const setup = async (canSend: boolean) => {
    emailSpy = jasmine.createSpyObj('EmailService', ['canSend', 'getBookingHistory']);
    emailSpy.canSend.and.returnValue(of(canSend));
    emailSpy.getBookingHistory.and.returnValue(of([
      entry(),
      entry({ _id: 'e2', type: 'custom', status: 'failed', subject: 'Gate times', error: 'Mailbox full', redirectedTo: 'tester@example.com' })
    ]));
    finished$ = new Subject<EmailBatch>();
    await TestBed.configureTestingModule({
      declarations: [EmailHistoryComponent],
      providers: [
        { provide: EmailService, useValue: emailSpy },
        { provide: EmailBatchTrackerService, useValue: { finished$: finished$.asObservable() } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(EmailHistoryComponent);
    component = fixture.componentInstance;
    component.ticketId = 't1';
    fixture.detectChanges();
  };

  it('lists the booking\'s emails for people who can send', async () => {
    await setup(true);
    expect(emailSpy.getBookingHistory).toHaveBeenCalledWith('t1');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('BiG 7.0 Tickets');
    expect(text).toContain('by Sam Admin');
    expect(text).toContain('Mailbox full');
    expect(text).toContain('test → tester@example.com');
    expect(component.statusBadge(component.items[1])).toBe('br');
    expect(component.typeLabel(component.items[1])).toBe('Custom');
  });

  describe('delivery (Brevo webhook)', () => {
    beforeEach(async () => await setup(true));

    it('shows the delivery outcome instead of plain "Sent" once Brevo reports back', () => {
      const delivered = entry({ delivery: { status: 'delivered' } });
      expect(component.statusLabel(delivered)).toBe('Delivered');
      expect(component.statusBadge(delivered)).toBe('bg');
      expect(component.statusLabel(entry())).toBe('Sent');
    });

    it('shows a bounce as a red badge with its reason', () => {
      const bounced = entry({ delivery: { status: 'bounced', reason: 'mailbox does not exist' } });
      expect(component.statusLabel(bounced)).toBe('Bounced');
      expect(component.statusBadge(bounced)).toBe('br');
      expect(component.problem(bounced)).toBe('mailbox does not exist');
    });

    it('shows the first open time only for a sent email', () => {
      expect(component.openedAt(entry({ delivery: { status: 'delivered', firstOpenedAt: '2026-10-14T11:00:00Z' } })))
        .toBe('2026-10-14T11:00:00Z');
      expect(component.openedAt(entry({ status: 'failed', delivery: { status: 'delivered', firstOpenedAt: 'x' } })))
        .toBeNull();
    });

    it('keeps the send error for a failed email', () => {
      expect(component.problem(entry({ status: 'failed', error: 'SMTP said no' }))).toBe('SMTP said no');
      expect(component.problem(entry())).toBe('');
    });

    it('renders the approximate open note', () => {
      emailSpy.getBookingHistory.and.returnValue(of([
        entry({ delivery: { status: 'delivered', firstOpenedAt: '2026-10-14T11:00:00Z' } })
      ]));
      component.load();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('(approx.)');
      expect(fixture.nativeElement.textContent).toContain('Delivered');
    });
  });

  it('shows nothing and loads nothing for people who cannot send', async () => {
    await setup(false);
    expect(emailSpy.getBookingHistory).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('reloads when a send finishes', async () => {
    await setup(true);
    emailSpy.getBookingHistory.calls.reset();
    finished$.next({ id: 'b1' } as EmailBatch);
    expect(emailSpy.getBookingHistory).toHaveBeenCalledWith('t1');
  });
});
