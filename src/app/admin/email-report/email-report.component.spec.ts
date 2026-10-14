import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';

import { EmailReportComponent } from './email-report.component';
import { EmailService } from '../../core/email.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EmailBatchTrackerService } from '../../core/email-batch-tracker.service';
import { EmailBatch, EmailLogEntry, EmailLogPage } from '../../models/email.model';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

const entry = (over: Partial<EmailLogEntry> = {}): EmailLogEntry => ({
  _id: 'e1', type: 'ticket', status: 'sent', to: 'asha@example.com', recipientName: 'Asha Menon', subject: 'BiG 7.0 Tickets',
  orderId: 70001, event: { _id: 'ev1', name: 'BiG 7.0' }, sentBy: { _id: 'u1', name: 'Sam Admin' },
  createdAt: '2026-10-14T10:00:00Z', sentAt: '2026-10-14T10:00:05Z', ...over
});

const page = (items: EmailLogEntry[], over: Partial<EmailLogPage> = {}): EmailLogPage => ({
  items, total: items.length, page: 0, pageSize: 20,
  summary: { byStatus: { sent: 5, failed: 1 }, byType: { ticket: 6 }, byDelivery: { delivered: 3, bounced: 2, none: 0 }, opened: 2 },
  senders: [{ _id: 'u1', name: 'Sam Admin' }, { _id: 'u2', name: 'Lee TL' }],
  ...over
});

