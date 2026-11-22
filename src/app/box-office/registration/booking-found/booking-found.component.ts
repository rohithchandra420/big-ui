import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { Ticket } from '../../../models/ticket.model';
import { BoxOfficeService } from '../../box-office.service';
import { bookingIdOf, passSummary as buildPassSummary } from '../../box-office.utils';
import { NotificationService } from '../../../core/notification.service';

@Component({
  selector: 'app-booking-found',
  templateUrl: './booking-found.component.html',
  styleUrls: ['./booking-found.component.css']
})
export class BookingFoundComponent implements OnInit, OnDestroy {

  ticket: Ticket | null = null;
  loading = false;
  notFound = false;
  private sub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private boxOfficeService: BoxOfficeService,
    private notify: NotificationService
  ) { }

  ngOnInit() {
    // Follows the address, not just the first one: a linked booking opened
    // from Allocate Tent reuses this page with another id.
    this.sub = this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.loadTicket(id);
      }
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  /** Allocate Tent: a linked pass's Booking ID was tapped — open that booking on this page. */
  openBooking(bookingId: string) {
    const eventId = this.ticket?.event;
    if (!bookingId || !eventId) return;
    this.boxOfficeService.searchTickets(bookingId, eventId).subscribe({
      next: (found) => {
        const target = (found || []).find(t => bookingIdOf(t) === bookingId);
        if (target?._id) {
          this.router.navigate(['/box-office/registration', target._id]);
        } else {
          this.notify.openErrorSnackBar(`Booking ${bookingId} is not in BiG yet.`);
        }
      },
      error: () => this.notify.openErrorSnackBar('Could not open that booking. Try again.')
    });
  }

  loadTicket(id: string) {
    this.loading = true;
    this.notFound = false;
    this.boxOfficeService.getTicketById(id).subscribe({
      next: (res) => {
        this.ticket = res;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.notFound = true;
      }
    });
  }

  get passSummary(): string {
    return buildPassSummary(this.ticket?.shopcart);
  }

  get admittedCount(): number {
    return this.ticket?.shopcart?.filter(item => item.isAdmitted).length ?? 0;
  }

  get totalCount(): number {
    return this.ticket?.shopcart?.length ?? 0;
  }

  goBack() {
    this.router.navigate(['/box-office/registration']);
  }
}
