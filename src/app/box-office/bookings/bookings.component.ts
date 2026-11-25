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
  festivalDetailsCount, festivalDetailsMissing, bedGroups, bedsMismatch, BedGroup, groupPassTypes,
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
import { MultiSelectOption } from '../../shared/multi-select/multi-select.component';
import { FESTIVAL, STAY, ADDON } from '../../core/pass-categories';
import { ViewModeService } from '../../core/view-mode.service';
import { AppliedChip, SortOption } from '../../shared/list-toolbar/list-toolbar.component';
import { CARD_STEP } from '../../shared/show-more/show-more.component';

/** B-083: pass type filter groups, in this order. */
const PASS_GROUPS: { category: string; label: string }[] = [
  { category: FESTIVAL, label: 'Festival Passes' },
  { category: STAY, label: 'Stay Passes' },
  { category: ADDON, label: 'Add-ons' }
];

type BookingSortKey = 'name' | 'email' | 'order' | 'ticket' | 'passes' | 'payment' | 'paidAt' | 'source' | 'emailStatus' | 'admitted' | 'details' | 'earlyCheckin' | 'beds';

type BookingsStatFilter = 'emailSent' | 'admitted' | 'spotRegistration' | 'detailsMissing' | 'bedsMismatch' | null;

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
  /** B-083: ticked pass type ids; [] = all. A booking shows when it or a linked booking holds any of them. */
  passTypeFilter: string[] = [];
  /** Every pass type of the event (GET /box-office/passTypes). */
  passTypes: { _id: string; name: string; category: string }[] = [];

  selectedIds = new Set<string>();
  /** "Selected only" chip (2026-11-24): show just the ticked rows. Off by itself once nothing is ticked. */
  selectedOnly = false;

  pageIndex = 0;
  pageSize = 20;
  readonly pageSizeOptions = [20, 50, 100];
  /** Phone cards: how many cards show (grows by "Show more"; back to one step on a new filter / sort). */
  cardLimit = CARD_STEP;
  readonly cardStep = CARD_STEP;

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
    private auth: AuthService,
    private viewMode: ViewModeService
  ) { }

  /** Phone cards: a phone with Bookings set to Cards (one view renders, never both). */
  get cardsView(): boolean {
    return this.viewMode.cards('bookings');
  }

  /** Phone (either view): the phone toolbar replaces the filter bar and the selection bar. */
  get isPhone(): boolean {
    return this.viewMode.isPhone;
  }

  /** Phone toolbar: applied filters + sort as removable chips (stored; rebuilt on every change). */
  appliedChips: AppliedChip[] = [];

  private static readonly STAT_LABELS: Record<Exclude<BookingsStatFilter, null>, string> = {
    emailSent: 'Ticket Emails Sent', admitted: 'Admitted', spotRegistration: 'Spot Registrations',
    detailsMissing: 'Details missing', bedsMismatch: "Beds don't match"
  };

  private rebuildChips() {
    const chips: AppliedChip[] = [];
    if (this.activeFilter) chips.push({ id: 'stat', label: BookingsComponent.STAT_LABELS[this.activeFilter] });
    if (this.emailStatusFilter) {
      const o = this.emailStatusOptions.find(x => x.value === this.emailStatusFilter);
      chips.push({ id: 'email', label: `Ticket email: ${o?.label ?? this.emailStatusFilter}` });
    }
    if (this.checkinStatusFilter) {
      const o = this.checkinStatusOptions.find(x => x.value === this.checkinStatusFilter);
      chips.push({ id: 'checkin', label: `Check-In: ${o?.label ?? this.checkinStatusFilter}` });
    }
    if (this.passTypeFilter.length) {
      const one = this.passTypeFilter.length === 1 ? this.passTypes.find(t => t._id === this.passTypeFilter[0]) : null;
      chips.push({ id: 'pass', label: one ? one.name : `${this.passTypeFilter.length} pass types` });
    }
    if (this.sort.key) {
      const o = this.sortOptions.find(x => x.key === this.sort.key);
      chips.push({ id: 'sort', label: `Sort: ${o?.label ?? this.sort.key}`, icon: this.sort.dir === 'asc' ? 'arrow_upward' : 'arrow_downward' });
    }
    this.appliedChips = chips;
  }

  /** Phone toolbar: × on a chip. */
  removeChip(id: string) {
    if (id === 'stat') this.activeFilter = null;
    else if (id === 'email') this.emailStatusFilter = '';
    else if (id === 'checkin') this.checkinStatusFilter = '';
    else if (id === 'pass') this.passTypeFilter = [];
    else if (id === 'sort') { this.sort.set(null, 'asc'); return; }
    this.firstPage();
  }

  /** Phone toolbar: Clear all (filters and sort; the search box stays). */
  clearChips() {
    this.activeFilter = null;
    this.emailStatusFilter = '';
    this.checkinStatusFilter = '';
    this.passTypeFilter = [];
    this.sort.set(null, 'asc');
  }

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
    // B-083: the event's pass types for the filter (a new event starts unfiltered).
    if (this.passTypesEvent !== activeEvent._id) {
      this.passTypesEvent = activeEvent._id;
      this.selectedOnly = false;
      this.passTypes = [];
      this.passTypeFilter = [];
      this.boxOfficeService.getPassTypes(activeEvent._id).subscribe({
        next: (types) => { this.passTypes = types; },
        error: () => { /* the filter just stays empty */ }
      });
    }
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

  trackBooking(_: number, b: Ticket): string | undefined {
    return b._id;
  }

  /** Phone cards: left-edge colour. Cancelled = bad; something to check = warn; someone admitted = ok. */
  cardTone(b: Ticket): 'bad' | 'warn' | 'ok' | 'none' {
    if (b.bookingStatus === 'cancelled') return 'bad';
    if (b.syncFlags?.length || this.bedsMismatch(b) || festivalDetailsMissing(b)) return 'warn';
    return this.admittedCountFor(b) > 0 ? 'ok' : 'none';
  }

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

  // ── Beds vs people (2026-11-24): a booking and its linked bookings together ──

  private groupsOf: Ticket[] | null = null;
  private groupsCache = new Map<string, BedGroup>();

  /** People + beds of the booking's group (it and every linked booking). Worked
   *  out once per loaded list: a new list (load, refresh) is a new array. */
  bedGroup(booking: Ticket): BedGroup | undefined {
    if (this.groupsOf !== this.bookings) {
      this.groupsCache = bedGroups(this.bookings);
      this.groupsOf = this.bookings;
    }
    return this.groupsCache.get(booking._id);
  }

  bedsMismatch(booking: Ticket): boolean {
    return bedsMismatch(this.bedGroup(booking));
  }

  /** "4 people · 3 beds", or "—" for a group with no pass at all. */
  bedsText(booking: Ticket): string {
    const g = this.bedGroup(booking);
    if (!g || (!g.people && !g.beds)) return '—';
    return `${g.people} ${g.people === 1 ? 'person' : 'people'} · ${g.beds} ${g.beds === 1 ? 'bed' : 'beds'}`;
  }

  /** Amber when they differ, green when they match. */
  bedsBadge(booking: Ticket): string {
    return this.bedsMismatch(booking) ? 'ba' : 'bg';
  }

  /** The group has more than this booking, or a link to a booking not in BiG yet. */
  bedsLinked(booking: Ticket): boolean {
    const g = this.bedGroup(booking);
    return !!g && (g.bookingIds.length > 1 || g.missingRefs.length > 0);
  }

  /** Hover / panel text: what the totals are made of. */
  bedsHint(booking: Ticket): string {
    const g = this.bedGroup(booking);
    if (!g) return '';
    const parts: string[] = [];
    const own = bookingIdOf(booking);
    const others = g.bookingIds.filter(id => id !== own);
    if (others.length) parts.push(`With linked ${others.length === 1 ? 'booking' : 'bookings'} ${others.join(', ')}`);
    if (g.missingRefs.length) parts.push(`Linked booking ${g.missingRefs.join(', ')} not in BiG yet`);
    if (g.people > g.beds) parts.push(`${g.people - g.beds} more ${g.people - g.beds === 1 ? 'person' : 'people'} than beds`);
    else if (g.beds > g.people) parts.push(`${g.beds - g.people} more ${g.beds - g.people === 1 ? 'bed' : 'beds'} than people`);
    return parts.join(' · ');
  }

  // ── B-083: pass type filter (with linked bookings) ──

  private passTypesEvent: string | null = null;
  private typesOf: Ticket[] | null = null;
  private typesCache = new Map<string, Set<string>>();
  private optionsKey: [Ticket[], unknown[]] | null = null;
  private optionsCache: MultiSelectOption[] = [];

  /** Pass type ids held by the booking and its linked bookings. */
  groupTypes(booking: Ticket): Set<string> {
    if (this.typesOf !== this.bookings) {
      this.typesCache = groupPassTypes(this.bookings);
      this.typesOf = this.bookings;
    }
    return this.typesCache.get(booking._id) || new Set();
  }

  matchesPassTypes(booking: Ticket): boolean {
    if (!this.passTypeFilter.length) return true;
    const held = this.groupTypes(booking);
    return this.passTypeFilter.some(id => held.has(id));
  }

  /** Dropdown rows: grouped by kind, with how many bookings each would show.
   *  The SAME array is returned until the bookings or pass types change
   *  (stable identities for the option list). */
  get passTypeOptions(): MultiSelectOption[] {
    if (this.optionsKey && this.optionsKey[0] === this.bookings && this.optionsKey[1] === this.passTypes) return this.optionsCache;
    const counts = new Map<string, number>();
    for (const b of this.bookings) this.groupTypes(b).forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
    const out: MultiSelectOption[] = [];
    for (const g of PASS_GROUPS) {
      this.passTypes.filter(t => t.category === g.category).sort((a, b) => a.name.localeCompare(b.name))
        .forEach(t => out.push({ value: t._id, label: t.name, group: g.label, count: counts.get(t._id) || 0 }));
    }
    this.optionsKey = [this.bookings, this.passTypes];
    this.optionsCache = out;
    return out;
  }

  /** Bookings whose group's people and beds differ. */
  get bedsMismatchCount(): number {
    return this.bookings.filter(b => this.bedsMismatch(b)).length;
  }

  /** B-003: column sort; a new sort starts again on the first page. */
  sort = new TableSort<BookingSortKey>(null, 'asc', () => this.firstPage());
  /** Phone cards sort bar: the table's columns, in the table's order (stored list). */
  readonly sortOptions: SortOption[] = [
    { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'order', label: 'Booking ID' },
    { key: 'ticket', label: 'Ticket ID' }, { key: 'passes', label: 'Passes' }, { key: 'payment', label: 'Payment method' },
    { key: 'paidAt', label: 'Paid at' }, { key: 'source', label: 'Source' }, { key: 'emailStatus', label: 'Ticket Email' },
    { key: 'admitted', label: 'Admitted' }, { key: 'details', label: 'Festival details' },
    { key: 'earlyCheckin', label: 'Early Check-In' }, { key: 'beds', label: 'Beds' }
  ];
  readonly sortGetters: Record<BookingSortKey, SortGetter<Ticket>> = {
    name: b => `${b.first_name || ''} ${b.last_name || ''}`.trim(),
    email: b => b.email,
    order: b => b.reference || b.order_id,
    ticket: b => b._id,
    passes: b => this.passSummary(b),
    payment: b => this.paymentMethod(b),
    paidAt: b => (b.paidAt ? new Date(b.paidAt).getTime() : null),
    source: b => this.source(b),
    emailStatus: b => this.emailStatusLabel(b),
    admitted: b => this.admittedCountFor(b),
    earlyCheckin: b => this.checkinStatusLabel(b),
    // People minus beds: beds short first (descending puts them on top), no passes = empty.
    beds: b => {
      const g = this.bedGroup(b);
      return g && (g.people || g.beds) ? g.people - g.beds : null;
    },
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
    } else if (this.activeFilter === 'bedsMismatch') {
      result = result.filter(b => this.bedsMismatch(b));
    }

    if (this.emailStatusFilter) {
      result = result.filter(b => ticketEmailStatus(b) === this.emailStatusFilter);
    }
    if (this.checkinStatusFilter) {
      result = result.filter(b => earlyCheckinStatus(b) === this.checkinStatusFilter);
    }
    if (this.passTypeFilter.length) {
      result = result.filter(b => this.matchesPassTypes(b));
    }
    if (this.selectedOnly && this.selectedIds.size) {
      result = result.filter(b => this.selectedIds.has(b._id!));
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
        (term.length >= 7 && 'details missing'.includes(term) && festivalDetailsMissing(b)) ||
        // "beds" (or "beds don't match") finds bookings whose people and beds differ
        (term.length >= 4 && "beds don't match".includes(term) && this.bedsMismatch(b))
      );
    }

    return result;
  }

  /** Table: the current page. Phone cards: the first `cardLimit` bookings. */
  get pagedBookings(): Ticket[] {
    if (this.cardsView) return this.filteredBookings.slice(0, this.cardLimit);
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
      this.selectionChanged();
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
    this.selectionChanged();
  }

  /** "Selected only" chip: on / off; starts again on the first page. */
  toggleSelectedOnly() {
    if (!this.selectedIds.size) { this.selectedOnly = false; return; }
    this.selectedOnly = !this.selectedOnly;
    this.firstPage();
  }

  /** The last tick went: show the whole list again. A page past the end goes back to the last one. */
  private selectionChanged() {
    if (!this.selectedIds.size) this.selectedOnly = false;
    const pages = Math.max(1, Math.ceil(this.filteredBookings.length / this.pageSize));
    if (this.pageIndex >= pages) this.pageIndex = pages - 1;
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
    this.firstPage();
  }

  onSearchChange() {
    this.firstPage();
  }

  /** A new filter / sort / search: back to page 1, and to the first cards. */
  private firstPage() {
    this.pageIndex = 0;
    this.cardLimit = CARD_STEP;
    this.rebuildChips();
  }

  /** Phone cards: "Show more". */
  showMoreCards() {
    this.cardLimit += CARD_STEP;
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