describe('EmailReportComponent', () => {
  let fixture: ComponentFixture<EmailReportComponent>;
  let component: EmailReportComponent;
  let emailSpy: jasmine.SpyObj<EmailService>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let finished$: Subject<EmailBatch>;

  beforeEach(async () => {
    emailSpy = jasmine.createSpyObj('EmailService', ['getLog', 'getLogEntry']);
    emailSpy.getLog.and.returnValue(of(page([
      entry(),
      entry({ _id: 'e2', type: 'custom', subject: 'Gate times', delivery: { status: 'bounced', reason: 'mailbox does not exist' } }),
      entry({ _id: 'e3', status: 'failed', error: 'SMTP said no', sentAt: null })
    ])));
    notifySpy = jasmine.createSpyObj('NotificationService', ['openErrorSnackBar', 'openSucessSnackBar']);
    finished$ = new Subject<EmailBatch>();

    await TestBed.configureTestingModule({
      declarations: [EmailReportComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: EmailService, useValue: emailSpy },
        { provide: EventService, useValue: { events: new BehaviorSubject([{ _id: 'ev1', name: 'BiG 7.0' }, { _id: 'ev2', name: 'BiG 6.0' }]) } },
        { provide: NotificationService, useValue: notifySpy },
        { provide: EmailBatchTrackerService, useValue: { finished$: finished$.asObservable() } },
        { provide: MatDialog, useValue: { openDialogs: [] } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(EmailReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const lastQuery = () => emailSpy.getLog.calls.mostRecent().args[0]!;

  it('loads the first page, all time, on open', () => {
    expect(lastQuery()).toEqual(jasmine.objectContaining({ page: 0, pageSize: 20, from: '', to: '' }));
    expect(component.items.length).toBe(3);
    expect(component.senders.length).toBe(2);
  });

  it('shows card counts from the summary', () => {
    expect(component.cardCount('sent')).toBe(5);
    expect(component.cardCount('delivered')).toBe(3);
    expect(component.cardCount('bounced')).toBe(2);
    expect(component.cardCount('failed')).toBe(1);
    expect(component.cardCount('opened')).toBe(2);
  });

  describe('cards and filters', () => {
    it('a card sets the matching dropdown and reloads from page 0', () => {
      component.pageIndex = 3;
      component.toggleCard('bounced');
      expect(component.deliveryFilter).toBe('bounced');
      expect(component.statusFilter).toBe('');
      expect(lastQuery()).toEqual(jasmine.objectContaining({ delivery: 'bounced', page: 0 }));
      expect(component.isCardActive('bounced')).toBeTrue();
    });

    it('tapping the active card clears it; another card replaces it', () => {
      component.toggleCard('failed');
      expect(component.statusFilter).toBe('failed');
      component.toggleCard('delivered');
      expect(component.statusFilter).toBe('');
      expect(component.deliveryFilter).toBe('delivered');
      component.toggleCard('delivered');
      expect(component.deliveryFilter).toBe('');
    });

    it('sends every filter to the server', () => {
      component.typeFilter = 'custom';
      component.eventFilter = 'ev2';
      component.senderFilter = 'u2';
      component.fromDate = '2026-10-01';
      component.toDate = '2026-10-14';
      component.onFilterChange();
      const q = lastQuery();
      expect(q.type).toBe('custom');
      expect(q.event).toBe('ev2');
      expect(q.sentBy).toBe('u2');
      // "to" covers the whole selected day
      expect(new Date(q.to!).getTime()).toBe(new Date('2026-10-14T23:59:59.999').getTime());
      expect(new Date(q.from!).getTime()).toBe(new Date('2026-10-01T00:00:00').getTime());
    });

    it('waits for typing to pause before searching', fakeAsync(() => {
      emailSpy.getLog.calls.reset();
      component.searchTerm = 'as';
      component.onSearchChange();
      component.searchTerm = 'asha';
      component.onSearchChange();
      tick(299);
      expect(emailSpy.getLog).not.toHaveBeenCalled();
      tick(1);
      expect(emailSpy.getLog).toHaveBeenCalledTimes(1);
      expect(lastQuery().q).toBe('asha');
    }));

    it('clears all filters at once', () => {
      component.typeFilter = 'test';
      component.deliveryFilter = 'opened';
      component.searchTerm = 'x';
      expect(component.hasFilters).toBeTrue();
      component.clearFilters();
      expect(component.hasFilters).toBeFalse();
    });

    it('keeps option lists stable between change-detection passes', () => {
      expect(component.deliveryOptions).toBe(component.deliveryOptions);
      expect(component.typeOptions.map(o => o.value)).toEqual(['ticket', 'custom', 'test']);
    });

    it('pages on the server', () => {
      component.onPageChange({ pageIndex: 2, pageSize: 50, length: 300 });
      expect(lastQuery()).toEqual(jasmine.objectContaining({ page: 2, pageSize: 50 }));
    });

    it('reloads when a send batch finishes', () => {
      emailSpy.getLog.calls.reset();
      finished$.next({} as EmailBatch);
      expect(emailSpy.getLog).toHaveBeenCalled();
    });

    it('ignores a slow older response that arrives after a newer one', () => {
      const slow = new Subject<EmailLogPage>();
      emailSpy.getLog.and.returnValues(slow.asObservable(), of(page([entry({ _id: 'new' })])));
      component.load();
      component.load();
      slow.next(page([entry({ _id: 'old' })]));
      expect(component.items.map(i => i._id)).toEqual(['new']);
    });
  });

  describe('rows', () => {
    it('shows delivery once Brevo reported back, otherwise the send status', () => {
      const [sent, bounced, failed] = component.items;
      expect(component.statusLabel(sent)).toBe('Sent');
      expect(component.statusLabel(bounced)).toBe('Bounced');
      expect(component.statusBadge(bounced)).toBe('br');
      expect(component.problem(bounced)).toBe('mailbox does not exist');
      expect(component.statusLabel(failed)).toBe('Failed');
      expect(component.problem(failed)).toBe('SMTP said no');
    });
  });

  describe('panel', () => {
    it('loads the full record and renders a custom body', () => {
      const full = entry({ _id: 'e2', type: 'custom', body: '<p>Gates open at 4</p>', delivery: { status: 'delivered', events: [{ event: 'delivered', at: '2026-10-14T10:01:00Z' }] } });
      emailSpy.getLogEntry.and.returnValue(of(full));
      component.openEmail(component.items[1]);
      expect(emailSpy.getLogEntry).toHaveBeenCalledWith('e2');
      expect(component.panelOpen).toBeTrue();
      expect(component.active?.delivery?.events?.length).toBe(1);
      expect(component.activeBody).toBeTruthy();
    });

    it('stores no body for a ticket email (details only)', () => {
      emailSpy.getLogEntry.and.returnValue(of(entry()));
      component.openEmail(component.items[0]);
      expect(component.activeBody).toBeNull();
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain("The full content isn't stored");
    });

    it('closes on Esc', () => {
      emailSpy.getLogEntry.and.returnValue(of(entry()));
      component.openEmail(component.items[0]);
      component.onEscape();
      expect(component.panelOpen).toBeFalse();
    });
  });

  describe('export', () => {
    it('builds one row per email with readable columns', () => {
      const rows = component.buildExportRows(component.items);
      expect(rows.length).toBe(3);
      expect(rows[1]).toEqual(jasmine.objectContaining({
        Type: 'Custom', 'Recipient email': 'asha@example.com', 'Order #': 70001, Event: 'BiG 7.0',
        'Send status': 'Sent', Delivery: 'Bounced', 'Sent by': 'Sam Admin', Error: 'mailbox does not exist'
      }));
      expect(rows[2].Delivery).toBe('');
    });

    it('exports with the current filters, up to 5000 rows', () => {
      component.deliveryFilter = 'bounced';
      component.exportReport();
      expect(lastQuery()).toEqual(jasmine.objectContaining({ delivery: 'bounced', page: 0, pageSize: 5000 }));
    });

    it('reports a failed export', () => {
      emailSpy.getLog.and.returnValue(throwError(() => new Error('x')));
      component.exportReport();
      expect(notifySpy.openErrorSnackBar).toHaveBeenCalledWith('Could not export the email report');
      expect(component.exporting).toBeFalse();
    });
  });
});
