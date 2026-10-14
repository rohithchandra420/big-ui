import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { PageEvent } from '@angular/material/paginator';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { EmailService } from '../../core/email.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EmailBatchTrackerService } from '../../core/email-batch-tracker.service';
import {
  EmailDeliveryFilter, EmailLogEntry, EmailLogPage, EmailLogQuery, EmailLogStatus, EmailType
} from '../../models/email.model';
import { EventItem } from '../../models/event.model';
import { deliveryBadge, deliveryLabel, deliveryProblem, deliveryStatus } from '../../box-office/email/email-delivery.utils';

type ReportCard = 'sent' | 'delivered' | 'bounced' | 'failed' | 'opened';

const TYPE_LABELS: Record<EmailType, string> = { ticket: 'Ticket', custom: 'Custom', test: 'Test' };
const STATUS_LABELS: Record<EmailLogStatus, string> = {
  queued: 'Queued', sending: 'Sending…', sent: 'Sent', failed: 'Failed', skipped: 'Skipped'
};
const STATUS_BADGES: Record<EmailLogStatus, string> = {
  queued: 'bx', sending: 'bb', sent: 'bg', failed: 'br', skipped: 'ba'
};

// Fixed option lists — constants, never rebuilt in a getter (see the
// *ngFor / <app-option> identity rule in CLAUDE.md).
const TYPE_OPTIONS = (['ticket', 'custom', 'test'] as EmailType[]).map(value => ({ value, label: TYPE_LABELS[value] }));
const STATUS_OPTIONS = (['queued', 'sending', 'sent', 'failed', 'skipped'] as EmailLogStatus[])
  .map(value => ({ value, label: STATUS_LABELS[value] }));
const DELIVERY_OPTIONS: { value: EmailDeliveryFilter; label: string }[] = [
  { value: 'delivered', label: 'Delivered' },
  { value: 'bounced', label: 'Bounced / blocked' },
  { value: 'deferred', label: 'Delayed' },
  { value: 'spam', label: 'Marked spam' },
  { value: 'error', label: 'Delivery error' },
  { value: 'opened', label: 'Opened (approx.)' },
  { value: 'none', label: 'Sent, no report yet' }
];

const EXPORT_LIMIT = 5000;

/**
 * Admin > Email Report (Email epic, see EMAIL_CONTEXT.md). Every email the
 * platform sent, Bookings-style: summary cards, filters, a server-paged table
 * and a side panel. Access: same rule as sending (EmailAccessGuard + backend).
 * Filtering and paging happen on the server — the log can grow large.
 */
@Component({
  selector: 'app-email-report',
  templateUrl: './email-report.component.html',
  styleUrls: ['./email-report.component.css']
})
export class EmailReportComponent implements OnInit, OnDestroy {

  // Filters
  searchTerm = '';
  typeFilter: EmailType | '' = '';
  statusFilter: EmailLogStatus | '' = '';
  deliveryFilter: EmailDeliveryFilter | '' = '';
  eventFilter = '';
  senderFilter = '';
  fromDate = '';
  toDate = '';

  readonly typeOptions = TYPE_OPTIONS;
  readonly statusOptions = STATUS_OPTIONS;
  readonly deliveryOptions = DELIVERY_OPTIONS;
  events: EventItem[] = [];
  /** Stored list (rebuilt only when a response arrives), not a getter. */
  senders: { _id: string; name: string }[] = [];

  // Data
  items: EmailLogEntry[] = [];
  total = 0;
  summary: EmailLogPage['summary'] = { byStatus: {}, byType: {}, byDelivery: {}, opened: 0 };
  loading = false;
  exporting = false;

  pageIndex = 0;
  pageSize = 20;
  readonly pageSizeOptions = [20, 50, 100];

  // Panel
  panelOpen = false;
  active: EmailLogEntry | null = null;
  activeLoading = false;
  activeBody: SafeHtml | null = null;

  private searchChanged = new Subject<void>();
  private requestNo = 0;
  private subs: Subscription[] = [];

