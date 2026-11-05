// UAT-RESET: remove before Production (whole folder). See UAT_RESET_CONTEXT.md.
import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { EventItem } from '../../models/event.model';
import { UatResetCounts, UatResetGroup, UatResetService } from '../../core/uat-reset.service';

interface GroupTile { key: UatResetGroup; icon: string; title: string; text: string; }

// Fixed list — a constant, never rebuilt in a getter (*ngFor identity rule).
const GROUPS: GroupTile[] = [
  { key: 'bands', icon: 'watch', title: 'Wrist bands', text: 'All band links (participants and staff); every pass back to Not admitted.' },
  { key: 'workshops', icon: 'groups', title: 'Workshop activity', text: 'Lists, waitlists, walk-ins and attendance. Setup is kept.' },
  { key: 'map', icon: 'map', title: 'Venue Map', text: 'All pins and areas, incl. the boundary.' },
  { key: 'hospitality', icon: 'restaurant', title: 'Hospitality activity', text: 'Meals served, day changes and counts, meal passes, stays.' },
  { key: 'attendance', icon: 'how_to_reg', title: 'Staff attendance', text: "Attendance marked on the event's days, for all staff. Other days are kept." },
];

/**
 * Admin › UAT Reset (temporary, testing team request 2026-11-05): clears one
 * event's test data so the same wrist bands can be reused. Developers only;
 * the server answers 404 unless UAT_RESET_ENABLED=true.
 */
@Component({
  selector: 'app-uat-reset',
  templateUrl: './uat-reset.component.html',
  styleUrls: ['./uat-reset.component.css']
})
export class UatResetComponent implements OnInit, OnDestroy {
  readonly groups = GROUPS;
  available: boolean | null = null;
  events: EventItem[] = [];
  eventId: string | null = null;
  counts: UatResetCounts | null = null;
  picked = new Set<UatResetGroup>();
  confirmText = '';
  loading = false;
  resetting = false;
  error = '';
  done: Partial<UatResetCounts> | null = null;

  private sub?: Subscription;

  constructor(private uat: UatResetService, private eventService: EventService) {}

  ngOnInit(): void {
    this.uat.available().subscribe(ok => this.available = ok);
    this.sub = this.eventService.events.subscribe(e => this.events = e);
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  trackEvent = (_: number, e: EventItem) => e._id;
  trackGroup = (_: number, g: GroupTile) => g.key;

  get eventName(): string { return this.events.find(e => e._id === this.eventId)?.name || ''; }

  get canReset(): boolean {
    return !!this.eventId && this.picked.size > 0 && !this.resetting && !!this.counts
      && this.confirmText.trim() === this.eventName.trim() && !!this.eventName;
  }

  pickEvent(id: string | null): void {
    this.eventId = id;
    this.counts = null;
    this.done = null;
    this.confirmText = '';
    this.error = '';
    if (id) this.loadCounts();
  }

  toggle(g: UatResetGroup): void {
    if (this.unavailable(g)) return;
    this.picked.has(g) ? this.picked.delete(g) : this.picked.add(g);
  }

  /** Staff attendance needs the event's dates. */
  unavailable(g: UatResetGroup): boolean {
    return g === 'attendance' && !!this.counts && this.counts.attendance.records === null;
  }

  countText(g: UatResetGroup): string {
    const c = this.counts;
    if (!c) return '…';
    switch (g) {
      case 'bands': return `${c.bands.bands} bands · ${c.bands.admitted} admitted`;
      case 'workshops': return `${c.workshops.entries} list entries`;
      case 'map': return `${c.map.locations} pins · ${c.map.areas} areas`;
      case 'attendance': return c.attendance.records === null ? 'This event has no dates' : `${c.attendance.records} marked slots`;
      default: return `${c.hospitality.mealsServed} served · ${c.hospitality.mealDays} meal days · ${c.hospitality.mealPasses} passes · ${c.hospitality.stays} stays`;
    }
  }

  doneText(g: UatResetGroup): string {
    const d = this.done as any;
    if (!d?.[g]) return '';
    return Object.entries(d[g]).map(([k, v]) => `${v} ${LABELS[k] || k}`).join(' · ');
  }

  reset(): void {
    if (!this.canReset || !this.eventId) return;
    this.resetting = true;
    this.error = '';
    this.uat.reset(this.eventId, GROUPS.filter(g => this.picked.has(g.key)).map(g => g.key), this.confirmText).subscribe({
      next: r => {
        this.done = r.deleted;
        this.resetting = false;
        this.confirmText = '';
        this.picked.clear();
        this.loadCounts();
      },
      error: err => {
        this.resetting = false;
        this.error = err?.error?.message || err?.error?.errors?.[0]?.msg || 'The reset failed.';
      }
    });
  }

  private loadCounts(): void {
    const id = this.eventId!;
    this.loading = true;
    this.uat.preview(id).subscribe({
      next: r => { if (this.eventId === id) { this.counts = r.counts; this.loading = false; } },
      error: () => { this.loading = false; this.error = 'Could not count the data.'; }
    });
  }
}

const LABELS: Record<string, string> = {
  bands: 'bands removed', admitted: 'passes un-admitted', entries: 'list entries removed',
  locations: 'pins removed', areas: 'areas removed', mealsServed: 'meals served removed',
  mealDays: 'meal days removed', mealPasses: 'meal passes removed', stays: 'stays removed',
  records: 'attendance slots removed'
};
