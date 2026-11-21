import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

import { Gender, Shopcart, Ticket } from '../../../models/ticket.model';
import { Tent } from '../../../models/tent.model';
import { AccomodationService, StayView, SuggestedPass, TentAllocationResult } from '../../../accomodation/accomodation.service';
import { NotificationService } from '../../../core/notification.service';
import { EventService } from '../../../core/event.service';
import { MatDialog } from '@angular/material/dialog';
import { FieldPickerDialogComponent, FieldPickerData } from '../../../accommodation/fields/field-picker-dialog.component';

@Component({
  selector: 'app-allocate-tent',
  templateUrl: './allocate-tent.component.html',
  styleUrls: ['./allocate-tent.component.css']
})
export class AllocateTentComponent implements OnInit {

  @Input() shopItem!: Shopcart;
  /** The booking this Tent Pass belongs to — used as a fallback search seed
   *  when the item itself has no identity of its own (see ngOnInit). */
  @Input() ticket?: Ticket;
  @Output() allocated = new EventEmitter<TentAllocationResult>();
  @Output() cancelled = new EventEmitter<void>();

  readonly genderOptions: Gender[] = ['Male', 'Female', 'Prefer not to say'];
  /** Only used as a fallback when the selected Festival Pass has no gender on file yet. */
  localGender: Gender | '' = '';

  festivalPassSuggestions: SuggestedPass[] = [];
  /** This booking's Festival Passes with no bed yet that still need their details. */
  unfilledInBooking = 0;
  /** The same, for the bookings this one links to (I5). */
  unfilledInLinked = 0;
  selectedFestivalPassId: string | null = null;
  manualSearchTerm = '';

  vacantTents: Tent[] = [];
  selectedTentId: string | null = null;

  genderMismatchPending = false;
  genderMismatchExisting: string[] = [];

  /** Bed model (I0): this Tent Pass's beds; null until loaded. */
  stay: StayView | null = null;
  /** "This stay's other beds are in CR1. Put this bed in CR2 anyway?" */
  unitMismatchMessage = '';
  private overrideGender = false;

  allocating = false;

  constructor(
    private accomodationService: AccomodationService,
    private notificationService: NotificationService,
    private eventService: EventService,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    // Bug fix (2026-08-20): a Tent Pass now correctly starts blank (see the
    // boxOffice.js createTicket/uploadExcel fix) rather than pre-filled with
    // the buyer's own details — so auto-searching using this item's OWN
    // name/phone/email is no longer a meaningful seed most of the time, and
    // matching on it was actively wrong: "" and the old "+91" filler (still
    // present on tent passes created before this fix) are shared by every
    // other blank item too, since suggestFestivalPassMatches does an *exact*
    // match on phone/email — so it was returning unrelated attendees instead
    // of no suggestions.
    //
    // Follow-up same day: rather than just showing nothing for a blank item,
    // fall back to the parent Ticket's own buyer details as the search seed
    // — a blank Tent Pass still belongs to a real booking, and the buyer is
    // very often (not always, for group bookings) the right Festival Pass.
    // Staff can still search manually if this guess is wrong.
    //
    // 2026-11-21: always asked, even with no seed — the server puts this Tent
    // Pass's own booking's filled-in Festival Passes first (sameBooking).
    this.loadSuggestions(this.searchSeed() ?? {});
    this.loadVacantTents();
    this.loadStay();
  }

  private loadStay() {
    if (!this.shopItem._id) return;
    this.accomodationService.getStay(this.shopItem._id).subscribe({
      next: (s) => this.stay = s,
      error: () => this.stay = null
    });
  }

  /** Which bed this allocation fills, e.g. 2 (of 3). */
  get bedNumber(): number { return (this.stay?.used ?? 0) + 1; }
  get bedCount(): number { return this.stay?.beds ?? this.shopItem.beds ?? 1; }
  /** The unit of this stay's other beds (shown on the auto-pick choice). */
  get stayTentNo(): string { return this.stay?.people[0]?.tent_no || ''; }
  get stayNames(): string { return (this.stay?.people || []).map(p => p.name || 'Attendee').join(', '); }