  constructor(
    private emailService: EmailService,
    private eventService: EventService,
    private notificationService: NotificationService,
    private tracker: EmailBatchTrackerService,
    private sanitizer: DomSanitizer,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.subs.push(this.eventService.events.subscribe(events => this.events = events || []));
    // Search hits the server — wait for typing to pause.
    this.subs.push(this.searchChanged.pipe(debounceTime(300)).subscribe(() => this.load()));
    // A batch finishing elsewhere (e.g. Bookings in another tab of the app) changes the log.
    this.subs.push(this.tracker.finished$.subscribe(() => this.load()));
    this.load();
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ── Loading ──────────────────────────────────────────────

  buildQuery(): EmailLogQuery {
    return {
      q: this.searchTerm.trim(),
      type: this.typeFilter,
      status: this.statusFilter,
      delivery: this.deliveryFilter,
      event: this.eventFilter,
      sentBy: this.senderFilter,
      // Date inputs are local calendar days; "to" covers the whole day.
      from: this.fromDate ? new Date(`${this.fromDate}T00:00:00`).toISOString() : '',
      to: this.toDate ? new Date(`${this.toDate}T23:59:59.999`).toISOString() : ''
    };
  }

  load() {
    const requestNo = ++this.requestNo;
    this.loading = true;
    this.emailService.getLog({ ...this.buildQuery(), page: this.pageIndex, pageSize: this.pageSize }).subscribe({
      next: res => {
        // Ignore a slow, older response arriving after a newer one
        if (requestNo !== this.requestNo) return;
        this.items = res.items || [];
        this.total = res.total || 0;
        this.summary = res.summary || this.summary;
        if (res.senders) this.senders = res.senders;
        this.loading = false;
      },
      error: () => {
        if (requestNo !== this.requestNo) return;
        this.loading = false;
        this.notificationService.openErrorSnackBar('Could not load the email report');
      }
    });
  }

  // ── Filters ──────────────────────────────────────────────

  onSearchChange() {
    this.pageIndex = 0;
    this.searchChanged.next();
  }

  onFilterChange() {
    this.pageIndex = 0;
    this.load();
  }

  get hasFilters(): boolean {
    return !!(this.searchTerm.trim() || this.typeFilter || this.statusFilter || this.deliveryFilter
      || this.eventFilter || this.senderFilter || this.fromDate || this.toDate);
  }

  clearFilters() {
    this.searchTerm = '';
    this.typeFilter = '';
    this.statusFilter = '';
    this.deliveryFilter = '';
    this.eventFilter = '';
    this.senderFilter = '';
    this.fromDate = '';
    this.toDate = '';
    this.onFilterChange();
  }

  // Cards are shortcuts for the Status / Delivery dropdowns, so the two always agree.
  isCardActive(card: ReportCard): boolean {
    switch (card) {
      case 'sent': return this.statusFilter === 'sent' && !this.deliveryFilter;
      case 'failed': return this.statusFilter === 'failed' && !this.deliveryFilter;
      case 'delivered': return this.deliveryFilter === 'delivered';
      case 'bounced': return this.deliveryFilter === 'bounced';
      case 'opened': return this.deliveryFilter === 'opened';
    }
  }

  toggleCard(card: ReportCard) {
    const wasActive = this.isCardActive(card);
    this.statusFilter = '';
    this.deliveryFilter = '';
    if (!wasActive) {
      if (card === 'sent' || card === 'failed') this.statusFilter = card;
      else this.deliveryFilter = card;
    }
    this.onFilterChange();
  }

  cardCount(card: ReportCard): number {
    const s = this.summary;
    switch (card) {
      case 'sent': return s.byStatus?.sent || 0;
      case 'failed': return s.byStatus?.failed || 0;
      case 'delivered': return s.byDelivery?.delivered || 0;
      // The backend's 'bounced' here already includes blocked + invalid
      case 'bounced': return s.byDelivery?.bounced || 0;
      case 'opened': return s.opened || 0;
    }
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.load();
  }

  trackOption(_: number, o: { value: string }): string {
    return o.value;
  }

  trackById(_: number, x: { _id: string }): string {
    return x._id;
  }

  // ── Row display ──────────────────────────────────────────

  typeLabel(e: EmailLogEntry): string {
    return TYPE_LABELS[e.type] || e.type;
  }

  /** Delivery outcome once Brevo has reported back, otherwise the send status. */
  statusLabel(e: EmailLogEntry): string {
    const d = deliveryStatus(e);
    return d ? deliveryLabel(d) : (STATUS_LABELS[e.status] || e.status);
  }

  statusBadge(e: EmailLogEntry): string {
    const d = deliveryStatus(e);
    return d ? deliveryBadge(d) : (STATUS_BADGES[e.status] || 'bx');
  }

  sendStatusLabel(e: EmailLogEntry): string {
    return STATUS_LABELS[e.status] || e.status;
  }

  problem(e: EmailLogEntry): string {
    if (e.error && e.status !== 'sent') return e.error;
    return deliveryProblem(e);
  }

  senderName(e: EmailLogEntry): string {
    return typeof e.sentBy === 'object' && e.sentBy ? e.sentBy.name : '';
  }

  eventName(e: EmailLogEntry): string {
    return typeof e.event === 'object' && e.event ? e.event.name : '';
  }

  // ── Panel ────────────────────────────────────────────────

  openEmail(e: EmailLogEntry) {
    this.active = e;
    this.activeBody = null;
    this.panelOpen = true;
    // The list leaves out the custom body and the delivery timeline — fetch the full record.
    this.activeLoading = true;
    this.emailService.getLogEntry(e._id).subscribe({
      next: full => {
        if (this.active?._id !== e._id) return;
        this.active = full;
        // Server-sanitized when sent; shown in a sandboxed iframe (no scripts).
        this.activeBody = full.body ? this.sanitizer.bypassSecurityTrustHtml(this.wrapBody(full.body)) : null;
        this.activeLoading = false;
      },
      error: () => {
        if (this.active?._id !== e._id) return;
        this.activeLoading = false;
      }
    });
  }

  private wrapBody(body: string): string {
    return `<!doctype html><html><body style="font-family: Arial, sans-serif; font-size: 14px; color: #222; margin: 12px;">${body}</body></html>`;
  }

  closePanel() {
    this.panelOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.panelOpen && this.dialog.openDialogs.length === 0) this.closePanel();
  }

