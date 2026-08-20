import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AccomodationService } from '../../accomodation/accomodation.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { PassType } from '../../models/event.model';
import { Tent } from '../../models/tent.model';

// Derives a short (<=4 char) uppercase prefix from a PassType name, as a
// starting suggestion when one doesn't have a `code` yet — the first two
// letters of the first real word, e.g. "Solo Tent" -> "SO",
// "PYOT (Pitch Your Own Tent)" -> "PY", "Glamping" -> "GL". Purely a
// suggestion; the admin can edit it before saving. See
// ACCOMMODATION_CONTEXT.md decision #11.
export function suggestPassTypeCode(name: string): string {
  const firstWord = (name || '').replace(/[^A-Za-z\s]/g, ' ').trim().split(/\s+/)[0] || '';
  return firstWord.slice(0, 2).toUpperCase();
}

export interface TentTypeSummary {
  passTypeId: string;
  name: string;
  code?: string;
  totalUnits: number;
  totalCapacity: number;
  occupiedSlots: number;
  vacantSlots: number;
  whollyVacantUnits: number;
  fullUnits: number;
  // Gender breakdown (2026-08-20 restructure) — now symmetric across both
  // occupancy states: a unit is bucketed by whichever single gender its
  // filled slots all share, or into the Mixed bucket for that same state
  // once 2+ distinct genders are present. Applies from the first occupant
  // onward (a lone occupant in a capacity-1 full unit still buckets by their
  // gender) — replaces the old any-occupancy sameGenderUnits/mixedGenderUnits
  // pair, which didn't distinguish partial from full.
  partiallyFilledMaleUnits: number;
  partiallyFilledFemaleUnits: number;
  partiallyFilledMixedUnits: number;
  fullMaleUnits: number;
  fullFemaleUnits: number;
  fullMixedUnits: number;
}

// Enhancement (2026-08-20, ACCOMMODATION_CONTEXT.md follow-up #2, restructured
// same day). Computed client-side from data the Inventory page already
// fetches via AccomodationService.getAllTents() — no backend change needed,
// since getAllTents already populates occupants (gender included) whenever a
// tent has any.
export function summarizeTentTypes(tents: Tent[], passTypes: PassType[]): TentTypeSummary[] {
  return passTypes.map(pt => {
    const ptTents = tents.filter(t => (typeof t.passType === 'string' ? t.passType : t.passType?._id) === pt._id);

    const summary: TentTypeSummary = {
      passTypeId: pt._id, name: pt.name, code: pt.code,
      totalUnits: ptTents.length, totalCapacity: 0, occupiedSlots: 0, vacantSlots: 0,
      whollyVacantUnits: 0, fullUnits: 0,
      partiallyFilledMaleUnits: 0, partiallyFilledFemaleUnits: 0, partiallyFilledMixedUnits: 0,
      fullMaleUnits: 0, fullFemaleUnits: 0, fullMixedUnits: 0,
    };

    for (const tent of ptTents) {
      const occupants = tent.occupants ?? [];
      const filled = occupants.filter((o): o is NonNullable<typeof o> => o !== null);
      summary.totalCapacity += tent.capcity;
      summary.occupiedSlots += filled.length;

      const genders = new Set(filled.map(o => o.gender).filter(Boolean));
      const [onlyGender] = genders;
      const isMale = genders.size === 1 && onlyGender === 'Male';
      const isFemale = genders.size === 1 && onlyGender === 'Female';
      const isMixed = genders.size > 1;
      // A partial/full unit whose only occupants are "Prefer not to say"
      // (genders.size === 1 but not Male/Female) isn't shown as its own tile
      // (not asked for) — still counted in the totals above.

      if (filled.length === 0) {
        summary.whollyVacantUnits++;
      } else if (filled.length === tent.capcity) {
        summary.fullUnits++;
        if (isMale) summary.fullMaleUnits++;
        else if (isFemale) summary.fullFemaleUnits++;
        else if (isMixed) summary.fullMixedUnits++;
      } else {
        if (isMale) summary.partiallyFilledMaleUnits++;
        else if (isFemale) summary.partiallyFilledFemaleUnits++;
        else if (isMixed) summary.partiallyFilledMixedUnits++;
      }
    }
    summary.vacantSlots = summary.totalCapacity - summary.occupiedSlots;
    return summary;
  });
}

@Component({
  selector: 'app-accommodation-setup',
  templateUrl: './accommodation-setup.component.html',
  styleUrls: ['./accommodation-setup.component.css']
})
export class AccommodationSetupComponent implements OnInit, OnDestroy {

  loading = false;
  creating = false;
  noActiveEvent = false;

