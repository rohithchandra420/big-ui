import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { forkJoin } from 'rxjs';

import {
  BoxOfficeService, SalesSyncCheck, SalesSyncFetch, SalesSyncLogEntry, SalesSyncReport, SalesSyncStatus
} from '../../box-office.service';
import { EventService } from '../../../core/event.service';
import { NotificationService } from '../../../core/notification.service';
import { PassCategory } from '../../../models/ticket.model';
import { MAX_BEDS } from '../bulk-upload/bulk-upload.component';
import { syncAlertText, syncCountsText, syncKindLabel } from './sales-sync.utils';

/** Where a waiting booking was last tried. */
const VIA_LABEL: Record<string, string> = { webhook: 'live update', pull: 'pull', check: 'check', fetch: 'fetch' };

/** What Fetch one booking did, in words. */
const FETCH_TEXT: Record<SalesSyncFetch['result'], string> = {
  created: 'was missing and is now stored',
  updated: 'was updated',
  cancelled: 'is cancelled in the sales system; marked Cancelled here',
  skipped: 'is already up to date',
  error: 'could not be stored',
  unknown: 'needs a pass type this event doesn\'t have'
};

/** A missing pass type, as the person will create it (editable). */
interface PassTypeDraft {
  key: string;
  externalCode: string | null;
  name: string;
  category: PassCategory;
  beds: number;
  bookings: number;
}

interface CategoryOption { value: PassCategory; label: string; }

/** Stored list (stable identities for app-option). */
const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'festival', label: 'Festival Pass' },
  { value: 'tent', label: 'Tent / stay' },
  { value: 'addon', label: 'Add-on' }
];

/**
 * Sales system sync (I3 webhook / I4 pull, BOOKING_INGESTION_CONTEXT.md) in a
 * slide panel from the Bookings Import menu: is this event the one taking
 * the sales system's bookings, are the live updates and the pull set up,
 * "Pull now" (everything paid or changed since the last pull) → report, and
 * the latest webhook calls / pulls. Same people as Bulk Upload. Pass types the
 * bookings need but the event lacks: top roles create them here (pre-filled,
 * editable) and pull again; anyone else is told to ask an admin.
 */
@Component({
  selector: 'app-sales-sync',
  templateUrl: './sales-sync.component.html',
  styleUrls: ['../external-import/external-import.component.css', './sales-sync.component.css']
})
export class SalesSyncComponent implements OnChanges {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  /** Bookings were created / changed (the page reloads its list). */
  @Output() changed = new EventEmitter<void>();

  readonly categoryOptions = CATEGORY_OPTIONS;
  readonly maxBeds = MAX_BEDS;

  loading = false;
  pulling = false;
  creating = false;
  status: SalesSyncStatus | null = null;
  report: SalesSyncReport | null = null;
  pullError: string | null = null;
  drafts: PassTypeDraft[] = [];

  // ── Check & repair (closed until tapped) ──
  repairOpen = false;
  checking = false;
  fetching = false;
  check: SalesSyncCheck | null = null;
  fetched: SalesSyncFetch | null = null;
  fetchRef = '';

