import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { Ticket } from '../../models/ticket.model';
import { BoxOfficeService } from '../box-office.service';
import { BoxOfficeQrscannerPopupComponent } from './qrscanner-popup/qrscanner-popup.component';
import { isSpotRegistration, passChipsTyped as buildPassChips, PassChip } from '../box-office.utils';

@Component({
  selector: 'app-registration',
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.css']
})
export class RegistrationComponent implements OnInit {

  bookings: Ticket[] = [];

  searchTerm = '';
  searching = false;
  searched = false;
  searchResults: Ticket[] = [];

  showSpotRegistration = false;

  /**
   * passChips() is called from *ngFor on every change-detection cycle — it must
   * return the SAME array/object references across calls for the same ticket,
   * or *ngFor (which diffs list items by identity) tears down and rebuilds every
   * chip's DOM on every tick, including on things as frequent as mousemove.
   */
  private chipCache = new Map<string, PassChip[]>();

  constructor(
    private boxOfficeService: BoxOfficeService,
    private router: Router,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.boxOfficeService.getAllTickets().subscribe({
      next: (res) => {
        this.bookings = res;
      }
    });
  }

  lookUp() {
    const term = this.searchTerm.trim();
    if (!term) {
      return;
    }

    this.searching = true;
    this.searched = false;
    this.searchResults = [];

    this.boxOfficeService.searchTickets(term).subscribe({
      next: (res) => {
        this.searching = false;
        this.searched = true;

        if (res.length === 1) {
          this.goToBooking(res[0]._id!);
        } else {
          res.forEach(b => {
            if (b._id && !this.chipCache.has(b._id)) {
              this.chipCache.set(b._id, buildPassChips(b.shopcart));
            }
          });
          this.searchResults = res;
        }
      },
      error: () => {
        this.searching = false;
        this.searched = true;
        this.searchResults = [];
      }
    });
  }

  /** Returns cached chips so *ngFor sees the same references across change-detection cycles. */
  passChips(booking: Ticket): PassChip[] {
    return this.chipCache.get(booking._id!) ?? buildPassChips(booking.shopcart);
  }

  goToBooking(ticketId: string) {
    this.router.navigate(['/box-office/registration', ticketId]);
  }

  openSpotRegistration() {
    this.showSpotRegistration = true;
  }

  onSpotRegistrationRegistered(ticket: Ticket) {
    this.showSpotRegistration = false;
    this.goToBooking(ticket._id!);
  }

  onSpotRegistrationCancelled() {
    this.showSpotRegistration = false;
  }

  openScanner() {
    const dialogRef = this.dialog.open(BoxOfficeQrscannerPopupComponent, {
      width: '90%',
      maxWidth: '480px'
    });

    dialogRef.afterClosed().subscribe((ticketId: string | null) => {
      if (ticketId) {
        this.goToBooking(ticketId);
      }
    });
  }

  get totalAttendees(): number {
    return this.bookings.reduce((sum, b) => sum + (b.shopcart?.length ?? 0), 0);
  }

  get admittedCount(): number {
    return this.bookings.reduce(
      (sum, b) => sum + (b.shopcart?.filter(item => item.isAdmitted).length ?? 0), 0
    );
  }

  get pendingAdmitsCount(): number {
    return this.bookings.reduce(
      (sum, b) => sum + (b.shopcart?.filter(item => !item.isAdmitted).length ?? 0), 0
    );
  }

  get incompleteDetailsCount(): number {
    return this.bookings.reduce(
      (sum, b) => sum + (b.shopcart?.filter(item => !item.name || !item.phone_no || !item.email).length ?? 0), 0
    );
  }

  get spotRegistrationsCount(): number {
    return this.bookings.filter(b => isSpotRegistration(b)).length;
  }
}