  tentPassTypes: PassType[] = [];
  lastCreated: Tent[] | null = null;
  summaries: TentTypeSummary[] = [];

  form = new FormGroup({
    passTypeId: new FormControl('', Validators.required),
    capacity: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
    quantity: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
    code: new FormControl('', Validators.maxLength(4)),
  });

  private eventSub?: Subscription;

  constructor(
    private accomodationService: AccomodationService,
    private eventService: EventService,
    private notificationService: NotificationService,
  ) { }

  // Subscribes to the activeEvent Observable rather than reading
  // currentActiveEvent once — EventService's own event list is still loading
  // asynchronously at the point this component's ngOnInit runs (the exact
  // startup race documented in event.service.ts's `sawUser` comment), so a
  // one-time synchronous read here could catch a still-null value and get
  // permanently stuck showing "no active event" even once one resolves a
  // moment later. Found while manually testing this page.
  ngOnInit(): void {
    this.eventSub = this.eventService.activeEvent.subscribe(event => {
      if (event) {
        this.noActiveEvent = false;
        this.loadTentPassTypes(event._id);
      } else {
        this.noActiveEvent = true;
        this.tentPassTypes = [];
        this.summaries = [];
      }
    });
  }

  ngOnDestroy(): void {
    this.eventSub?.unsubscribe();
  }

  get activeEvent() {
    return this.eventService.currentActiveEvent;
  }

  loadTentPassTypes(eventId: string) {
    this.loading = true;
    this.eventService.getEventDetail(eventId).subscribe({
      next: (detail) => {
        this.tentPassTypes = detail.passTypes.filter(pt => pt.category === 'tent');
        this.loading = false;
        this.refreshSummary(eventId);
      },
      error: () => {
        this.notificationService.openErrorSnackBar('Error loading pass types');
        this.loading = false;
      }
    });
  }

  /** Recomputes the type-summary cards — called on load and again after a
   *  successful create, since a new batch changes the counts. Fails silently
   *  (summary is a nice-to-have alongside the create form, not blocking). */
  refreshSummary(eventId: string) {
    this.accomodationService.getAllTents(eventId).subscribe({
      next: (tents) => { this.summaries = summarizeTentTypes(tents, this.tentPassTypes); },
      error: () => { /* summary is best-effort display only */ }
    });
  }

  get selectedPassType(): PassType | null {
    const id = this.form.value.passTypeId;
    return this.tentPassTypes.find(pt => pt._id === id) || null;
  }

  get needsCode(): boolean {
    return !!this.selectedPassType && !this.selectedPassType.code;
  }

  onPassTypeChange() {
    this.lastCreated = null;
    if (this.needsCode) {
      this.form.get('code')!.setValue(suggestPassTypeCode(this.selectedPassType!.name));
    } else {
      this.form.get('code')!.setValue('');
    }
  }

  submit() {
    const event = this.activeEvent;
    const passType = this.selectedPassType;
    if (!event || !passType || this.form.invalid || this.creating) return;

    this.creating = true;
    const { capacity, quantity, code } = this.form.value;

    const create = () => {
      this.accomodationService.createTents({
        eventId: event._id, passTypeId: passType._id, capacity: capacity!, quantity: quantity!
      }).subscribe({
        next: (tents) => {
          this.creating = false;
          this.lastCreated = tents;
          const range = tents.length === 1 ? tents[0].tent_no : `${tents[0].tent_no} – ${tents[tents.length - 1].tent_no}`;
          this.notificationService.openSucessSnackBar(`Created ${tents.length} unit(s): ${range}`);
          this.refreshSummary(event._id);
          this.form.patchValue({ capacity: null, quantity: null });
          // patchValue() doesn't clear touched state — without this, the
          // now-empty fields immediately show a red "Required" error right
          // after a successful creation, which reads as something went wrong.
          this.form.get('capacity')!.markAsUntouched();
          this.form.get('quantity')!.markAsUntouched();
        },
        error: (err) => {
          this.creating = false;
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Error creating tents');
        }
      });
    };

    if (this.needsCode) {
      const trimmedCode = (code || '').trim();
      if (!trimmedCode) {
        this.creating = false;
        this.notificationService.openErrorSnackBar(`"${passType.name}" needs a code before you can create units against it`);
        return;
      }
      this.eventService.updatePassType(event._id, passType._id, { code: trimmedCode }).subscribe({
        next: (updated) => {
          passType.code = updated.code; // reflected locally too, so needsCode flips off immediately
          create();
        },
        error: (err) => {
          this.creating = false;
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Error saving pass type code');
        }
      });
    } else {
      create();
    }
  }
}
