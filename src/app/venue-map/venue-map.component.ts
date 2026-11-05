import { AfterViewInit, OnInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type * as Leaflet from 'leaflet';
import { Subscription } from 'rxjs';
import { EventService } from '../core/event.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { ConfirmationService } from '../shared/confirm-dialog/confirmation.service';
import { WorkshopService } from '../workshops/workshop.service';
import { WorkshopSchedule, WorkshopSession } from '../workshops/workshops.model';
import { MapStatus as WorkshopMapStatus, localTime, mapStatusOf } from '../workshops/planner.utils';
import { EventItem } from '../models/event.model';
import { LocationService, VenueArea, VenueLocation } from './location.service';
import {
  AREA_KINDS, AreaKind, AreaShape, KmlPoint, KmlShape, LOCATION_TYPES, LatLng, LocationType, allInside, areaInfo, areaWeight, shapeCenter,
  directionsUrl, formatArea, kmlProblem, parseKml, parseKmlShapes, parseLatLng, pointInPolygon, polygonAreaM2,
  streetViewUrl, typeInfo
} from './venue-map.utils';

interface LocationForm {
  _id?: string;
  name: string;
  type: LocationType;
  department: string | null;
  notes: string;
  lat: number;
  lng: number;
}

interface AreaForm {
  _id?: string;
  name: string;
  kind: AreaKind;
  shape: AreaShape;
  department: string | null;
  notes: string;
}

type DrawMode = 'boundary' | 'area' | 'line';

const TILES = {
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
  sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
         attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' }
};
// Before any location exists for an event: show the country, so "Go to" or
// "Use my location" can take it from there.
const START: [number, number] = [20.6, 78.9];
const NO_BOUNDARY = 'Ask an admin to draw the festival boundary first';
/** Folded side panel sections (per viewer, this browser). */
const FOLD_KEY = 'venueMapFolded';

/** One session in a Workshop area's timeline. */
interface TimelineItem {
  session: WorkshopSession;
  when: 'now' | 'next' | 'past';
  day: string;
  time: string;
  numbers: string;
  colour: string;
}

/** Responsible department for a Workshop area drawn from Workshops › Setup (user decision 2026-11-03). */
const WORKSHOP_AREA_DEPTS = ['workshop', 'general'];

/**
 * Venue Map (VENUE_MAP_AND_TENT_FIELDS_CONTEXT.md): places (A1), and areas and
 * lines (A2) on the festival ground for the active event. Leaflet and the
 * Leaflet-Geoman drawing tools are loaded only when this page opens (dynamic
 * import), so they never weigh on the rest of the app. Who may add / change
 * what is decided by the server (canAdd / canDraw / canDrawBoundary / canEdit /
 * canImport); the boundary check for Team Leads is repeated here only to give
 * a friendlier message before saving.
 */
@Component({
  selector: 'app-venue-map',
  templateUrl: './venue-map.component.html',
  styleUrls: ['./venue-map.component.css']
})
export class VenueMapComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;
  readonly TYPES = LOCATION_TYPES;
  readonly POLYGON_KINDS = AREA_KINDS.filter(k => k.shape === 'polygon' && k.value !== 'boundary');
  readonly LINE_KINDS = AREA_KINDS.filter(k => k.shape === 'line');
  readonly typeInfo = typeInfo;
  readonly areaInfo = areaInfo;
  readonly directionsUrl = directionsUrl;
  readonly streetViewUrl = streetViewUrl;

  event: EventItem | null = null;
  locations: VenueLocation[] = [];
  visible: VenueLocation[] = [];
  areas: VenueArea[] = [];
  canAdd = false;
  canImport = false;
  canDraw = false;
  canDrawBoundary = false;
  departments: { _id: string; name: string; key?: string }[] = [];
  loading = true;
  loadError = '';
  mapError = '';

  layerName: 'street' | 'sat' = 'sat';
  typeFilter = new Set<LocationType>(LOCATION_TYPES.map(t => t.value));
  showAreas = true;
  selected: VenueLocation | null = null;
  selectedArea: VenueArea | null = null;
  form: LocationForm | null = null;
  areaForm: AreaForm | null = null;
  drawing: DrawMode | null = null;
  /**
   * Pins can't be dragged while locked (user, 2026-11-07: a pin moved by
   * accident while scrolling on a phone). Locked every time the map opens.
   */
  locked = true;
  /** Points placed so far in the shape being drawn (for Undo). */
  drawPoints = 0;
  formError = '';
  saving = false;
  adding = false;
  accuracy: number | null = null;
  imports: (KmlPoint & { include: boolean })[] | null = null;
  importShapes: (KmlShape & { include: boolean })[] = [];
  gotoText = '';
  /** Per location: zones it's in, and whether it's outside the festival boundary. */
  locInfo = new Map<string, { zones: string[]; outside: boolean }>();
  /** Middle of each area / line (Directions, Street View, the icon on the map). */
  areaCenter = new Map<string, LatLng>();
  /** Kind icons drawn in the middle of each area (not the boundary). */
  private areaIcons: Leaflet.Marker[] = [];
  /**
   * Workshops (W8): the event's schedule (everyone signed in can see it), kept
   * up to date every minute. It gives each Workshop area its live count and
   * the timeline shown when the area is selected.
   */
  private workshopSchedule: WorkshopSchedule | null = null;
  /**
   * Per Workshop area (by area id): the ONE status shown on its badge and tooltip
   * (2026-11-04) — the session at the top of its pipeline today: the one running
   * now, otherwise the next one (registration, door for the list, open to all…).
   */
  workshopStatus = new Map<string, WorkshopMapStatus>();
  /** Timeline of the selected Workshop area: on now, upcoming, then past. Stored for the *ngFor. */
  timeline: TimelineItem[] = [];
  /** The selected area is a Workshop area with at least one workshop venue on it. */
  areaHasVenue = false;
  /** Side panel sections the viewer folded away (kept in this browser). */
  folded = new Set<string>(this.readFolded());
  private liveTimer?: ReturnType<typeof setInterval>;
  /** Live statuses from GET /map/status (Hospitality H3: the Mess Hall), by area id. */
  statusByArea = new Map<string, { kind: string; open: boolean; label: string }>();
  /** Live statuses of pins from GET /map/status (the Box Office), by location id. */
  statusByLocation = new Map<string, { kind: string; open: boolean; label: string }>();
  /**
   * A touch screen: hover tooltips close straight after a tap there, so the
   * same one-line info opens as a small popup on tap instead (2026-11-04).
   */
  private readonly touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  /** Per area: its size, for polygons. */
  areaSize = new Map<string, string>();

  private L?: typeof Leaflet;
  private map?: Leaflet.Map;
  private resizeObs?: ResizeObserver;
  private tiles: Partial<Record<'street' | 'sat', Leaflet.TileLayer>> = {};
  private markers: Leaflet.Marker[] = [];
  private areaLayers = new Map<string, Leaflet.Polyline<any>>();
  private draftMarker?: Leaflet.Marker;
  /** The shape being drawn or edited (Geoman editing is on for it). */
  private shapeLayer?: Leaflet.Polyline<any>;
  private shapeIsNew = false;
  private fittedFor = '';
  private wantBoundary = false;
  /** ?area=<id> (Workshops › Setup "Show on map"): select that area once loaded. */
  private wantArea: string | null = null;
  /**
   * ?focus=workshop (Workshops › Setup, from a venue form): Workshop areas only.
   * Only they can be drawn, changed or removed; everything else is view-only.
   * Saving one returns to Workshop Setup with it selected (user decision 2026-11-03).
   */
  workshopMode = false;
  private wantDrawNew = false;
  private wantEdit = false;
  private subs = new Subscription();

  constructor(
    private locationService: LocationService,
    private eventService: EventService,
    private auth: AuthService,
    private confirm: ConfirmationService,
    private snack: NotificationService,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router,
    private workshops: WorkshopService
  ) {}

  get isTL(): boolean { return this.auth.currentUser?.role === 'TL'; }
  get includedImports(): number {
    return (this.imports?.filter(i => i.include).length ?? 0) + this.importShapes.filter(s => s.include).length;
  }
  get boundary(): VenueArea | undefined { return this.areas.find(a => a.kind === 'boundary'); }
  get busy(): boolean { return !!(this.form || this.areaForm || this.imports || this.drawing); }

  /** Read before the first render, so the Workshop-mode banner and tools show straight away. */
  ngOnInit(): void {
    const qp = this.route.snapshot?.queryParamMap;
    this.workshopMode = qp?.get('focus') === 'workshop';
    this.wantDrawNew = this.workshopMode && qp?.get('draw') === 'new';
    this.wantEdit = this.workshopMode && qp?.get('edit') === '1';
  }

  async ngAfterViewInit(): Promise<void> {
    // From Admin › Events › "Draw / edit on Venue Map": open ready for the boundary.
    this.wantBoundary = this.route.snapshot?.queryParamMap?.get('draw') === 'boundary';
    this.wantArea = this.route.snapshot?.queryParamMap?.get('area') || null;
    try {
      await this.initMap();
    } catch {
      this.mapError = 'The map could not be loaded. Check your connection and reload the page.';
    }
    this.subs.add(this.eventService.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) {
        this.closePanels(); this.fittedFor = ''; this.workshopSchedule = null;
        this.workshopStatus = new Map(); this.statusByArea = new Map(); this.statusByLocation = new Map();
      }
      this.load();
      this.loadWorkshops();
      this.loadStatus();
    }));
    // Once a minute while the page is visible: workshop live counts + the map status call.
    this.liveTimer = setInterval(() => { this.loadWorkshops(); this.loadStatus(); }, 60000);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.liveTimer) clearInterval(this.liveTimer);
    this.resizeObs?.disconnect();
    this.map?.remove();
  }

  // ── Leaflet ────────────────────────────────────────────────────────

  /** Loads Leaflet + Geoman (stylesheets and code) on first use and creates the map. */
  protected async initMap(): Promise<void> {
    await Promise.all([
      this.loadCss('leaflet-css', 'assets/leaflet/leaflet.css'),
      this.loadCss('geoman-css', 'assets/leaflet/leaflet-geoman.css')
    ]);
    const mod: any = await import('leaflet');
    const L: typeof Leaflet = mod.default ?? mod;
    // Geoman attaches itself to the global Leaflet object, so it must load after it.
    (window as any).L = L;
    await import('@geoman-io/leaflet-geoman-free');
    this.L = L;
    this.zone.runOutsideAngular(() => {
      const map = L.map(this.mapEl.nativeElement, { zoomControl: true }).setView(START, 5);
      for (const k of ['street', 'sat'] as const) {
        // keepBuffer: also load a wider ring of tiles around the view, so panning on a slow connection shows fewer gaps
        this.tiles[k] = L.tileLayer(TILES[k].url, { maxZoom: 19, attribution: TILES[k].attribution, keepBuffer: 4 });
      }
      this.tiles[this.layerName]!.addTo(map);
      setTimeout(() => map.invalidateSize());   // measure again once the page layout has settled
      map.on('click', (e: Leaflet.LeafletMouseEvent) => this.zone.run(() => this.onMapClick(e.latlng.lat, e.latlng.lng)));
      const pm = (map as any).pm;
      pm.setGlobalOptions({ allowSelfIntersection: false, snappable: true });
      map.on('pm:create', (e: any) => this.zone.run(() => this.onDrawn(e.layer)));
      this.map = map;
      // The map box grows / shrinks when hint bars show (desktop layout fits the screen): re-measure
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObs = new ResizeObserver(() => map.invalidateSize());
        this.resizeObs.observe(this.mapEl.nativeElement);
      }
    });
  }

  /** A stylesheet copied to assets by angular.json. Without Leaflet's the tiles land in the wrong places. */
  private loadCss(id: string, href: string): Promise<void> {
    if (document.getElementById(id)) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => { link.remove(); reject(new Error(href)); };
      document.head.appendChild(link);
      setTimeout(resolve, 5000);   // slow network: carry on rather than block the page
    });
  }

  private pin(type: string, isSel = false, draft = false, status?: { open: boolean }): Leaflet.DivIcon {
    const t = typeInfo(type);
    return this.L!.divIcon({
      className: 'vm-pin-wrap', iconSize: [34, 34], iconAnchor: [17, 34], tooltipAnchor: [0, -30], popupAnchor: [0, -30],
      html: `<div class="vm-pin${isSel ? ' sel' : ''}${draft ? ' draft' : ''}" style="background:${t.color}">` +
            `<span class="material-symbols-rounded">${draft ? 'add_location' : t.icon}</span>` +
            (status ? `<i class="vm-status${status.open ? ' open' : ''}"></i>` : '') + '</div>'
    });
  }

  /** The one-line info of a pin or area: a hover tooltip, or on touch screens a popup opened by a tap. */
  private bindInfo(layer: Leaflet.Layer, html: string, sticky = false): void {
    if (this.touch) layer.bindPopup(html, { closeButton: false, autoPan: true, className: 'vm-info-pop', offset: [0, sticky ? 0 : 4] });
    else layer.bindTooltip(html, { direction: 'top', sticky });
  }

  private drawMarkers(): void {
    if (!this.map || !this.L) return;
    const L = this.L;
    this.markers.forEach(m => m.remove());
    this.markers = this.visible.map(loc => {
      const editingThis = this.form?._id === loc._id;
      const st = this.statusByLocation.get(loc._id);
      const m = L.marker([loc.lat, loc.lng], {
        icon: this.pin(loc.type, this.selected?._id === loc._id || editingThis, false, st),
        draggable: this.canDragPin(loc), title: loc.name, keyboard: true
      });
      const outside = this.locInfo.get(loc._id)?.outside ? '<br><i>Outside the festival boundary</i>' : '';
      // One status line: the pin's live status (Box Office), otherwise its type.
      this.bindInfo(m, `<b>${escapeHtml(loc.name)}</b><br>${st ? escapeHtml(st.label) : typeInfo(loc.type).label}${outside}`);
      m.on('click', () => this.zone.run(() => this.select(loc)));
      m.on('dragend', () => this.zone.run(() => { const p = m.getLatLng(); this.onDragEnd(loc, p.lat, p.lng); }));
      return m.addTo(this.map!);
    });
  }

  private drawAreas(): void {
    if (!this.map || !this.L) return;
    const L = this.L;
    this.areaLayers.forEach(l => l.remove());
    this.areaLayers.clear();
    this.areaIcons.forEach(m => m.remove());
    this.areaIcons = [];
    for (const a of this.areas) {
      if (!this.showAreas && a.kind !== 'boundary') continue;
      if (this.areaForm?._id === a._id) continue;   // being edited: shapeLayer stands in for it
      const info = areaInfo(a.kind), sel = this.selectedArea?._id === a._id;
      const weight = areaWeight(a.kind) + (sel ? 2 : 0);
      const style: Leaflet.PolylineOptions = a.kind === 'boundary'
        ? { color: info.color, weight, dashArray: '10 6', fill: false }
        : a.shape === 'polygon'
          ? { color: info.color, weight, fillOpacity: sel ? 0.3 : 0.15 }
          : { color: info.color, weight, dashArray: a.kind === 'emergency' ? '8 6' : undefined };
      const layer = a.shape === 'polygon' ? L.polygon(a.points, style) : L.polyline(a.points, style);
      (layer as any).pm?.setOptions?.({ allowEditing: false });
      this.bindInfo(layer, this.areaInfoHtml(a), true);
      layer.on('click', (e: any) => { L.DomEvent.stopPropagation(e); this.zone.run(() => this.selectArea(a)); });
      layer.addTo(this.map);
      this.areaLayers.set(a._id, layer);
      if (a.shape === 'polygon' && a.kind !== 'boundary') this.areaIcons.push(this.areaIcon(a, sel));
    }
    this.areaLayers.forEach((l, id) => { if (this.areas.find(a => a._id === id)?.kind !== 'boundary') l.bringToFront(); });
  }

  /** A round badge with the kind's icon in the middle of an area; tapping it selects the area. */
  private areaIcon(a: VenueArea, sel: boolean): Leaflet.Marker {
    const L = this.L!, info = areaInfo(a.kind);
    const m = L.marker(this.areaCenter.get(a._id) ?? shapeCenter(a.points, a.shape), {
      icon: L.divIcon({
        className: 'vm-pin-wrap', iconSize: [28, 28], iconAnchor: [14, 14],
        html: `<div class="vm-area-ic${sel ? ' sel' : ''}" style="background:${info.color}">` +
              `<span class="material-symbols-rounded">${info.icon}</span>` + this.liveBadge(a) + '</div>'
      }),
      title: a.name, keyboard: false, zIndexOffset: -500   // below location pins
    });
    this.bindInfo(m, this.areaInfoHtml(a));
    m.on('click', () => this.zone.run(() => this.selectArea(a)));
    return m.addTo(this.map!);
  }

  /**
   * An area's tooltip / popup, 2–3 short lines: its name, then ONE status — a
   * Workshop area's top session (the same pulsing badge + its title, then the
   * status), the Mess Hall's status, or else its kind.
   */
  private areaInfoHtml(a: VenueArea): string {
    const name = `<b>${escapeHtml(a.name)}</b>`;
    const w = this.workshopStatus.get(a._id);
    if (w && !this.statusByArea.has(a._id)) {
      const title = w.line.slice(0, w.line.length - w.text.length - 2);   // line = "<title>: <text>"
      // A dot in the state's colour, pulsing until the session ends.
      const dot = `<i class="vm-dot k-${w.kind}${w.kind === 'ended' || w.kind === 'cancelled' ? '' : ' pulse'}"></i>`;
      return `<div class="vm-tip">${name}<div class="vm-tip-row">${dot}<span>${escapeHtml(title)}</span></div>` +
        `<div class="vm-tip-sub">${escapeHtml(w.text)}</div></div>`;
    }
    const line = this.statusByArea.get(a._id)?.label ??
      (a.kind === 'workshop_area' && this.areaHasSessions(a) ? 'No session running' : areaInfo(a.kind).label);
    return `${name}<br>${escapeHtml(line)}`;
  }

  private areaHasSessions(a: VenueArea): boolean {
    const sc = this.workshopSchedule;
    return !!sc && sc.venues.some(v => v.area === a._id);
  }

  private placeDraft(lat: number, lng: number): void {
    if (!this.map || !this.L) return;
    this.draftMarker?.remove();
    const m = this.L.marker([lat, lng], { icon: this.pin(this.form?.type || 'other', true, true), draggable: true });
    m.on('dragend', () => this.zone.run(() => { const p = m.getLatLng(); if (this.form) { this.form.lat = p.lat; this.form.lng = p.lng; } }));
    this.draftMarker = m.addTo(this.map);
  }

  private fitToContent(): void {
    if (!this.map || !this.L) return;
    const pts: LatLng[] = [...this.locations.map(l => [l.lat, l.lng] as LatLng), ...this.areas.flatMap(a => a.points)];
    if (!pts.length) return;
    this.map.fitBounds(this.L.latLngBounds(pts).pad(0.2), { maxZoom: 18 });
  }

  private fitTo(points: LatLng[]): void {
    if (this.map && this.L && points.length) this.map.fitBounds(this.L.latLngBounds(points).pad(0.3), { maxZoom: 19 });
  }

  /** Anything on the map this person may move (shows the lock button). */
  get canMovePins(): boolean {
    return this.locations.some(l => l.canEdit);
  }

  /**
   * Locked (the default) = no accidental moves while scrolling on a phone;
   * the pin being edited in the form can still be moved.
   */
  canDragPin(loc: VenueLocation): boolean {
    return loc.canEdit && !this.drawing && (!this.locked || this.form?._id === loc._id);
  }

  toggleLock(): void {
    this.locked = !this.locked;
    this.drawMarkers();
  }

  setLayer(name: 'street' | 'sat'): void {
    if (name === this.layerName) return;
    if (this.map) { this.tiles[this.layerName]?.remove(); this.tiles[name]?.addTo(this.map); }
    this.layerName = name;
  }

  // ── workshops on the map (W8) ──────────────────────────────────────

  /** The schedule, for live counts and area timelines. Quietly skipped on failure (keeps the last one). */
  async loadWorkshops(): Promise<void> {
    if (!this.event || document.hidden) return;
    try {
      this.workshopSchedule = await this.workshops.getSchedule(this.event._id);
      this.refreshWorkshops();
    } catch { /* keep the last figures */ }
  }

  @HostListener('document:visibilitychange')
  onVisible(): void {
    if (!document.hidden) { this.loadWorkshops(); this.loadStatus(); }
  }

  /** GET /map/status — redraws the badges / pins only when a status changed. Quietly keeps the last one on failure. */
  async loadStatus(): Promise<void> {
    if (!this.event || document.hidden) return;
    try {
      const res = await this.locationService.status(this.event._id);
      const areas = new Map(Object.entries(res.areas || {}));
      const locations = new Map(Object.entries(res.locations || {}));
      const areasChanged = !sameStatuses(areas, this.statusByArea);
      const pinsChanged = !sameStatuses(locations, this.statusByLocation);
      this.statusByArea = areas;
      this.statusByLocation = locations;
      if (this.map && areasChanged) this.drawAreas();
      if (this.map && pinsChanged) this.drawMarkers();
    } catch { /* keep the last status */ }
  }

  /**
   * Each Workshop area's one status: of today's scheduled sessions in its
   * venues that haven't ended, the one running now, otherwise the next to start.
   * Then the selected area's timeline.
   */
  private refreshWorkshops(): void {
    const sc = this.workshopSchedule;
    const now = new Date();
    const today = now.toDateString();
    const top = new Map<string, WorkshopSession>();
    if (sc) {
      const areaOf = new Map(sc.venues.map(v => [v._id, v.area || null]));
      for (const s of sc.sessions) {
        const area = areaOf.get(s.venue?._id);
        if (!area || s.status !== 'scheduled' || new Date(s.end) <= now) continue;
        // Upcoming: today only. Running now: always (it may have started before midnight).
        if (new Date(s.start) > now && new Date(s.start).toDateString() !== today) continue;
        const cur = top.get(area);
        if (!cur || new Date(s.start) < new Date(cur.start)) top.set(area, s);
      }
    }
    this.workshopStatus = new Map([...top].map(([area, s]) => [area, mapStatusOf(s, now)]));
    this.buildTimeline();
    if (this.map) this.drawAreas();
  }

  /** The selected Workshop area's sessions: on now, then upcoming (soonest first), then past (latest first). */
  private buildTimeline(): void {
    const a = this.selectedArea;
    const sc = this.workshopSchedule;
    this.areaHasVenue = false;
    this.timeline = [];
    if (!a || a.kind !== 'workshop_area' || !sc) return;
    const venues = new Set(sc.venues.filter(v => v.area === a._id).map(v => v._id));
    this.areaHasVenue = venues.size > 0;
    const now = Date.now();
    const items = sc.sessions.filter(s => venues.has(s.venue?._id)).map(s => this.timelineItem(s, now));
    const t = (x: TimelineItem) => new Date(x.session.start).getTime();
    this.timeline = [
      ...items.filter(i => i.when === 'now').sort((x, y) => t(x) - t(y)),
      ...items.filter(i => i.when === 'next').sort((x, y) => t(x) - t(y)),
      ...items.filter(i => i.when === 'past').sort((x, y) => t(y) - t(x))
    ];
  }

  private timelineItem(s: WorkshopSession, now: number): TimelineItem {
    const start = new Date(s.start), end = new Date(s.end);
    const when: TimelineItem['when'] = end.getTime() <= now ? 'past' : start.getTime() <= now ? 'now' : 'next';
    // The same status line as the map's badge and tooltip (registration, door, numbers).
    const st = mapStatusOf(s, new Date(now));
    const numbers = s.status === 'cancelled' ? 'Cancelled' : when === 'past' ? `${s.counts?.attended || 0} attended`
      : st.text.charAt(0).toUpperCase() + st.text.slice(1);
    return {
      session: s, when, numbers,
      day: start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
      time: `${localTime(start)}–${localTime(end)}`,
      colour: s.workshop?.category?.colour || '#475569'
    };
  }

  /**
   * Under an area's icon: the Mess Hall's open / closed dot, or a Workshop
   * area's one status ('12/30' pulsing while registration is open, 'Waitlist 5',
   * '9/30 in', red 'Closed' when staff closed the door…).
   */
  private liveBadge(a: VenueArea): string {
    const st = this.statusByArea.get(a._id);
    if (st) return `<i class="vm-status${st.open ? ' open' : ''}"></i>`;
    const w = this.workshopStatus.get(a._id);
    return w ? statusBadge(w) : '';
  }

  // ── folding the side sections ──────────────────────────────────────

  toggleFold(section: string): void {
    this.folded.has(section) ? this.folded.delete(section) : this.folded.add(section);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...this.folded])); } catch { /* private mode */ }
  }

  private readFolded(): string[] {
    try { return JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'); } catch { return []; }
  }

  trackTimeline(_: number, i: TimelineItem) { return i.session._id; }

  // ── data ───────────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (!this.event) { this.locations = []; this.areas = []; this.refreshVisible(); this.loading = false; return; }
    const eventId = this.event._id;
    this.loading = true;
    this.loadError = '';
    try {
      const [res, areaRes] = await Promise.all([this.locationService.list(eventId), this.locationService.listAreas(eventId)]);
      if (this.event?._id !== eventId) return;
      this.locations = res.locations;
      this.areas = areaRes.areas;
      this.canAdd = res.canAdd;
      this.canImport = res.canImport;
      this.canDraw = areaRes.canDraw;
      this.canDrawBoundary = areaRes.canDrawBoundary;
      if ((this.canAdd || this.canDraw) && !this.departments.length) {
        this.departments = (await this.locationService.myDepartments()).filter(d => d._id !== 'ALL');
      }
      if (this.selected) this.selected = this.locations.find(l => l._id === this.selected!._id) || null;
      if (this.selectedArea) this.selectedArea = this.areas.find(a => a._id === this.selectedArea!._id) || null;
      this.refreshVisible();
      if (this.fittedFor !== eventId) { this.fittedFor = eventId; this.fitToContent(); }
      if (this.wantBoundary) this.openBoundary();
      if (this.wantArea) this.openArea(this.wantArea);
      if (this.wantDrawNew) this.openDrawNew();
    } catch {
      this.loadError = 'Could not load the venue map.';
    } finally {
      this.loading = false;
    }
  }

  private refreshVisible(): void {
    this.visible = this.locations.filter(l => this.typeFilter.has(l.type));
    const boundary = this.boundary;
    const zones = this.areas.filter(a => a.shape === 'polygon' && a.kind !== 'boundary');
    this.locInfo = new Map(this.locations.map(l => {
      const p: LatLng = [l.lat, l.lng];
      return [l._id, { zones: zones.filter(z => pointInPolygon(p, z.points)).map(z => z.name),
                       outside: !!boundary && !pointInPolygon(p, boundary.points) }];
    }));
    this.areaCenter = new Map(this.areas.map(a => [a._id, shapeCenter(a.points, a.shape)]));
    this.areaSize = new Map(this.areas.filter(a => a.shape === 'polygon').map(a => [a._id, formatArea(polygonAreaM2(a.points))]));
    this.drawAreas();
    this.drawMarkers();
  }

  toggleType(t: LocationType): void {
    this.typeFilter.has(t) ? this.typeFilter.delete(t) : this.typeFilter.add(t);
    this.refreshVisible();
  }

  toggleAreas(): void {
    this.showAreas = !this.showAreas;
    this.drawAreas();
  }

  countOf(t: LocationType): number {
    return this.locations.filter(l => l.type === t).length;
  }

  /** Admin › Events link (?draw=boundary): start drawing it, or show the one that exists. */
  private openBoundary(): void {
    this.wantBoundary = false;
    this.router.navigate([], { relativeTo: this.route, queryParams: { draw: null }, queryParamsHandling: 'merge', replaceUrl: true });
    const b = this.boundary;
    if (b) { this.selectArea(b); this.fitTo(b.points); }
    else if (this.canDrawBoundary) this.startDraw('boundary');
  }

  /** ?area=<id>: show that area (if it is in this event), then drop the param. */
  private openArea(id: string): void {
    this.wantArea = null;
    this.router.navigate([], { relativeTo: this.route, queryParams: { area: null, edit: null }, queryParamsHandling: 'merge', replaceUrl: true });
    const a = this.areas.find(x => x._id === id);
    if (a) { this.selectArea(a); this.fitTo(a.points); }
    // From a venue form's "Change this area on the map": go straight to editing it.
    if (a && this.wantEdit && this.canChangeArea(a)) this.startEditArea(a);
    this.wantEdit = false;
  }

  /** From a venue form's "Draw a new Workshop area": start drawing once the map is ready. */
  private openDrawNew(): void {
    this.wantDrawNew = false;
    this.router.navigate([], { relativeTo: this.route, queryParams: { draw: null }, queryParamsHandling: 'merge', replaceUrl: true });
    if (this.canDraw) this.startDraw('area');
  }

  /** Edit / delete an area: the server's canEdit, and in Workshop mode only Workshop areas. */
  canChangeArea(a: VenueArea): boolean {
    return a.canEdit && (!this.workshopMode || a.kind === 'workshop_area');
  }

  /** Back to Workshop Setup (Workshop mode); the kept venue form reopens there. */
  backToWorkshops(areaId?: string): void {
    this.router.navigate(['/workshops/setup'], { queryParams: areaId ? { venueArea: areaId } : {} });
  }

  // ── selecting / adding / editing locations ─────────────────────────

  select(loc: VenueLocation, fly = false): void {
    if (this.busy) return;
    this.selected = loc;
    this.selectedArea = null;
    this.drawAreas();
    this.drawMarkers();
    if (fly && this.map) { this.map.flyTo([loc.lat, loc.lng], Math.max(this.map.getZoom(), 18)); this.scrollToMap(); }
  }

  /** Phones (stacked layout): the list is below the map, so bring the map back into view. */
  private scrollToMap(): void {
    if (window.matchMedia('(max-width: 900px)').matches) this.mapEl?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  closePanels(): void {
    this.selected = null;
    this.selectedArea = null;
    this.form = null;
    this.areaForm = null;
    this.imports = null;
    this.importShapes = [];
    this.adding = false;
    this.accuracy = null;
    this.formError = '';
    this.draftMarker?.remove();
    this.draftMarker = undefined;
    this.stopShapeEditing();
    this.drawAreas();
    this.drawMarkers();
  }

  toggleAdding(): void {
    const on = !this.adding;
    this.closePanels();
    this.adding = on;
  }

  onMapClick(lat: number, lng: number): void {
    if (this.adding) this.startNew(lat, lng);
  }

  /** Departments offered in the area form. Workshop mode: only Workshop and General (by fixed key). */
  get areaDepartments(): { _id: string; name: string; key?: string }[] {
    if (!this.workshopMode) return this.departments;
    return this.departments.filter(d => WORKSHOP_AREA_DEPTS.includes(this.auth.deptKeyOf(d)));
  }

  private defaultDepartment(): string | null {
    // Workshop mode: the Workshop department first.
    if (this.workshopMode) {
      const list = this.areaDepartments;
      return (list.find(d => this.auth.deptKeyOf(d) === 'workshop') ?? list[0])?._id ?? null;
    }
    if (!this.isTL) return null;
    const home = this.auth.currentUser?.departments?.[0]?.department?._id;
    return this.departments.find(d => d._id === home)?._id ?? this.departments[0]?._id ?? null;
  }

  startNew(lat: number, lng: number): void {
    this.adding = false;
    this.selected = null;
    this.formError = '';
    this.form = { name: '', type: 'other', department: this.defaultDepartment(), notes: '', lat, lng };
    this.placeDraft(lat, lng);
    this.drawMarkers();
  }

  startEdit(loc: VenueLocation): void {
    this.selected = null;
    this.formError = '';
    this.form = { _id: loc._id, name: loc.name, type: loc.type, department: loc.department?._id ?? null,
                  notes: loc.notes || '', lat: loc.lat, lng: loc.lng };
    this.drawMarkers();
  }

  onFormTypeChange(): void {
    if (this.form && !this.form._id && this.draftMarker) this.draftMarker.setIcon(this.pin(this.form.type, true, true));
  }

  useMyLocation(): void {
    if (!navigator.geolocation) { this.snack.openErrorSnackBar('This browser cannot share its location'); return; }
    navigator.geolocation.getCurrentPosition(pos => this.zone.run(() => {
      const { latitude, longitude, accuracy } = pos.coords;
      this.map?.flyTo([latitude, longitude], 18);
      this.startNew(latitude, longitude);
      this.accuracy = Math.round(accuracy);
    }), err => this.zone.run(() => this.snack.openErrorSnackBar('Location not available: ' + err.message)),
    { enableHighAccuracy: true, timeout: 15000 });
  }

  async save(): Promise<void> {
    const f = this.form;
    if (!f || !this.event || this.saving) return;
    const name = f.name.trim();
    if (!name) { this.formError = 'Give the location a name'; return; }
    if (this.isTL && !f.department) { this.formError = 'Pick your department'; return; }
    this.saving = true;
    this.formError = '';
    const input = { name, type: f.type, lat: f.lat, lng: f.lng, department: f.department, notes: f.notes.trim() };
    try {
      const saved = f._id
        ? await this.locationService.update(f._id, input)
        : await this.locationService.create(this.event._id, input);
      this.snack.openSucessSnackBar(f._id ? 'Location saved' : `${saved.name} added`);
      this.closePanels();
      await this.load();
      this.select(this.locations.find(l => l._id === saved._id) || saved);
    } catch (err: any) {
      this.formError = err?.error?.message || 'Could not save the location';
    } finally {
      this.saving = false;
    }
  }

  async onDragEnd(loc: VenueLocation, lat: number, lng: number): Promise<void> {
    if (this.form?._id === loc._id) { this.form.lat = lat; this.form.lng = lng; return; }
    try {
      await this.locationService.update(loc._id, { lat, lng });
      loc.lat = lat; loc.lng = lng;
      this.snack.openSucessSnackBar(`${loc.name} moved`);
      this.refreshVisible();
    } catch (err: any) {
      this.snack.openErrorSnackBar(err?.error?.message || 'Could not move the location');
      this.drawMarkers();   // put the pin back
    }
  }

  remove(loc: VenueLocation): void {
    this.confirm.confirm({
      title: 'Delete location?',
      message: `"${loc.name}" will be removed from the Venue Map.`,
      confirmText: 'Delete', danger: true
    }).subscribe(async ok => {
      if (!ok) return;
      try {
        await this.locationService.remove(loc._id);
        this.snack.openSucessSnackBar('Location deleted');
        this.closePanels();
        await this.load();
      } catch (err: any) {
        this.snack.openErrorSnackBar(err?.error?.message || 'Could not delete the location');
      }
    });
  }

  goTo(): void {
    const ll = parseLatLng(this.gotoText);
    if (!ll) { this.snack.openErrorSnackBar('Paste coordinates like 12.9763, 77.5929'); return; }
    this.map?.flyTo(ll, 17);
  }

  // ── areas and lines (A2) ───────────────────────────────────────────

  selectArea(a: VenueArea): void {
    if (this.busy) return;
    this.selectedArea = a;
    this.selected = null;
    this.buildTimeline();
    this.drawAreas();
    this.drawMarkers();
  }

  showArea(a: VenueArea): void {
    this.selectArea(a);
    this.fitTo(a.points);
    this.scrollToMap();
  }

  /** Starts Geoman drawing. Team Leads need an existing boundary (they draw inside it). */
  startDraw(mode: DrawMode): void {
    if (mode !== 'boundary' && this.isTL && !this.boundary) { this.snack.openErrorSnackBar(NO_BOUNDARY); return; }
    if (mode === 'boundary' && this.boundary) { this.snack.openErrorSnackBar('This event already has a festival boundary — edit that one'); return; }
    this.closePanels();
    this.drawing = mode;
    const color = mode === 'boundary' ? areaInfo('boundary').color : mode === 'line' ? areaInfo('path').color : areaInfo('workshop_area').color;
    this.drawPoints = 0;
    const map: any = this.map;
    if (!map) return;
    // Geoman fires drawstart inside enableDraw: count the points as they are added / undone
    map.once('pm:drawstart', (e: any) => e.workingLayer?.on('pm:vertexadded pm:vertexremoved', () =>
      this.zone.run(() => { this.drawPoints = this.drawHandler()?._markers?.length ?? 0; })));
    map.pm.enableDraw(mode === 'line' ? 'Line' : 'Polygon', { pathOptions: { color }, templineStyle: { color }, hintlineStyle: { color, dashArray: '5 5' } });
  }

  private drawHandler(): any {
    const draw = (this.map as any)?.pm?.Draw;
    return this.drawing === 'line' ? draw?.Line : draw?.Polygon;
  }

  /** Removes the last point placed while drawing. Geoman would stop drawing if the only point went, so keep at least one. */
  undoPoint(): void {
    const h = this.drawHandler();
    if (!this.drawing || !h || (h._markers?.length ?? 0) <= 1) return;
    h._removeLastVertex();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (this.drawing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); this.undoPoint(); }
  }

  cancelDraw(): void {
    (this.map as any)?.pm.disableDraw();
    this.drawing = null;
  }

  /** Geoman finished a shape: keep it on the map (editable) and open the form. */
  onDrawn(layer: Leaflet.Polyline<any>): void {
    const mode = this.drawing;
    this.drawing = null;
    if (!mode) { layer.remove(); return; }
    this.shapeLayer = layer;
    this.shapeIsNew = true;
    (layer as any).pm?.enable({ allowSelfIntersection: false });
    this.watchShape(layer);
    const kind: AreaKind = mode === 'boundary' ? 'boundary' : mode === 'line' ? 'path' : 'workshop_area';
    this.formError = '';
    this.areaForm = {
      name: mode === 'boundary' ? 'Festival boundary' : '', kind, shape: mode === 'line' ? 'line' : 'polygon',
      department: mode === 'boundary' ? null : this.defaultDepartment(), notes: ''
    };
  }

  startEditArea(a: VenueArea): void {
    if (!this.map || !this.L) return;
    this.selectedArea = null;
    this.formError = '';
    this.areaForm = { _id: a._id, name: a.name, kind: a.kind, shape: a.shape, department: a.department?._id ?? null, notes: a.notes || '' };
    this.drawAreas();   // hides the read-only copy
    const info = areaInfo(a.kind);
    const style: Leaflet.PolylineOptions = { color: info.color, weight: areaWeight(a.kind), fillOpacity: a.kind === 'boundary' ? 0 : 0.2 };
    this.shapeLayer = (a.shape === 'polygon' ? this.L.polygon(a.points, style) : this.L.polyline(a.points, style)).addTo(this.map);
    this.shapeIsNew = false;
    (this.shapeLayer as any).pm?.enable({ allowSelfIntersection: false });
    this.watchShape(this.shapeLayer);
    this.drawMarkers();
  }

  /** Corner drags happen outside Angular: tell it, so the size and the boundary warning update. */
  private watchShape(layer: Leaflet.Polyline<any>): void {
    layer.on('pm:edit pm:markerdragend', () => this.zone.run(() => { /* re-render */ }));
  }

  private stopShapeEditing(): void {
    (this.map as any)?.pm?.disableDraw?.();
    this.drawing = null;
    if (this.shapeLayer) { (this.shapeLayer as any).pm?.disable?.(); this.shapeLayer.remove(); this.shapeLayer = undefined; }
  }

  /** The current corners of the shape being drawn / edited, as [lat, lng]. */
  private shapePoints(): LatLng[] {
    if (!this.shapeLayer) return [];
    const raw: any = this.shapeLayer.getLatLngs();
    const ring: Leaflet.LatLng[] = Array.isArray(raw[0]) ? raw[0] : raw;
    return ring.map(p => [p.lat, p.lng] as LatLng);
  }

  async saveArea(): Promise<void> {
    const f = this.areaForm;
    if (!f || !this.event || this.saving) return;
    const name = f.name.trim();
    if (!name) { this.formError = 'Give it a name'; return; }
    if (this.isTL && !f.department) { this.formError = 'Pick your department'; return; }
    if (this.workshopMode && !this.areaDepartments.some(d => d._id === f.department)) {
      this.formError = 'Pick the Workshop or General department';
      return;
    }
    const points = this.shapePoints();
    const b = this.boundary;
    if (this.isTL && f.kind !== 'boundary' && (!b || !allInside(points, b.points))) {
      this.formError = b ? 'Keep it inside the festival boundary' : NO_BOUNDARY;
      return;
    }
    this.saving = true;
    this.formError = '';
    const input = { name, kind: f.kind, points, department: f.department, notes: f.notes.trim() };
    try {
      const saved = f._id
        ? await this.locationService.updateArea(f._id, input)
        : await this.locationService.createArea(this.event._id, input);
      this.snack.openSucessSnackBar(f._id ? 'Saved' : `${saved.name} added`);
      this.closePanels();
      if (this.workshopMode) { this.backToWorkshops(saved._id); return; }
      await this.load();
      const fresh = this.areas.find(a => a._id === saved._id);
      if (fresh) this.selectArea(fresh);
    } catch (err: any) {
      this.formError = err?.error?.message || 'Could not save';
    } finally {
      this.saving = false;
    }
  }

  removeArea(a: VenueArea): void {
    this.confirm.confirm({
      title: a.kind === 'boundary' ? 'Delete the festival boundary?' : `Delete ${a.shape === 'line' ? 'line' : 'area'}?`,
      message: a.kind === 'boundary'
        ? 'Team Leads won\'t be able to draw zones until a new boundary is drawn.'
        : `"${a.name}" will be removed from the Venue Map.`,
      confirmText: 'Delete', danger: true
    }).subscribe(async ok => {
      if (!ok) return;
      try {
        await this.locationService.removeArea(a._id);
        this.snack.openSucessSnackBar('Deleted');
        this.closePanels();
        await this.load();
      } catch (err: any) {
        this.snack.openErrorSnackBar(err?.error?.message || 'Could not delete');
      }
    });
  }

  /** Admins drawing outside the boundary get a warning (Team Leads are refused). */
  get areaOutsideWarning(): boolean {
    const b = this.boundary;
    return !!(this.areaForm && b && this.areaForm.kind !== 'boundary' && this.shapeLayer && !allInside(this.shapePoints(), b.points));
  }

  // ── KML import (DEV/DIR/ADMIN) ─────────────────────────────────────

  async onKmlFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    const points = parseKml(text);
    const shapes = parseKmlShapes(text);
    if (!points.length && !shapes.length) { this.snack.openErrorSnackBar(kmlProblem(text)); return; }
    if (points.length > 300 || shapes.length > 100) {
      this.snack.openErrorSnackBar('That file is too big (up to 300 pins and 100 areas or lines) — split it into smaller files');
      return;
    }
    this.closePanels();
    this.imports = points.map(p => ({ ...p, include: true }));
    // Only one boundary per event: if one exists, imported "boundaries" start as plain areas.
    let boundaryTaken = !!this.boundary;
    this.importShapes = shapes.map(s => {
      const kind: AreaKind = s.kind === 'boundary' && boundaryTaken ? 'other_area' : s.kind;
      if (kind === 'boundary') boundaryTaken = true;
      return { ...s, kind, include: true };
    });
    this.fitTo([...points.map(p => [p.lat, p.lng] as LatLng), ...shapes.flatMap(s => s.points)]);
  }

  kindOptions(shape: AreaShape) {
    return shape === 'line' ? this.LINE_KINDS : this.POLYGON_KINDS;
  }

  async importSelected(): Promise<void> {
    if (!this.imports || !this.event || this.saving) return;
    const chosen = this.imports.filter(i => i.include).map(({ name, type, lat, lng }) => ({ name, type, lat, lng }));
    const shapes = this.importShapes.filter(s => s.include).map(({ name, kind, points }) => ({ name, kind, points }));
    if (!chosen.length && !shapes.length) return;
    this.saving = true;
    try {
      let created = 0;
      if (shapes.length) created += (await this.locationService.importAreas(this.event._id, shapes)).created;
      if (chosen.length) created += (await this.locationService.importMany(this.event._id, chosen)).created;
      this.snack.openSucessSnackBar(`Imported ${created} item${created === 1 ? '' : 's'}`);
      this.closePanels();
      this.fittedFor = '';
      await this.load();
    } catch (err: any) {
      this.snack.openErrorSnackBar(err?.error?.message || 'Could not import');
    } finally {
      this.saving = false;
    }
  }

  trackById(_: number, x: { _id: string }): string { return x._id; }
  trackByValue(_: number, x: { value: string }): string { return x.value; }
  trackByIndex(i: number): number { return i; }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

/** A Workshop area's status badge: pulses from registration open to the end. `inline` = inside a line of text. */
function statusBadge(w: WorkshopMapStatus, inline = false): string {
  if (!w.badge) return '';
  return `<span class="vm-live k-${w.kind}${w.live ? ' pulse' : ''}${inline ? ' inline' : ''}">${escapeHtml(w.badge)}</span>`;
}

type LiveStatus = { open: boolean; label: string };

/** Two status maps (from GET /map/status) say the same thing. */
function sameStatuses(a: Map<string, LiveStatus>, b: Map<string, LiveStatus>): boolean {
  return a.size === b.size && [...a].every(([id, s]) => { const o = b.get(id); return !!o && o.open === s.open && o.label === s.label; });
}