  private hasSearchableIdentity(item: { name?: string; phone_no?: string; email?: string }): boolean {
    const name = (item.name || '').trim();
    const phone = (item.phone_no || '').trim();
    const email = (item.email || '').trim();
    return !!name || !!email || (!!phone && phone !== '+91');
  }

  /** The shop item's own details, if it has any; otherwise the parent
   *  ticket's buyer details, if that's available and has something to
   *  search on; otherwise null (no auto-search — matches the guard this
   *  replaced when neither source has anything meaningful). */
  private searchSeed(): { name?: string; phone?: string; email?: string } | null {
    if (this.hasSearchableIdentity(this.shopItem)) {
      return { name: this.shopItem.name, phone: this.shopItem.phone_no, email: this.shopItem.email };
    }
    if (this.ticket && this.hasSearchableIdentity({ name: `${this.ticket.first_name || ''} ${this.ticket.last_name || ''}`, phone_no: this.ticket.phone_no, email: this.ticket.email })) {
      return {
        name: `${this.ticket.first_name || ''} ${this.ticket.last_name || ''}`.trim(),
        phone: this.ticket.phone_no,
        email: this.ticket.email
      };
    }
    return null;
  }

  private loadSuggestions(params: { name?: string; phone?: string; email?: string }, notifyIfNoEvent = false) {
    const activeEvent = this.eventService.currentActiveEvent;
    if (!activeEvent || !this.shopItem._id) {
      this.festivalPassSuggestions = [];
      if (!activeEvent && notifyIfNoEvent) this.notificationService.openErrorSnackBar('No event selected');
      return;
    }
    this.accomodationService.suggestFestivalPassMatches(activeEvent._id, this.shopItem._id, params).subscribe({
      next: (res) => {
        this.festivalPassSuggestions = res?.matches ?? [];
        this.unfilledInBooking = res?.unfilledInBooking ?? 0;
        this.unfilledInLinked = res?.unfilledInLinked ?? 0;
      },
      error: () => { this.festivalPassSuggestions = []; this.unfilledInBooking = 0; this.unfilledInLinked = 0; }
    });
  }

  // Was calling getAvailableTents(this.shopItem.item_name) — item_name is a
  // free-text label (e.g. "Solo Tent"), but the backend endpoint requires a
  // real passType id since Introducing Events, so this always 400'd and the
  // picker silently showed zero vacant tents. allocate() still worked
  // because the backend auto-picks any vacant tent of the right type when no
  // explicit tentId is sent — but staff lost the ability to choose a
  // specific tent, and any visibility into what was actually vacant. Found
  // while building the Accommodation epic (ACCOMMODATION_CONTEXT.md).
  private loadVacantTents() {
    if (!this.shopItem.passType) { this.vacantTents = []; return; }
    this.accomodationService.getAvailableTents(this.shopItem.passType).subscribe({
      next: (res) => this.vacantTents = res,
      error: () => this.vacantTents = []
    });
  }

  /**
   * Tent Fields (B4): pick the tent on the field layout instead of the list.
   * Only chooses the tent — Allocate then works exactly as before.
   */
  openFieldPicker() {
    const activeEvent = this.eventService.currentActiveEvent;
    if (!activeEvent || !this.shopItem.passType) return;
    const data: FieldPickerData = {
      eventId: activeEvent._id,
      passTypeId: this.shopItem.passType,
      passTypeName: this.shopItem.passTypeName || this.shopItem.item_name || 'tent',
      gender: this.selectedFestivalPass?.gender || this.localGender || null,
    };
    this.dialog.open(FieldPickerDialogComponent, { width: '980px', maxWidth: '96vw', data, autoFocus: false })
      .afterClosed().subscribe((tentId?: string) => {
        if (!tentId) return;
        if (this.vacantTents.some(t => t._id === tentId)) { this.selectedTentId = tentId; return; }
        // The list may be older than the field: reload it, then select
        this.accomodationService.getAvailableTents(this.shopItem.passType!).subscribe({
          next: res => { this.vacantTents = res; this.selectedTentId = res.some(t => t._id === tentId) ? tentId : null; },
          error: () => this.notificationService.openErrorSnackBar('Could not load the free tents')
        });
      });
  }

