import { Component, HostListener, OnInit } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { Ticket } from '../../models/ticket.model';
import { BoxOfficeService } from '../box-office.service';
import { isSpotRegistration, passSummary as buildPassSummary } from '../box-office.utils';
import { BulkUploadComponent } from './bulk-upload/bulk-upload.component';
import { EventService } from '../../core/event.service';

type BookingsStatFilter = 'emailSent' | 'admitted' | 'spotRegistration' | null;

@Component({
  selector: 'app-bookings',
  templateUrl: './bookings.component.html',
  styleUrls: ['./bookings.component.css']
})
export class BookingsComponent implements OnInit {

  bookings: Ticket[] = [];
  loading = false;

  activeFilter: BookingsStatFilter = null;
  searchTerm = '';

  selectedIds = new Set<string>();

  pageIndex = 0;
  pageSize = 20;
  readonly pageSizeOptions = [20, 50, 100];

  activeBooking: Ticket | null = null;
  panelOpen = false;
  refreshing = false;
  editingTicket = false;

  constructor(
    private boxOfficeService: BoxOfficeService,
    private router: Router,
    private dialog: MatDialog,
    private eventService: EventService
  ) { }

  ngOnInit() {
    // Reload whenever the active event changes, not just on page load —
    // Bookings is scoped to whichever event the sidebar selector currently
    // points at.
    this.eventService.activeEvent.subscribe(() => this.loadBookings());
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
    return this.bookings.filter(b => b.hasEmailSent === 'Yes').length;
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

  get spotRegistrationCount(): number {
    return this.bookings.filter(b => isSpotRegistration(b)).length;
  }

  get filteredBookings(): Ticket[] {
    let result = this.bookings;

    if (this.activeFilter === 'emailSent') {
      result = result.filter(b => b.hasEmailSent === 'Yes');
    } else if (this.activeFilter === 'admitted') {
      result = result.filter(b => b.shopcart?.some(item => item.isAdmitted));
    } else if (this.activeFilter === 'spotRegistration') {
      result = result.filter(b => isSpotRegistration(b));
    }

    const term = this.searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter(b =>
        `${b.first_name} ${b.last_name}`.toLowerCase().includes(term) ||
        b.email?.toLowerCase().includes(term) ||
        String(b.order_id).includes(term) ||
        b._id?.toLowerCase().includes(term)
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
