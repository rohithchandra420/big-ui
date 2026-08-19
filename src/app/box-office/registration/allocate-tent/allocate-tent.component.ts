import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

import { Gender, Shopcart } from '../../../models/ticket.model';
import { Tent } from '../../../models/tent.model';
import { AccomodationService, TentAllocationResult } from '../../../accomodation/accomodation.service';
import { NotificationService } from '../../../core/notification.service';
import { EventService } from '../../../core/event.service';

@Component({
  selector: 'app-allocate-tent',
  templateUrl: './allocate-tent.component.html',
  styleUrls: ['./allocate-tent.component.css']
})
export class AllocateTentComponent implements OnInit {

  @Input() shopItem!: Shopcart;
  @Output() allocated = new EventEmitter<TentAllocationResult>();
  @Output() cancelled = new EventEmitter<void>();

  readonly genderOptions: Gender[] = ['Male', 'Female', 'Prefer not to say'];
  /** Only used as a fallback when the selected Festival Pass has no gender on file yet. */
  localGender: Gender | '' = '';

  festivalPassSuggestions: Shopcart[] = [];
  selectedFestivalPassId: string | null = null;
  manualSearchTerm = '';

  vacantTents: Tent[] = [];
  selectedTentId: string | null = null;

  genderMismatchPending = false;
  genderMismatchExisting: string[] = [];

  allocating = false;

  constructor(
    private accomodationService: AccomodationService,
    private notificationService: NotificationService,
    private eventService: EventService
  ) { }

  ngOnInit() {
    this.loadSuggestions({
      name: this.shopItem.name,
      phone: this.shopItem.phone_no,
      email: this.shopItem.email
    });
    this.loadVacantTents();
  }

  private loadSuggestions(params: { name?: string; phone?: string; email?: string }, notifyIfNoEvent = false) {
    const activeEvent = this.eventService.currentActiveEvent;
    if (!activeEvent) {
      this.festivalPassSuggestions = [];
      if (notifyIfNoEvent) this.notificationService.openErrorSnackBar('No event selected');
      return;
    }
    this.accomodationService.suggestFestivalPassMatches(activeEvent._id, params).subscribe({
      next: (res) => this.festivalPassSuggestions = res,
      error: () => this.festivalPassSuggestions = []
    });
  }

  private loadVacantTents() {
    this.accomodationService.getAvailableTents(this.shopItem.item_name).subscribe({
      next: (res) => this.vacantTents = res,
      error: () => this.vacantTents = []
    });
  }

  searchManually() {
    const term = this.manualSearchTerm.trim();
    if (!term) {
      return;
    }
    this.loadSuggestions({ name: term, phone: term, email: term }, true);
  }

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

  allocate(overrideGenderMismatch = false) {
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
      overrideGenderMismatch
    }).subscribe({
      next: (result) => {
        this.allocating = false;
        this.genderMismatchPending = false;
        this.notificationService.openSucessSnackBar('Tent allocated');
        this.allocated.emit(result);
      },
      error: (err) => {
        this.allocating = false;
        if (err?.error?.code === 'GENDER_MISMATCH') {
          this.genderMismatchPending = true;
          this.genderMismatchExisting = err.error.existingGenders || [];
        } else {
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Tent allocation failed');
        }
      }
    });
  }

  confirmGenderMismatch() {
    this.allocate(true);
  }

  cancelGenderMismatch() {
    this.genderMismatchPending = false;
  }

  cancel() {
    this.cancelled.emit();
  }
}