  constructor(
    private boxOffice: BoxOfficeService,
    private eventService: EventService,
    private notify: NotificationService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.report = null;
      this.pullError = null;
      this.drafts = [];
      this.repairOpen = false;
      this.check = null;
      this.fetched = null;
      this.fetchRef = '';
      this.load();
    }
  }

  get eventId(): string | null { return this.eventService.currentActiveEvent?._id || null; }
  get eventName(): string { return this.eventService.currentActiveEvent?.name || 'this event'; }
  get busy(): boolean { return this.pulling || this.creating || this.checking || this.fetching; }
  get canFetch(): boolean { return this.canPull && /^[A-Za-z0-9_-]{1,64}$/.test(this.fetchRef.trim()); }
  get canPull(): boolean { return !!this.status?.on && !!this.status?.pullReady && !this.busy; }
  get canCreatePassTypes(): boolean {
    return !!(this.status?.canCreatePassTypes || this.report?.canCreatePassTypes
      || this.check?.canCreatePassTypes || this.fetched?.canCreatePassTypes);
  }
  get draftsValid(): boolean {
    return this.drafts.every(d => d.name.trim() && (d.category !== 'tent' || (d.beds >= 1 && d.beds <= MAX_BEDS)));
  }
  get createLabel(): string {
    if (this.creating) return 'Creating pass types…';
    const n = this.drafts.length;
    return `Create ${n} pass type${n === 1 ? '' : 's'} & pull again`;
  }

  load(): void {
    const id = this.eventId;
    if (!id) { this.status = null; return; }
    this.loading = true;
    this.boxOffice.getSalesSync(id).subscribe({
      next: (s) => {
        this.status = s;
        this.loading = false;
        // No pull / check / fetch on screen: offer the missing pass types of the waiting list.
        if (!this.report && !this.check && !this.fetched && !this.busy) this.draftsFrom(s.missingPassTypes || []);
      },
      error: (err) => {
        this.loading = false;
        this.notify.openErrorSnackBar(err?.error?.message || 'Could not load the sales system status');
      }
    });
  }

  pull(): void {
    const id = this.eventId;
    if (!id || !this.canPull) return;
    this.pulling = true;
    this.pullError = null;
    this.report = null;
    this.check = null;
    this.fetched = null;
    this.drafts = [];
    this.boxOffice.pullSalesSync(id).subscribe({
      next: (r) => {
        this.pulling = false;
        this.showReport(r);
        this.load();
      },
      error: (err) => {
        this.pulling = false;
        this.pullError = err?.error?.message || 'The pull failed';
        // Part of it may have been done before it stopped.
        const partial: SalesSyncReport | null = err?.error?.report || null;
        if (partial) this.showReport(partial);
        this.load();
      }
    });
  }

  /** Check all bookings: every paid booking; missing ones stored; counts compared. */
  runCheck(): void {
    const id = this.eventId;
    if (!id || !this.canPull) return;
    this.checking = true;
    this.check = null;
    this.fetched = null;
    this.boxOffice.checkSalesSync(id).subscribe({
      next: (c) => {
        this.checking = false;
        this.check = c;
        this.showDrafts(c);
        if (c.created || c.updated || c.cancelled) this.changed.emit();
        this.load();
      },
      error: (err) => {
        this.checking = false;
        this.notify.openErrorSnackBar(err?.error?.message || 'The check failed');
        this.load();
      }
    });
  }

  /** Fetch one booking by its Booking ID (any status). */
  fetchOne(): void {
    const id = this.eventId;
    const ref = this.fetchRef.trim();
    if (!id || !this.canFetch) return;
    this.fetching = true;
    this.fetched = null;
    this.check = null;
    this.boxOffice.fetchSalesBooking(id, ref).subscribe({
      next: (f) => {
        this.fetching = false;
        this.fetched = f;
        this.showDrafts(f);
        if (f.created || f.updated || f.cancelled) this.changed.emit();
        this.load();
      },
      error: (err) => {
        this.fetching = false;
        this.notify.openErrorSnackBar(err?.error?.message || 'Could not fetch the booking');
      }
    });
  }

  fetchText(f: SalesSyncFetch): string { return FETCH_TEXT[f.result] || ''; }

  private showReport(r: SalesSyncReport): void {
    this.report = r;
    this.showDrafts(r);
    if (r.created || r.updated || r.cancelled) this.changed.emit();
  }

  /** Missing pass types from a pull / check / fetch, as editable drafts. */
  private showDrafts(r: SalesSyncReport): void {
    this.draftsFrom(r.unknownPassTypes || []);
  }

  private draftsFrom(list: SalesSyncReport['unknownPassTypes']): void {
    // Keep what the person already typed when the same list comes back.
    const typed = new Map(this.drafts.map(d => [d.externalCode || d.name, d]));
    this.drafts = list.map((u, i) => typed.get(u.externalCode || u.name) || ({
      key: (u.externalCode || u.name) + ':' + i,
      externalCode: u.externalCode,
      name: u.name,
      category: u.category,
      beds: u.beds || 1,
      bookings: u.bookings
    }));
    this.drafts.forEach((d, i) => d.bookings = list[i].bookings);
  }

  /** Top roles: creates the missing pass types on this event, then pulls again. */
  createAndPull(): void {
    const id = this.eventId;
    if (!id || !this.canCreatePassTypes || !this.draftsValid || !this.drafts.length || this.busy) return;
    this.creating = true;
    forkJoin(this.drafts.map(d => this.eventService.createPassType(id, {
      name: d.name.trim(),
      category: d.category,
      ...(d.externalCode ? { externalCode: d.externalCode } : {}),
      ...(d.category === 'tent' ? { beds: d.beds } : {})
    }))).subscribe({
      next: () => {
        this.creating = false;
        const n = this.drafts.length;
        this.notify.openSucessSnackBar(`${n} pass type${n === 1 ? '' : 's'} created`);
        this.pull();
      },
      error: (err) => {
        this.creating = false;
        this.notify.openErrorSnackBar(err?.error?.message || 'Error creating pass types');
      }
    });
  }

  setBeds(d: PassTypeDraft, value: unknown): void {
    const n = Math.round(Number(value));
    d.beds = Math.min(MAX_BEDS, Math.max(1, Number.isFinite(n) && n > 0 ? n : 1));
  }

  close(): void { this.closed.emit(); }

  kindLabel(l: SalesSyncLogEntry): string { return syncKindLabel(l); }
  countsText(c: SalesSyncLogEntry['counts']): string { return syncCountsText(c); }
  alertText(l: SalesSyncLogEntry): string { return syncAlertText(l.alert); }
  viaLabel(v: string): string { return VIA_LABEL[v] || v; }

  /** "pass type glamp_dome not on this event" / the reasons. */
  waitingReason(w: { messages: string[]; unknownCodes: string[] }): string {
    if (w.unknownCodes?.length) return `pass type ${w.unknownCodes.join(', ')} not on this event`;
    return w.messages?.join('; ') || 'could not be stored';
  }

  trackLog = (i: number) => i;
  trackWaiting = (_: number, w: { reference: string }) => w.reference;
  trackRef = (_: number, r: string) => r;
  trackDraft = (_: number, d: PassTypeDraft) => d.key;
  trackCategory = (_: number, o: CategoryOption) => o.value;
}
