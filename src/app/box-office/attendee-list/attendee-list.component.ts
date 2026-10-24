import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { Shopcart, Ticket } from '../../models/ticket.model';
import { Tent } from '../../models/tent.model';
import { BoxOfficeService } from '../box-office.service';
import { AccomodationService, TentAllocationResult } from '../../accomodation/accomodation.service';
import { NotificationService } from '../../core/notification.service';
import { isFestivalPass } from '../box-office.utils';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import { BoxOfficeQrscannerPopupComponent, QrScannerData } from '../registration/qrscanner-popup/qrscanner-popup.component';

/**
 * Shared attendee-row list with Admit / Link Band / Allocate Tent / Vacate / Fill at
 * Counter actions — used by both the Booking Found page and the Bookings
 * detail panel, so this logic lives in exactly one place rather than being
 * duplicated (and risking drift) across the two.
 */
@Component({
  selector: 'app-attendee-list',
  templateUrl: './attendee-list.component.html',
  styleUrls: ['./attendee-list.component.css']
})
export class AttendeeListComponent implements OnChanges {

  @Input() ticket!: Ticket;

  /**
   * Shows an "Edit" action on rows with complete details, opening the same
   * Counter Form used to fill in missing details — reused here for correcting
   * already-set name/phone/email/gender. Only enabled from the Bookings panel
   * per explicit request; Booking Found (gate-day check-in) doesn't need it.
   */
  @Input() allowEdit = false;

  activeCounterItem: Shopcart | null = null;
  activeAllocateItem: Shopcart | null = null;

  /** allocatedTentId -> Tent, resolved lazily for the "Tent: SH13" readout. */
  tentLookup: Record<string, Tent> = {};

  constructor(
    private boxOfficeService: BoxOfficeService,
    private accomodationService: AccomodationService,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private gateFeedback: GateFeedbackService
  ) { }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['ticket']) {
      // A different booking must open on its attendee list, not on the
      // previous booking's Allocate Tent / Counter Form. Same _id = just a
      // refreshed copy of the open booking, so an open form is left alone.
      const previous = changes['ticket'].previousValue as Ticket | undefined;
      if (previous?._id !== this.ticket?._id) {
        this.resetView();
      }
      this.loadTentDetails();
    }
  }

  /** Back to the attendee rows — closes any open Counter Form / Allocate Tent. */
  resetView() {
    this.activeCounterItem = null;
    this.activeAllocateItem = null;
  }

  private loadTentDetails() {
    const tentIds = new Set(
      (this.ticket?.shopcart ?? [])
        .map(item => item.allocatedTentId)
        .filter((id): id is string => !!id && !this.tentLookup[id])
    );
    tentIds.forEach(id => {
      this.accomodationService.getTentById(id).subscribe({
        next: (tent) => this.tentLookup[id] = tent,
        error: () => { /* tent lookup is best-effort display only */ }
      });
    });
  }

  private replaceShopcartItem(updated: Shopcart) {
    if (!this.ticket?.shopcart) {
      return;
    }
    const idx = this.ticket.shopcart.findIndex(i => i._id === updated._id);
    if (idx > -1) {
      this.ticket.shopcart[idx] = updated;
    }
  }

  /** Festival Pass rows before Tent Pass rows — Array.sort is stable, so original order is kept within each group. */
  get sortedShopcart(): Shopcart[] {
    const shopcart = this.ticket?.shopcart ?? [];
    return [...shopcart].sort((a, b) => Number(!this.isFestivalPass(a)) - Number(!this.isFestivalPass(b)));
  }

  isDetailsComplete(item: Shopcart): boolean {
    return !!item.name && !!item.phone_no && !!item.email;
  }

  isFestivalPass(item: Shopcart): boolean {
    return isFestivalPass(item);
  }

  attendeeInitials(item: Shopcart): string {
    if (!item.name) {
      return '?';
    }
    return item.name.trim().charAt(0).toUpperCase();
  }

  tentNoFor(item: Shopcart): string | null {
    if (!item.allocatedTentId) {
      return null;
    }
    return this.tentLookup[item.allocatedTentId]?.tent_no ?? null;
  }

  openCounterForm(item: Shopcart) {
    this.activeCounterItem = item;
  }

  onCounterFormSaved(updated: Shopcart) {
    this.replaceShopcartItem(updated);
    this.activeCounterItem = null;
  }

  onCounterFormCancelled() {
    this.activeCounterItem = null;
  }

  admitAttendee(item: Shopcart) {
    this.boxOfficeService.checkIn(item._id!).subscribe({
      next: (updated) => {
        this.replaceShopcartItem(updated);
        this.notificationService.openSucessSnackBar('Admitted');
      },
      error: (err) => {
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Admission failed');
      }
    });
  }

  /**
   * Link Band (demo): opens the gate scanner in band mode to read the
   * wrist band QR handed out at admission. For now it only shows what was
   * read — saving it against the Festival Pass waits on the band id format.
   */
  openLinkBand(item: Shopcart) {
    this.gateFeedback.unlock();
    const data: QrScannerData = { mode: 'band', attendeeName: item.name || 'Attendee' };
    this.dialog.open(BoxOfficeQrscannerPopupComponent, {
      width: '90%',
      maxWidth: '480px',
      data
    });
  }

  openAllocateTent(item: Shopcart) {
    this.activeAllocateItem = item;
  }

  onTentAllocated(result: TentAllocationResult) {
    this.tentLookup[result.tent._id!] = result.tent;
    this.replaceShopcartItem(result.tentPassItem);
    if (result.festivalPassItem) {
      this.replaceShopcartItem(result.festivalPassItem);
    }
    this.activeAllocateItem = null;
  }

  onAllocateCancelled() {
    this.activeAllocateItem = null;
  }

  vacateAttendee(item: Shopcart) {
    this.accomodationService.vacateTentSlot(item._id!).subscribe({
      next: (result) => {
        this.replaceShopcartItem(result.tentPassItem);
        if (result.festivalPassItem) {
          this.replaceShopcartItem(result.festivalPassItem);
        }
        this.notificationService.openSucessSnackBar('Tent vacated');
      },
      error: (err) => {
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Failed to vacate tent');
      }
    });
  }
}
