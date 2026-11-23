import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { formatDate } from '@angular/common';
import { PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Observable, Subscription } from 'rxjs';

import { Ticket, TicketEmailStatus } from '../../models/ticket.model';
import { BoxOfficeService } from '../box-office.service';
import {
  isFestivalPass, isSpotRegistration, passSummary as buildPassSummary, bookingIdOf, paymentMethodLabel, bookingSourceLabel,
  ticketEmailStatus, ticketEmailLabel, ticketEmailBadge, TICKET_EMAIL_FILTER_OPTIONS,
  festivalDetailsCount, festivalDetailsMissing,
  earlyCheckinStatus, earlyCheckinLabel, earlyCheckinBadge, EARLY_CHECKIN_FILTER_OPTIONS, EarlyCheckinView
} from '../box-office.utils';
import { Shopcart } from '../../models/ticket.model';
import { BulkUploadComponent } from './bulk-upload/bulk-upload.component';
import { EventService } from '../../core/event.service';
import { AuthService } from '../../core/auth.service';
import { EmailService } from '../../core/email.service';
import { EmailBatchTrackerService } from '../../core/email-batch-tracker.service';
import { EmailDialogsService } from '../email/email-dialogs.service';
import { AttendeeListComponent } from '../attendee-list/attendee-list.component';
import { SortGetter, TableSort } from '../../shared/table-sort/table-sort';

type BookingSortKey = 'name' | 'email' | 'order' | 'ticket' | 'passes' | 'amount' | 'payment' | 'paidAt' | 'source' | 'emailStatus' | 'admitted' | 'details' | 'earlyCheckin';

type BookingsStatFilter = 'emailSent' | 'admitted' | 'spotRegistration' | 'detailsMissing' | null;

@Component({
  selector: 'app-bookings',
  templateUrl: './bookings.component.html',
  styleUrls: ['./bookings.component.css']
})
export class BookingsComponent implements OnInit, OnDestroy {

  bookings: Ticket[] = [];
  loading = false;

  activeFilter: BookingsStatFilter = null;
  searchTerm = '';
  /** Ticket Email status dropdown; '' = all. Combines with the stat cards and search. */
  emailStatusFilter: TicketEmailStatus | '' = '';
  readonly emailStatusOptions = TICKET_EMAIL_FILTER_OPTIONS;
  /** Early Check-In status dropdown (EC2); '' = all. */
  checkinStatusFilter: EarlyCheckinView | '' = '';
  readonly checkinStatusOptions = EARLY_CHECKIN_FILTER_OPTIONS;

  selectedIds = new Set<string>();

  pageIndex = 0;
  pageSize = 20;
  readonly pageSizeOptions = [20, 50, 100];

  activeBooking: Ticket | null = null;
  panelOpen = false;
  refreshing = false;

  /** Closing the panel only hides it, so the attendee list (and any open Allocate Tent / Counter Form) survives — reset it on every open. */
  @ViewChild(AttendeeListComponent) attendeeList?: AttendeeListComponent;
  editingTicket = false;
  /** External Booking Import panel (I2). */
  importOpen = false;
  /** Sales system panel: status + Pull now (I4). */
  syncOpen = false;

  /** Email epic — DEV/DIR/ADMIN or a Box Office TL (decided server-side). */
  canSendEmail$!: Observable<boolean>;
  canSendTicket$!: Observable<boolean>;
  canSendCustom$!: Observable<boolean>;
  /** Early Check-In (EC2): DEV/DIR/ADMIN or a Box Office TL. */
  canSendCheckin$!: Observable<boolean>;
  private subs: Subscription[] = [];

  constructor(
    private boxOfficeService: BoxOfficeService,
    private router: Router,
    private dialog: MatDialog,
    private eventService: EventService,
    private emailService: EmailService,
    private emailDialogs: EmailDialogsService,
    private emailTracker: EmailBatchTrackerService,
    private auth: AuthService
  ) { }