  // ── Export ───────────────────────────────────────────────

  buildExportRows(items: EmailLogEntry[]): any[] {
    return items.map(e => ({
      Date: e.sentAt || e.createdAt,
      Type: this.typeLabel(e),
      'Recipient name': e.recipientName || '',
      'Recipient email': e.to,
      'Sent to (test)': e.redirectedTo || '',
      'Order #': e.orderId ?? '',
      Event: this.eventName(e),
      Subject: e.subject,
      'Send status': this.sendStatusLabel(e),
      Delivery: deliveryStatus(e) ? deliveryLabel(deliveryStatus(e)!) : '',
      'First opened (approx.)': e.delivery?.firstOpenedAt || '',
      'Sent by': this.senderName(e),
      Error: this.problem(e)
    }));
  }

  exportReport() {
    if (this.exporting) return;
    this.exporting = true;
    this.emailService.getLog({ ...this.buildQuery(), page: 0, pageSize: EXPORT_LIMIT }).subscribe({
      next: res => {
        const rows = this.buildExportRows(res.items || []);
        import('xlsx').then(XLSX => {
          const sheet = XLSX.utils.json_to_sheet(rows);
          const book = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(book, sheet, 'Emails');
          XLSX.writeFile(book, `email-report-${new Date().toISOString().substring(0, 10)}.xlsx`);
          this.exporting = false;
          if ((res.total || 0) > EXPORT_LIMIT) {
            this.notificationService.openErrorSnackBar(
              `Exported the newest ${EXPORT_LIMIT} of ${res.total} emails — narrow the filters to export the rest`);
          }
        }).catch(() => {
          this.exporting = false;
          this.notificationService.openErrorSnackBar('Could not create the Excel file');
        });
      },
      error: () => {
        this.exporting = false;
        this.notificationService.openErrorSnackBar('Could not export the email report');
      }
    });
  }
}
