import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type * as Leaflet from 'leaflet';
import { Subscription } from 'rxjs';
import { EventService } from '../core/event.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { ConfirmationService } from '../shared/confirm-dialog/confirmation.service';
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
export class VenueMapComponent implements AfterViewInit, OnDestroy {
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
  departments: { _id: string; name: string }[] = [];
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
  private subs = new Subscription();

  constructor(
    private locationService: LocationService,
    private eventService: EventService,
    private auth: AuthService,
    private confirm: ConfirmationService,
    private snack: NotificationService,
    private zone: NgZone,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  get isTL(): boolean { return this.auth.currentUser?.role === 'TL'; }
  get includedImports(): number {
    return (this.imports?.filter(i => i.include).length ?? 0) + this.importShapes.filter(s => s.include).length;
  }
  get boundary(): VenueArea | undefined { return this.areas.find(a => a.kind === 'boundary'); }
  get busy(): boolean { return !!(this.form || this.areaForm || this.imports || this.drawing); }

  async ngAfterViewInit(): Promise<void> {
    // From Admin › Events › "Draw / edit on Venue Map": open ready for the boundary.
    this.wantBoundary = this.route.snapshot?.queryParamMap?.get('draw') === 'boundary';
    try {
      await this.initMap();
    } catch {
      this.mapError = 'The map could not be loaded. Check your connection and reload the page.';
    }
    this.subs.add(this.eventService.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.closePanels(); this.fittedFor = ''; }
      this.load();
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
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

  private pin(type: string, isSel = false, draft = false): Leaflet.DivIcon {
    const t = typeInfo(type);
    return this.L!.divIcon({
      className: 'vm-pin-wrap', iconSize: [34, 34], iconAnchor: [17, 34], tooltipAnchor: [0, -30],
      html: `<div class="vm-pin${isSel ? ' sel' : ''}${draft ? ' draft' : ''}" style="background:${t.color}">` +
            `<span class="material-symbols-rounded">${draft ? 'add_location' : t.icon}</span></div>`
    });
  }

  private drawMarkers(): void {
    if (!this.map || !this.L) return;
    const L = this.L;
    this.markers.forEach(m => m.remove());
    this.markers = this.visible.map(loc => {
      const editingThis = this.form?._id === loc._id;
      const m = L.marker([loc.lat, loc.lng], {
        icon: this.pin(loc.type, this.selected?._id === loc._id || editingThis),
        draggable: loc.canEdit && !this.drawing, title: loc.name, keyboard: true
      });
      const outside = this.locInfo.get(loc._id)?.outside ? '<br><i>Outside the festival boundary</i>' : '';
      m.bindTooltip(`<b>${escapeHtml(loc.name)}</b><br>${typeInfo(loc.type).label}${outside}`, { direction: 'top' });
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
      layer.bindTooltip(`<b>${escapeHtml(a.name)}</b><br>${info.label}`, { sticky: true });
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
              `<span class="material-symbols-rounded">${info.icon}</span></div>`
      }),
      title: a.name, keyboard: false, zIndexOffset: -500   // below location pins
    });
    m.on('click', () => this.zone.run(() => this.selectArea(a)));
    return m.addTo(this.map!);
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

  setLayer(name: 'street' | 'sat'): void {
    if (name === this.layerName) return;
    if (this.map) { this.tiles[this.layerName]?.remove(); this.tiles[name]?.addTo(this.map); }
    this.layerName = name;
  }

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

  private defaultDepartment(): string | null {
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
