import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';

import { AccomodationService } from '../../accomodation/accomodation.service';
import { AuthService } from '../../core/auth.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { Tent, TentPassType } from '../../models/tent.model';
import { Shopcart } from '../../models/ticket.model';

// Enhancement (2026-08-20, ACCOMMODATION_CONTEXT.md follow-up #4). Scoped per
// event — same pattern EventService already uses for the active event itself
// — so switching events doesn't leave a stale filter selected that matches
// nothing in the new event's tent types.
const TYPE_FILTER_KEY_PREFIX = 'accommodationInventoryTypeFilter:';

// Enhancement (2026-08-20). Plain string sort puts "SH10" before "SH2"
// (compares character by character, and '1' < '2') — splits into the letter
// prefix and trailing digits, compares the prefix alphabetically first, then
// the digits as a number, so SH1, SH2 ... SH9, SH10, SH11 comes out in the
// order a person would expect.
export function compareTentNo(a: string, b: string): number {
  const parse = (s: string) => {
    const match = (s || '').match(/^(.*?)(\d+)$/);
    return match ? { prefix: match[1], num: parseInt(match[2], 10) } : { prefix: s || '', num: NaN };
  };
  const pa = parse(a);
  const pb = parse(b);
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
  if (isNaN(pa.num) && isNaN(pb.num)) return 0;
  if (isNaN(pa.num)) return -1;
  if (isNaN(pb.num)) return 1;
  return pa.num - pb.num;
}

@Component({
  selector: 'app-accommodation-inventory',
  templateUrl: './accommodation-inventory.component.html',
  styleUrls: ['./accommodation-inventory.component.css']
})
export class AccommodationInventoryComponent implements OnInit, OnDestroy {

  loading = false;
  noActiveEvent = false;

  tents: Tent[] = [];
  searchTerm = '';
  selectedType = 'All';
  selectedOccupancy = 'All';
  readonly occupancyOptions = ['All', 'Vacant', 'Partial', 'Full'];

  /** The event fetchTents() last loaded for — needed so setTypeFilter() can
   *  persist under the right key without re-reading currentActiveEvent. */
  private currentEventId: string | null = null;

  /** Enhancement (2026-08-20, ACCOMMODATION_CONTEXT.md follow-up #5). The
   *  tent whose occupant-detail row is currently expanded, or null. Only one
   *  at a time — matches editingTentId's shape. */
  expandedTentId: string | null = null;

  editingTentId: string | null = null;
  editForm = new FormGroup({
    tent_no: new FormControl('', Validators.required),
    capcity: new FormControl<number | null>(null, [Validators.required, Validators.min(1)]),
  });

  private eventSub?: Subscription;

  constructor(
    private accomodationService: AccomodationService,
    private eventService: EventService,
    private authService: AuthService,
    private notificationService: NotificationService,
  ) { }

  // Subscribes rather than reading currentActiveEvent once — see the
  // identical comment on AccommodationSetupComponent.ngOnInit(); same
  // startup race, found manually testing this page.
  ngOnInit(): void {
    this.eventSub = this.eventService.activeEvent.subscribe(event => {
      if (event) {
        this.noActiveEvent = false;
        this.fetchTents(event._id);
      } else {
        this.noActiveEvent = true;
        this.tents = [];
      }
    });
  }

  ngOnDestroy(): void {
    this.eventSub?.unsubscribe();
  }

  /** Edit/delete need write-tier access (or an admin role) — separate from
   *  page visibility, which is broader. See ACCOMMODATION_CONTEXT.md
   *  decision #9. Reuses the Box Office permission/department, same as this
   *  page's own visibility gate in header.component.ts, rather than
   *  inventing a standalone "Accommodation" department. */
  get canManage(): boolean {
    const user = this.authService.currentUser;
    if (!user) return false;
    if (['DEV', 'DIR', 'ADMIN'].includes(user.role)) return true;
    return this.authService.hasPermission(user, 'box-office:write');
  }

  fetchTents(eventId: string) {
    this.loading = true;
    this.currentEventId = eventId;
    this.expandedTentId = null;
    this.accomodationService.getAllTents(eventId).subscribe({
      next: (res) => {
        this.tents = res;
        this.loading = false;
        // Restore the saved filter for this event, but only if it's still a
        // real option — an old value from before types changed (or a
        // different event's saved value, e.g. right after switching events)
        // falls back to "All" rather than silently matching nothing.
        const saved = localStorage.getItem(TYPE_FILTER_KEY_PREFIX + eventId);
        this.selectedType = saved && this.types.includes(saved) ? saved : 'All';
      },
      error: () => {
        this.notificationService.openErrorSnackBar('Error loading tents');
        this.loading = false;
      }
    });
  }

  setTypeFilter(type: string) {
    this.selectedType = type;
    if (this.currentEventId) {
      localStorage.setItem(TYPE_FILTER_KEY_PREFIX + this.currentEventId, type);
    }
  }

