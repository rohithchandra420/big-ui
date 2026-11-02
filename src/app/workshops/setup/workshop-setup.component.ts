import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { EventItem } from '../../models/event.model';
import { WorkshopService } from '../workshop.service';
import { SetupKind, VENUE_DRAFT_KEY, VenueDraft, Workshop, WorkshopCategory, WorkshopSetup, WorkshopVenue } from '../workshops.model';

/**
 * Workshops › Setup (Workshops epic, release 2: W2 venues, W3 workshops and
 * categories), for the event selected in the sidebar. Bookings-style layout:
 * stat tiles switch the list, a table, and a slide-in panel to view / edit / add.
 * Reached by the Plan group only (route guard); the server checks again.
 */
@Component({
  selector: 'app-workshop-setup',
  templateUrl: './workshop-setup.component.html',
  styleUrls: ['./workshop-setup.component.css']
})
export class WorkshopSetupComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  setup: WorkshopSetup | null = null;
  loading = false;
  loadError = '';

  tab: SetupKind = 'venue';
  search = '';

  // Filtered lists — stored, rebuilt on load / search (never built in a getter).
  venues: WorkshopVenue[] = [];
  workshops: Workshop[] = [];
  categories: WorkshopCategory[] = [];

  panelOpen = false;
  panelKind: SetupKind = 'venue';
  panelItem: WorkshopVenue | Workshop | WorkshopCategory | null = null;
  /** A venue form kept while its area was drawn on the Venue Map. */
  panelDraft: VenueDraft | null = null;

  private sub = new Subscription();

  constructor(
    private events: EventService,
    private workshopService: WorkshopService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) {
        this.closePanel();
        this.load();
      }
    }));
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  async load(showId?: string | null) {
    if (!this.event) {
      this.setup = null;
      this.applySearch();
      return;
    }
    this.loading = true;
    this.loadError = '';
    try {
      this.setup = await this.workshopService.getSetup(this.event._id);
      this.applySearch();
      if (showId) this.panelItem = this.findItem(this.panelKind, showId);
      this.restoreVenueDraft();
    } catch {
      this.loadError = 'Could not load the workshop setup.';
    } finally {
      this.loading = false;
    }
  }

  setTab(kind: SetupKind) {
    this.tab = kind;
    this.search = '';
    this.applySearch();
  }

  applySearch() {
    const q = this.search.trim().toLowerCase();
    const has = (...parts: (string | undefined | null)[]) => !q || parts.some(p => (p || '').toLowerCase().includes(q));
    const s = this.setup;
    this.venues = (s?.venues || []).filter(v => has(v.name, v.amenities, v.area?.name));
    this.workshops = (s?.workshops || []).filter(w => has(w.title, w.category?.name, w.language, ...w.facilitators));
    this.categories = (s?.categories || []).filter(c => has(c.name));
  }

  get shownCount(): number {
    return this.tab === 'venue' ? this.venues.length : this.tab === 'workshop' ? this.workshops.length : this.categories.length;
  }

  get totalCount(): number {
    const s = this.setup;
    if (!s) return 0;
    return this.tab === 'venue' ? s.venues.length : this.tab === 'workshop' ? s.workshops.length : s.categories.length;
  }

  /** The Add button: the Workshop TL or above, for every list. */
  get canAdd(): boolean {
    return !!this.setup?.canPlan && !!this.setup.canManage;
  }

  get addLabel(): string {
    return this.tab === 'venue' ? 'Add venue' : this.tab === 'workshop' ? 'Add workshop' : 'Add category';
  }

  get searchPlaceholder(): string {
    return this.tab === 'venue' ? 'Search venue, amenity or area…'
      : this.tab === 'workshop' ? 'Search title, category, facilitator…' : 'Search categories…';
  }

/**
   * Back from the Venue Map (Workshop areas only): reopen the kept venue form,
   * with the area just saved there (?venueArea=) selected.
   */
  private restoreVenueDraft() {
    let draft: VenueDraft | null = null;
    try {
      draft = JSON.parse(sessionStorage.getItem(VENUE_DRAFT_KEY) || 'null');
      sessionStorage.removeItem(VENUE_DRAFT_KEY);
    } catch { draft = null; }
    const savedArea = this.route.snapshot?.queryParamMap?.get('venueArea');
    if (this.route.snapshot?.queryParamMap?.keys?.length) {
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
    if (!draft || !this.event || draft.eventId !== this.event._id) return;
    if (savedArea) draft.values.area = savedArea;
    this.tab = 'venue';
    this.applySearch();
    this.panelKind = 'venue';
    this.panelItem = draft.venueId ? this.findItem('venue', draft.venueId) : null;
    this.panelDraft = draft;
    this.panelOpen = true;
  }

  // ── panel ──────────────────────────────────────────────────

  openItem(kind: SetupKind, item: WorkshopVenue | Workshop | WorkshopCategory) {
    this.panelDraft = null;
    this.panelKind = kind;
    this.panelItem = item;
    this.panelOpen = true;
  }

  openAdd() {
    this.panelDraft = null;
    this.panelKind = this.tab;
    this.panelItem = null;
    this.panelOpen = true;
  }

  closePanel() {
    this.panelOpen = false;
    this.panelItem = null;
    this.panelDraft = null;
  }

  isOpen(id: string): boolean {
    return this.panelOpen && this.panelItem?._id === id;
  }

  /** After add / save / delete in the panel: reload, then show the saved item. */
  onChanged(id: string | null) {
    this.panelDraft = null;
    this.load(id);
  }

  private findItem(kind: SetupKind, id: string) {
    const s = this.setup;
    if (!s) return null;
    const list: { _id: string }[] = kind === 'venue' ? s.venues : kind === 'workshop' ? s.workshops : s.categories;
    return (list.find(x => x._id === id) as any) || null;
  }

  trackId(_: number, x: { _id: string }) { return x._id; }
}
