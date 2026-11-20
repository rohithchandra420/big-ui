import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { filter } from 'rxjs';

import { Shopcart, Ticket } from '../../models/ticket.model';
import { Tent } from '../../models/tent.model';
import { BandHistoryEntry, BoxOfficeService } from '../box-office.service';
import { AccomodationService, StayView, TentAllocationResult } from '../../accomodation/accomodation.service';
import { NotificationService } from '../../core/notification.service';
import { AuthService } from '../../core/auth.service';
import { isFestivalPass, passDisplayName } from '../box-office.utils';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import {
  BandPurpose, BandScanResult, BoxOfficeQrscannerPopupComponent, QrScannerData
} from '../registration/qrscanner-popup/qrscanner-popup.component';

/**
 * Shared attendee-row list with Admit / Band / Allocate Tent / Vacate / Fill at
 * Counter actions — used by both the Booking Found page and the Bookings
 * detail panel, so this logic lives in exactly one place rather than being
 * duplicated (and risking drift) across the two.
 */
/** A pass kind chip: label, Material Symbols icon and colour class. */
export interface PassKind { label: string; icon: string; cls: string; }

const PASS_KINDS: { [category: string]: PassKind } = {
  festival: { label: 'Festival Pass', icon: 'confirmation_number', cls: 'pk-festival' },
  tent: { label: 'Tent Pass', icon: 'hotel', cls: 'pk-tent' },
  addon: { label: 'Add-on', icon: 'add_circle', cls: 'pk-addon' },
};

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

  /** Bed model (I0): Tent Pass id -> its beds and who is in them. */
  stays: Record<string, StayView> = {};

  /** passId -> its bands, newest first; loaded when the band details open. */
  bandHistory: Record<string, BandHistoryEntry[]> = {};
  openHistoryFor: string | null = null;

  constructor(
    private boxOfficeService: BoxOfficeService,
    private accomodationService: AccomodationService,
    private notificationService: NotificationService,
    private dialog: MatDialog,
    private gateFeedback: GateFeedbackService,
    private authService: AuthService
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
      this.loadStays();
    }
  }

  /** Every Tent Pass's beds (who is in them may come from a linked booking). */
  private loadStays() {
    for (const item of this.ticket?.shopcart ?? []) {
      if (this.isFestivalPass(item) || !item._id) continue;
      this.accomodationService.getStay(item._id).subscribe({
        next: (s) => this.stays[item._id!] = s,
        error: () => { /* best-effort display only */ }
      });
    }
  }

  /** Beds of a Tent Pass (from its stay once loaded). */
  bedsOf(item: Shopcart): number { return this.stays[item._id!]?.beds ?? item.beds ?? 1; }
  /** Beds taken. Before the stay loads: 1 when the pass has a unit. */
  bedsUsed(item: Shopcart): number { return this.stays[item._id!]?.used ?? (item.allocatedTentId ? 1 : 0); }
  bedsFree(item: Shopcart): boolean { return this.bedsUsed(item) < this.bedsOf(item); }
  peopleIn(item: Shopcart): StayView['people'] { return this.stays[item._id!]?.people ?? []; }
  trackPerson = (_: number, p: { _id: string }) => p._id;

  /** Back to the attendee rows — closes any open Counter Form / Allocate Tent. */
  resetView() {
    this.activeCounterItem = null;
    this.activeAllocateItem = null;
    this.openHistoryFor = null;
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

  /**
   * The kind of pass (ui 1.69.0): only the icon shows it (ticket = festival,
   * hotel = tent, plus = add-on), followed by the item's own pass name.
   * The label is the icon's tooltip / screen-reader text, never shown. Fixed objects, so change detection
   * gets the same identity every time. An item with no category falls back
   * to the old name match (festival, else tent).
   */
  /** Pass name after the type icon: passTypeName (Box Office flow), else item_name (uploads / old items). */
  passName(item: Shopcart): string {
    return passDisplayName(item);
  }

  passKind(item: Shopcart): PassKind {
    const cat = item.category || (isFestivalPass(item) ? 'festival' : 'tent');
    return PASS_KINDS[cat] || PASS_KINDS['tent'];
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

  /**
   * Opens the scanner in band mode for one Festival Pass. Emits the band
   * staff confirmed, or nothing when they cancel.
   */
  private scanBand(item: Shopcart, purpose: BandPurpose) {
    this.gateFeedback.unlock();
    const data: QrScannerData = { mode: 'band', purpose, attendeeName: item.name || 'Attendee', passId: item._id };
    return this.dialog.open(BoxOfficeQrscannerPopupComponent, {
      width: '90%',
      maxWidth: '480px',
      data
    }).afterClosed().pipe(filter((res): res is BandScanResult => !!res?.raw));
  }

  /** Admit: no admitting without a band (W1) — the band is scanned first and linked in the same call. */
  admitAttendee(item: Shopcart) {
    this.scanBand(item, 'admit').subscribe(scan => {
      this.boxOfficeService.checkIn(item._id!, scan.raw).subscribe({
        next: (updated) => {
          this.bandChanged(updated);
          this.notificationService.openSucessSnackBar('Admitted, band linked');
        },
        error: (err) => {
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Admission failed');
        }
      });
    });
  }

  /** For a pass admitted before bands existed. */
  openLinkBand(item: Shopcart) {
    this.scanBand(item, 'link').subscribe(scan => {
      this.boxOfficeService.linkBand(item._id!, scan.raw).subscribe({
        next: (res) => {
          this.bandChanged(res.pass);
          this.notificationService.openSucessSnackBar('Band linked');
        },
        error: (err) => {
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not link the band');
        }
      });
    });
  }

  openReplaceBand(item: Shopcart) {
    this.scanBand(item, 'replace').subscribe(scan => {
      this.boxOfficeService.replaceBand(item._id!, scan.raw, scan.reason || '').subscribe({
        next: (res) => {
          this.bandChanged(res.pass);
          this.notificationService.openSucessSnackBar('Band replaced');
        },
        error: (err) => {
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not replace the band');
        }
      });
    });
  }

  /** View-only people (Helpdesk, a "box-office:read" grant alone): no Admit, bands, tents or edits. */
  get readOnly(): boolean {
    return !!this.authService.boxOfficeReadOnly?.(this.authService.currentUser);
  }

  /** Same rule as big-api's middleware/bandAuth.js — the server checks again. */
  get canReplaceBand(): boolean {
    const user = this.authService.currentUser;
    if (!user) return false;
    if (['DEV', 'DIR', 'ADMIN'].includes(user.role)) return true;
    return this.authService.hasPermission(user, 'box-office:write')
      || this.authService.inDepartmentKey(user, 'box-office');
  }

  private bandChanged(updated: Shopcart) {
    this.replaceShopcartItem(updated);
    delete this.bandHistory[updated._id!];
    if (this.openHistoryFor === updated._id) {
      this.loadBandHistory(updated._id!);
    }
  }

  /** The row's band details (code, who linked it, replaced bands) — loaded when opened. */
  toggleBandHistory(item: Shopcart) {
    if (this.openHistoryFor === item._id) {
      this.openHistoryFor = null;
      return;
    }
    this.openHistoryFor = item._id!;
    if (!this.bandHistory[item._id!]) {
      this.loadBandHistory(item._id!);
    }
  }

  private loadBandHistory(passId: string) {
    this.boxOfficeService.bandHistory(passId).subscribe({
      next: (res) => this.bandHistory[passId] = res.bands,
      error: () => {
        this.openHistoryFor = null;
        this.notificationService.openErrorSnackBar('Could not load the band details');
      }
    });
  }

  openAllocateTent(item: Shopcart) {
    this.activeAllocateItem = item;
  }

  onTentAllocated(result: TentAllocationResult) {
    this.tentLookup[result.tent._id!] = result.tent;
    if (result.stay) this.stays[result.tentPassItem._id!] = result.stay;
    this.replaceShopcartItem(result.tentPassItem);
    if (result.festivalPassItem) {
      this.replaceShopcartItem(result.festivalPassItem);
    }
    this.activeAllocateItem = null;
  }

  onAllocateCancelled() {
    this.activeAllocateItem = null;
  }

  /**
   * Frees one bed: a Festival Pass's own bed, or — from a Tent Pass row — the
   * bed of `person` (needed when several beds are taken).
   */
  vacateAttendee(item: Shopcart, person?: { _id: string }) {
    this.accomodationService.vacateTentSlot(item._id!, person?._id).subscribe({
      next: (result) => {
        if (result.stay && result.tentPassItem?._id) this.stays[result.tentPassItem._id] = result.stay;
        if (result.tentPassItem) this.replaceShopcartItem(result.tentPassItem);
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