  /** Post-action refresh (after edit/delete) — safe to read synchronously
   *  here since the user is already actively on a loaded page by this point,
   *  well past the startup race ngOnInit's subscription guards against. */
  loadTents() {
    const event = this.eventService.currentActiveEvent;
    if (!event) return;
    this.fetchTents(event._id);
  }

  passTypeName(tent: Tent): string {
    return typeof tent.passType === 'string' ? tent.passType : (tent.passType?.name || '');
  }

  get types(): string[] {
    const names = new Set(this.tents.map(t => this.passTypeName(t)).filter(Boolean));
    return ['All', ...Array.from(names).sort()];
  }

  occupantCount(tent: Tent): number {
    return (tent.occupants || []).filter(o => o !== null).length;
  }

  occupantNames(tent: Tent): string {
    const names = (tent.occupants || [])
      .filter((o): o is NonNullable<typeof o> => o !== null && typeof o === 'object')
      .map(o => o.name || '(no name)');
    return names.length ? names.join(', ') : '—';
  }

  /** Enhancement (2026-08-20, follow-up #5) — the full occupant docs for a
   *  tent, filtered down from the raw (nullable) occupants array. Backs the
   *  expanded detail row; occupantNames() above stays as the compact inline
   *  summary. */
  occupantsList(tent: Tent): Shopcart[] {
    return (tent.occupants || []).filter((o): o is Shopcart => o !== null && typeof o === 'object');
  }

  /** Toggles the occupant-detail row for a tent. No-ops on a wholly-vacant
   *  unit — nothing to show, and the template only renders the toggle
   *  affordance when there's at least one occupant anyway. */
  toggleExpand(tent: Tent) {
    if (!tent._id || this.occupantCount(tent) === 0) return;
    this.expandedTentId = this.expandedTentId === tent._id ? null : tent._id;
  }

  /** Enhancement (2026-08-20) — drives both the row background colour and
   *  the new occupancy filter. */
  occupancyStatus(tent: Tent): 'vacant' | 'partial' | 'full' {
    const count = this.occupantCount(tent);
    if (count === 0) return 'vacant';
    return count === tent.capcity ? 'full' : 'partial';
  }

  /** Enhancement (2026-08-20) — new Gender column. '—' when there are no
   *  occupants yet to have a gender; the actual gender label when every
   *  filled slot shares one (e.g. "Male", "Female", or "Prefer not to say");
   *  "Mixed" when they don't. */
  genderComposition(tent: Tent): string {
    const genders = new Set(
      (tent.occupants || [])
        .filter((o): o is NonNullable<typeof o> => o !== null && typeof o === 'object')
        .map(o => o.gender)
        .filter(Boolean)
    );
    if (genders.size === 0) return '—';
    if (genders.size > 1) return 'Mixed';
    const [only] = genders;
    return only!;
  }

  get filteredTents(): Tent[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.tents.filter(tent => {
      if (this.selectedType !== 'All' && this.passTypeName(tent) !== this.selectedType) return false;
      if (this.selectedOccupancy !== 'All' && this.occupancyStatus(tent) !== this.selectedOccupancy.toLowerCase()) return false;
      if (!term) return true;
      const matchesTentNo = tent.tent_no?.toLowerCase().includes(term);
      const matchesOccupant = (tent.occupants || []).some(o => o && typeof o === 'object' && o.name?.toLowerCase().includes(term));
      return !!(matchesTentNo || matchesOccupant);
    }).sort((a, b) => compareTentNo(a.tent_no, b.tent_no));
  }

  startEdit(tent: Tent) {
    this.expandedTentId = null; // avoid an edit row and a detail row open on the same tent at once
    this.editingTentId = tent._id || null;
    this.editForm.setValue({ tent_no: tent.tent_no, capcity: tent.capcity });
  }

  cancelEdit() {
    this.editingTentId = null;
  }

  saveEdit(tent: Tent) {
    if (this.editForm.invalid || !tent._id) return;
    const { tent_no, capcity } = this.editForm.value;
    this.accomodationService.updateTent(tent._id, { tent_no: tent_no!, capcity: capcity! }).subscribe({
      next: () => {
        this.editingTentId = null;
        this.notificationService.openSucessSnackBar('Tent updated');
        this.loadTents();
      },
      error: (err) => this.notificationService.openErrorSnackBar(err?.error?.message || 'Error updating tent')
    });
  }

  deleteTent(tent: Tent) {
    if (!tent._id) return;
    if (!window.confirm(`Delete tent "${tent.tent_no}"?`)) return;
    this.accomodationService.deleteTent(tent._id).subscribe({
      next: () => {
        this.notificationService.openSucessSnackBar('Tent deleted');
        this.loadTents();
      },
      error: (err) => this.notificationService.openErrorSnackBar(err?.error?.message || 'Error deleting tent')
    });
  }
}