  /** View-only people (Helpdesk, a "box-office:read" grant alone): no Export, Bulk Upload or Edit. */
  get readOnly(): boolean {
    return !!this.auth.boxOfficeReadOnly?.(this.auth.currentUser);
  }

  /** Bulk Upload: top roles, the Box Office Team Lead, "box-office:manage" (the server checks again). */
  get canBulkUpload(): boolean {
    return !this.readOnly && (this.auth.canManageBoxOffice?.(this.auth.currentUser) ?? true);
  }

  ngOnInit() {
    // Reload whenever the active event changes, not just on page load —
    // Bookings is scoped to whichever event the sidebar selector currently
    // points at.
    this.subs.push(this.eventService.activeEvent.subscribe(() => this.loadBookings()));
    this.canSendEmail$ = this.emailService.canSend();
    this.canSendTicket$ = this.emailService.canSendTicket();
    this.canSendCustom$ = this.emailService.canSendCustom();
    this.canSendCheckin$ = this.emailService.canSendCheckin();
    // A background email send finished — pick up the new Ticket Email statuses.
    this.subs.push(this.emailTracker.finished$.subscribe(() => this.loadBookings()));
  }

  ngOnDestroy() {
    this.subs.forEach(s => s.unsubscribe());
  }

  loadBookings() {
    const activeEvent = this.eventService.currentActiveEvent;
    if (!activeEvent) {
      this.bookings = [];
      return;
    }
    this.loading = true;
    this.boxOfficeService.getAllTickets(activeEvent._id).subscribe({
      next: (res) => {
        this.bookings = res;
        this.loading = false;
        // Keep the open panel on the fresh copy of the same booking.
        if (this.activeBooking?._id) {
          this.activeBooking = this.bookings.find(b => b._id === this.activeBooking!._id) || this.activeBooking;
        }
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  get totalBookings(): number {
    return this.bookings.length;
  }

  get emailsSentCount(): number {
    return this.bookings.filter(b => ticketEmailStatus(b) === 'sent').length;
  }

  get admittedCount(): number {
    return this.bookings.reduce((sum, b) => sum + this.admittedCountFor(b), 0);
  }

  admittedCountFor(booking: Ticket): number {
    return booking.shopcart?.filter(item => item.isAdmitted).length ?? 0;
  }

  passSummary(booking: Ticket): string {
    return buildPassSummary(booking.shopcart);
  }

  /** Booking ID: the sales system's reference, else the order number. */
  bookingId(booking: Ticket): string {
    return bookingIdOf(booking);
  }

  /** Online / Offline / Guest list (imported bookings); '' otherwise. */
  paymentMethod(booking: Ticket): string {
    return paymentMethodLabel(booking);
  }

  /** Sales system / Spot registration / Bulk Upload (I6). */
  source(booking: Ticket): string {
    return bookingSourceLabel(booking);
  }

  /** Paid at as searched from the search bar ("10 nov 2026"); '' when not paid / not imported. */
  private paidAtText(booking: Ticket): string {
    if (!booking.paidAt) return '';
    try {
      return formatDate(booking.paidAt, 'd MMM y', 'en-US').toLowerCase();
    } catch {
      return '';
    }
  }

  /** The loaded booking with this reference; null when it is not in BiG yet. */
  bookingByRef(ref: string): Ticket | null {
    return this.bookings.find(x => x.reference === ref) || null;
  }

  /** Linked bookings (I5): the buyer's name of the booking with this reference,
   *  when it is loaded on this page; '' otherwise (target not in BiG yet). */
  linkedName(ref: string): string {
    const b = this.bookingByRef(ref);
    return b ? `${b.first_name || ''} ${b.last_name || ''}`.trim() : '';
  }

  /** Allocate Tent: a linked pass's Booking ID was tapped — show that booking in this panel. */
  openByBookingId(id: string) {
    const target = this.bookings.find(b => bookingIdOf(b) === id);
    if (target) this.jumpTo(target);
  }

  /** Move the open panel to another booking (linked chips, Allocate Tent).
   *  The list copy may be old (a bed was allocated / vacated in the panel
   *  since the page loaded), so it is fetched fresh and swapped in. */
  jumpTo(target: Ticket) {
    this.openPanel(target);
    if (!target._id) return;
    this.boxOfficeService.getTicketById(target._id).subscribe({
      next: (fresh) => {
        if (!fresh?._id) return;
        this.bookings = this.bookings.map(b => (b._id === fresh._id ? fresh : b));
        if (this.activeBooking?._id === fresh._id) this.activeBooking = fresh;
      },
      error: () => { /* keep the list copy */ }
    });
  }

  /** Linked bookings (I5): references of the bookings that link to this one. */
  linkedFrom(booking: Ticket): string[] {
    const ref = booking.reference;
    if (!ref) return [];
    return this.bookings
      .filter(b => b._id !== booking._id && b.reference && b.linkedReferences?.includes(ref))
      .map(b => b.reference as string);
  }

  /** Bug fix (2026-08-20) — the detail panel's "Attendees" count was just the
   *  raw shopcart length, which double-counts Tent Pass items alongside the
   *  Festival Pass each is paired with. Split into the actual attendee count
   *  (Festival Passes — one per person) and the total pass/item count. */
  festivalPassCount(shopcart: Shopcart[] | undefined): number {
    return (shopcart || []).filter(item => isFestivalPass(item)).length;
  }

  // ── Ticket Email status (Email epic) ──────────────────

  trackOption(_: number, o: { value: string }): string {
    return o.value;
  }

  emailStatusLabel(booking: Ticket): string {
    return ticketEmailLabel(ticketEmailStatus(booking));
  }

  emailStatusBadge(booking: Ticket): string {
    return ticketEmailBadge(ticketEmailStatus(booking));
  }

  emailStatusError(booking: Ticket): string {
    const status = ticketEmailStatus(booking);
    return status === 'failed' || status === 'no_email' || status === 'bounced' ? (booking.ticketEmail?.error || '') : '';
  }

  /** Selected bookings, in table order — read on click, never from the template. */
  private selectedBookings(): Ticket[] {
    return this.bookings.filter(b => b._id && this.selectedIds.has(b._id));
  }

  sendTicketEmails() {
    const tickets = this.selectedBookings();
    if (!tickets.length) return;
    this.emailDialogs.openTicketEmail(tickets).subscribe(batch => {
      if (batch) this.loadBookings();
    });
  }

  sendCustomEmails() {
    const tickets = this.selectedBookings();
    if (!tickets.length) return;
    this.emailDialogs.openCustomEmail(tickets).subscribe();
  }

  sendCheckinEmails() {
    const tickets = this.selectedBookings();
    if (!tickets.length) return;
    this.emailDialogs.openCheckinEmail(tickets).subscribe(batch => {
      if (batch) this.loadBookings();
    });
  }

  // ── Early Check-In EC2: email status ──

  checkinStatusLabel(booking: Ticket): string {
    return earlyCheckinLabel(earlyCheckinStatus(booking));
  }

  checkinStatusBadge(booking: Ticket): string {
    return earlyCheckinBadge(earlyCheckinStatus(booking));
  }

  /** Why the last send failed or was skipped (hover + panel). */
  checkinStatusHint(booking: Ticket): string {
    const status = earlyCheckinStatus(booking);
    if (status === 'failed' || status === 'no_email') return booking.earlyCheckin?.error || '';
    return '';
  }

  /** A single-booking send started from the detail panel. */
  onPanelEmailStarted() {
    this.loadBookings();
  }

  get spotRegistrationCount(): number {
    return this.bookings.filter(b => isSpotRegistration(b)).length;
  }

  // ── Early Check-In EC1: Festival Pass details ──

  /** "2 / 4", or "—" when the booking has no Festival Pass. */
  festivalDetailsText(booking: Ticket): string {
    const c = festivalDetailsCount(booking);
    return c.total ? `${c.filled} / ${c.total}` : '—';
  }

  /** Green when every Festival Pass is filled, amber when not. */
  festivalDetailsBadge(booking: Ticket): string {
    return festivalDetailsMissing(booking) ? 'ba' : 'bg';
  }

  /** Bookings with at least one Festival Pass missing a detail. */
  get detailsMissingCount(): number {
    return this.bookings.filter(b => festivalDetailsMissing(b)).length;
  }

  /** B-003: column sort; a new sort starts again on the first page. */
  sort = new TableSort<BookingSortKey>(null, 'asc', () => { this.pageIndex = 0; });
  readonly sortGetters: Record<BookingSortKey, SortGetter<Ticket>> = {
    name: b => `${b.first_name || ''} ${b.last_name || ''}`.trim(),
    email: b => b.email,
    order: b => b.reference || b.order_id,
    ticket: b => b._id,
    passes: b => this.passSummary(b),
    amount: b => Number(b.totalPrice),
    payment: b => this.paymentMethod(b),
    paidAt: b => (b.paidAt ? new Date(b.paidAt).getTime() : null),
    source: b => this.source(b),
    emailStatus: b => this.emailStatusLabel(b),
    admitted: b => this.admittedCountFor(b),
    earlyCheckin: b => this.checkinStatusLabel(b),
    // Share filled (0 = nothing filled, 1 = all); no Festival Pass sorts as empty.
    details: b => {
      const c = festivalDetailsCount(b);
      return c.total ? c.filled / c.total : null;
    }
  };

  get filteredBookings(): Ticket[] {
    let result = this.sort.sorted(this.bookings, this.sortGetters);

    if (this.activeFilter === 'emailSent') {
      result = result.filter(b => ticketEmailStatus(b) === 'sent');
    } else if (this.activeFilter === 'admitted') {
      result = result.filter(b => b.shopcart?.some(item => item.isAdmitted));
    } else if (this.activeFilter === 'spotRegistration') {
      result = result.filter(b => isSpotRegistration(b));
    } else if (this.activeFilter === 'detailsMissing') {
      result = result.filter(b => festivalDetailsMissing(b));
    }

    if (this.emailStatusFilter) {
      result = result.filter(b => ticketEmailStatus(b) === this.emailStatusFilter);
    }
    if (this.checkinStatusFilter) {
      result = result.filter(b => earlyCheckinStatus(b) === this.checkinStatusFilter);
    }

    const term = this.searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter(b =>
        `${b.first_name} ${b.last_name}`.toLowerCase().includes(term) ||
        b.email?.toLowerCase().includes(term) ||
        String(b.order_id ?? '').includes(term) ||
        b.reference?.toLowerCase().includes(term) ||
        b.paymentOrderId?.toLowerCase().includes(term) ||
        b.paymentId?.toLowerCase().includes(term) ||
        b._id?.toLowerCase().includes(term) ||
        // I6: payment method, source and the Paid at date ("10 nov")
        this.paymentMethod(b).toLowerCase().includes(term) ||
        this.source(b).toLowerCase().includes(term) ||
        this.paidAtText(b).includes(term) ||
        // EC1: "details missing" (or "details") finds bookings with a Festival Pass to fill
        (term.length >= 7 && 'details missing'.includes(term) && festivalDetailsMissing(b))
      );
    }

    return result;
  }

  get pagedBookings(): Ticket[] {
    const start = this.pageIndex * this.pageSize;
    return this.filteredBookings.slice(start, start + this.pageSize);
  }

  get allPagedSelected(): boolean {
    return this.pagedBookings.length > 0 && this.pagedBookings.every(b => this.selectedIds.has(b._id!));
  }

  get somePagedSelected(): boolean {
    return this.pagedBookings.some(b => this.selectedIds.has(b._id!)) && !this.allPagedSelected;
  }

  toggleSelectAllPaged() {
    if (this.allPagedSelected) {
      this.pagedBookings.forEach(b => this.selectedIds.delete(b._id!));
    } else {
      this.pagedBookings.forEach(b => this.selectedIds.add(b._id!));
    }
  }

  toggleRow(id: string) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  get segText(): string {
    const count = this.selectedIds.size;
    if (count === 0) {
      return 'No bookings selected';
    }
    return `${count} booking${count === 1 ? '' : 's'} selected`;
  }

  toggleFilter(filter: BookingsStatFilter) {
    this.activeFilter = this.activeFilter === filter ? null : filter;
    this.pageIndex = 0;
  }

  onSearchChange() {
    this.pageIndex = 0;
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  openPanel(booking: Ticket) {
    this.activeBooking = booking;
    this.panelOpen = true;
    this.editingTicket = false;
    this.attendeeList?.resetView();
  }

  onTicketSaved(updated: Ticket) {
    if (this.activeBooking) {
      this.activeBooking.first_name = updated.first_name;
      this.activeBooking.last_name = updated.last_name;
      this.activeBooking.email = updated.email;
      this.activeBooking.phone_no = updated.phone_no;
    }
    this.editingTicket = false;
  }

  goToRegistration() {
    if (this.activeBooking?._id) {
      this.router.navigate(['/box-office/registration', this.activeBooking._id]);
    }
  }

  openBulkUpload() {
    const ref = this.dialog.open(BulkUploadComponent, { width: '90%', maxWidth: '560px', disableClose: true });
    ref.afterClosed().subscribe((ticketCount: number | null) => {
      if (ticketCount !== null && ticketCount !== undefined) {
        this.loadBookings();
      }
    });
  }

  // Quick v1 backup/export — one row per pass, same column shape Bulk
  // Upload imports (order_id/item_name/item_quantity/billing_first_name/
  // billing_last_name/phone_no/billing_email/transaction_id/order_total),
  // so an exported file can be re-uploaded as-is later. Exports every
  // currently-loaded booking, not just the filtered/paged view — this is
  // meant as a full backup, not a report. Originally built on develop
  // (pre-Introducing-Events) as a safety net to pull existing UAT data out
  // before that epic's data model changed; now that both are merged here
  // together, Bookings is event-scoped, so item_name falls back to
  // passTypeName for passes created via the current Box Office flow (same
  // fallback pattern as box-office.utils.ts's isFestivalPass) — otherwise
  // every export row going forward would have an empty pass name.
  // Intentionally minimal — user has said this will be extended/reworked
  // later.
  buildExportRows(bookings: Ticket[]): any[] {
    const rows: any[] = [];
    bookings.forEach(ticket => {
      (ticket.shopcart || []).forEach(item => {
        rows.push({
          order_id: ticket.order_id,
          item_name: item.passTypeName || item.item_name,
          item_quantity: item.item_quantity,
          billing_first_name: ticket.first_name,
          billing_last_name: ticket.last_name,
          phone_no: ticket.phone_no,
          billing_email: ticket.email,
          transaction_id: ticket.transaction_id,
          order_total: ticket.totalPrice,
        });
      });
    });
    return rows;
  }

  exportBookings() {
    if (!this.bookings.length) return;
    const rows = this.buildExportRows(this.bookings);

    import('xlsx').then(XLSX => {
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Bookings');
      const dateStamp = new Date().toISOString().substring(0, 10);
      XLSX.writeFile(workbook, `bookings-export-${dateStamp}.xlsx`);
    });
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.panelOpen) {
      this.closePanel();
    }
  }

  closePanel() {
    let settled = false;
    const fallback = setTimeout(() => {
      if (!settled) {
        this.panelOpen = false;
        this.refreshing = true;
      }
    }, 300);

    const activeEvent = this.eventService.currentActiveEvent;
    if (!activeEvent) {
      this.panelOpen = false;
      return;
    }
    this.boxOfficeService.getAllTickets(activeEvent._id).subscribe({
      next: (res) => {
        settled = true;
        clearTimeout(fallback);
        this.bookings = res;
        this.panelOpen = false;
        this.refreshing = false;
      },
      error: () => {
        settled = true;
        clearTimeout(fallback);
        this.panelOpen = false;
        this.refreshing = false;
      }
    });
  }
}