  searchManually() {
    const term = this.manualSearchTerm.trim();
    if (!term) {
      return;
    }
    this.loadSuggestions({ name: term, phone: term, email: term }, true);
  }

  /** "Booking TST-1", else "Order #42" for a pass without a Booking ID; '' if neither. */
  bookingLabel(p: Shopcart): string {
    if (p.bookingId) return 'Booking ' + p.bookingId;
    return p.order_id != null ? 'Order #' + p.order_id : '';
  }

  /** Imported passes have no item_name, only passTypeName. */
  get passName(): string { return this.shopItem.passTypeName || this.shopItem.item_name || ''; }

  trackSuggestion = (_: number, p: SuggestedPass) => p._id;

  get selectedFestivalPass(): Shopcart | null {
    return this.festivalPassSuggestions.find(c => c._id === this.selectedFestivalPassId) ?? null;
  }

  /** The Festival Pass is the canonical identity record — only prompt for gender here if it's missing there. */
  get needsGender(): boolean {
    return !!this.selectedFestivalPassId && !this.selectedFestivalPass?.gender;
  }

  selectFestivalPass(candidate: Shopcart) {
    if (this.selectedFestivalPassId === candidate._id) {
      this.selectedFestivalPassId = null;
      this.localGender = '';
    } else {
      this.selectedFestivalPassId = candidate._id!;
      this.localGender = candidate.gender || '';
    }
  }

  vacancyOf(tent: Tent): number {
    return (tent.occupants ?? []).filter(o => o === null).length;
  }

  allocate(overrideGenderMismatch = this.overrideGender, overrideUnitMismatch = false) {
    const pass = this.selectedFestivalPass;
    const gender = pass?.gender || this.localGender;
    if (!pass || !gender || this.allocating) {
      return;
    }
    this.allocating = true;

    this.accomodationService.allocateTentSlot({
      tentPassId: this.shopItem._id!,
      festivalPassId: pass._id!,
      tentId: this.selectedTentId ?? undefined,
      gender: pass.gender ? undefined : (gender as Gender),
      overrideGenderMismatch,
      overrideUnitMismatch
    }).subscribe({
      next: (result) => {
        this.allocating = false;
        this.genderMismatchPending = false;
        this.unitMismatchMessage = '';
        this.overrideGender = false;
        this.notificationService.openSucessSnackBar(this.bedCount > 1 ? `Bed ${this.bedNumber} of ${this.bedCount} allocated` : 'Tent allocated');
        this.allocated.emit(result);
      },
      error: (err) => {
        this.allocating = false;
        if (err?.error?.code === 'UNIT_MISMATCH') {
          this.overrideGender = overrideGenderMismatch;
          this.unitMismatchMessage = err.error.message || "This stay's other beds are in another unit. Allocate anyway?";
        } else if (err?.error?.code === 'GENDER_MISMATCH') {
          this.genderMismatchPending = true;
          this.genderMismatchExisting = err.error.existingGenders || [];
        } else {
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Tent allocation failed');
        }
      }
    });
  }

  confirmGenderMismatch() {
    this.genderMismatchPending = false;
    this.allocate(true);
  }

  /** Bed in another unit than the stay's other beds: staff confirmed. */
  confirmUnitMismatch() {
    this.allocate(this.overrideGender, true);
  }

  cancelUnitMismatch() {
    this.unitMismatchMessage = '';
    this.overrideGender = false;
  }

  cancelGenderMismatch() {
    this.genderMismatchPending = false;
  }

  cancel() {
    this.cancelled.emit();
  }
}
