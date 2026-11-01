import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { Subscription } from 'rxjs';
import { EventService } from '../core/event.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { ConfirmationService } from '../shared/confirm-dialog/confirmation.service';
import { EventItem } from '../models/event.model';
import { LocationService, VenueLocation } from './location.service';
import {
  KmlPoint, LOCATION_TYPES, LocationType, directionsUrl, kmlProblem, parseKml, parseLatLng, streetViewUrl, typeInfo
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

const TILES = {
  street: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
  sat: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
         attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' }
};
// Before any location exists for an event: show the country, so "Go to" or
// "Use my location" can take it from there.
const START: [number, number] = [20.6, 78.9];

/**
 * Venue Map (story A1, VENUE_MAP_AND_TENT_FIELDS_CONTEXT.md): places on the
 * festival ground for the active event. Leaflet is loaded only when this page
 * opens (dynamic import), so it never weighs on the rest of the app.
 * Who may add / change what is decided by the server (canAdd / canEdit / canImport).
 */
@Component({
  selector: 'app-venue-map',
  templateUrl: './venue-map.component.html',
  styleUrls: ['./venue-map.component.css']
})
export class VenueMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapEl') mapEl!: ElementRef<HTMLDivElement>;
  readonly TYPES = LOCATION_TYPES;
  readonly typeInfo = typeInfo;
  readonly directionsUrl = directionsUrl;
  readonly streetViewUrl = streetViewUrl;

  event: EventItem | null = null;
  locations: VenueLocation[] = [];
  visible: VenueLocation[] = [];
  canAdd = false;
  canImport = false;
  departments: { _id: string; name: string }[] = [];
  loading = true;
  loadError = '';
  mapError = '';

  layerName: 'street' | 'sat' = 'sat';
  typeFilter = new Set<LocationType>(LOCATION_TYPES.map(t => t.value));
  selected: VenueLocation | null = null;
  form: LocationForm | null = null;
  formError = '';
  saving = false;
  adding = false;
  accuracy: number | null = null;
  imports: (KmlPoint & { include: boolean })[] | null = null;
  gotoText = '';

  private L?: typeof Leaflet;
  private map?: Leaflet.Map;
  private tiles: Partial<Record<'street' | 'sat', Leaflet.TileLayer>> = {};
  private markers: Leaflet.Marker[] = [];
  private draftMarker?: Leaflet.Marker;
  private fittedFor = '';
  private subs = new Subscription();

  constructor(
    private locationService: LocationService,
    private eventService: EventService,
    private auth: AuthService,
    private confirm: ConfirmationService,
    private snack: NotificationService,
    private zone: NgZone
  ) {}

  get isTL(): boolean { return this.auth.currentUser?.role === 'TL'; }
  get includedImports(): number { return this.imports?.filter(i => i.include).length ?? 0; }

  async ngAfterViewInit(): Promise<void> {
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
    this.map?.remove();
  }

  // ── Leaflet ────────────────────────────────────────────────────────

  /** Loads Leaflet's stylesheet + code on first use and creates the map. */
  protected async initMap(): Promise<void> {
    await this.loadCss();
    const mod: any = await import('leaflet');
    const L: typeof Leaflet = mod.default ?? mod;
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
      this.map = map;
    });
  }

  /** Leaflet's own stylesheet (copied to assets by angular.json). Without it the tiles land in the wrong places. */
  private loadCss(): Promise<void> {
    if (document.getElementById('leaflet-css')) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'assets/leaflet/leaflet.css';
      link.onload = () => resolve();
      link.onerror = () => { link.remove(); reject(new Error('leaflet.css')); };
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
        draggable: loc.canEdit, title: loc.name, keyboard: true
      });
      m.bindTooltip(`<b>${escapeHtml(loc.name)}</b><br>${typeInfo(loc.type).label}`, { direction: 'top' });
      m.on('click', () => this.zone.run(() => this.select(loc)));
      m.on('dragend', () => this.zone.run(() => { const p = m.getLatLng(); this.onDragEnd(loc, p.lat, p.lng); }));
      return m.addTo(this.map!);
    });
  }

  private placeDraft(lat: number, lng: number): void {
    if (!this.map || !this.L) return;
    this.draftMarker?.remove();
    const m = this.L.marker([lat, lng], { icon: this.pin(this.form?.type || 'other', true, true), draggable: true });
    m.on('dragend', () => this.zone.run(() => { const p = m.getLatLng(); if (this.form) { this.form.lat = p.lat; this.form.lng = p.lng; } }));
    this.draftMarker = m.addTo(this.map);
  }

  private fitToLocations(): void {
    if (!this.map || !this.L || !this.locations.length) return;
    const bounds = this.L.latLngBounds(this.locations.map(l => [l.lat, l.lng] as [number, number]));
    this.map.fitBounds(bounds.pad(0.2), { maxZoom: 18 });
  }

  setLayer(name: 'street' | 'sat'): void {
    if (name === this.layerName) return;
    if (this.map) { this.tiles[this.layerName]?.remove(); this.tiles[name]?.addTo(this.map); }
    this.layerName = name;
  }

  // ── data ───────────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (!this.event) { this.locations = []; this.refreshVisible(); this.loading = false; return; }
    const eventId = this.event._id;
    this.loading = true;
    this.loadError = '';
    try {
      const res = await this.locationService.list(eventId);
      if (this.event?._id !== eventId) return;
      this.locations = res.locations;
      this.canAdd = res.canAdd;
      this.canImport = res.canImport;
      if (this.canAdd && !this.departments.length) {
        this.departments = (await this.locationService.myDepartments()).filter(d => d._id !== 'ALL');
      }
      if (this.selected) this.selected = this.locations.find(l => l._id === this.selected!._id) || null;
      this.refreshVisible();
      if (this.fittedFor !== eventId) { this.fittedFor = eventId; this.fitToLocations(); }
    } catch {
      this.loadError = 'Could not load the locations.';
    } finally {
      this.loading = false;
    }
  }

  private refreshVisible(): void {
    this.visible = this.locations.filter(l => this.typeFilter.has(l.type));
    this.drawMarkers();
  }

  toggleType(t: LocationType): void {
    this.typeFilter.has(t) ? this.typeFilter.delete(t) : this.typeFilter.add(t);
    this.refreshVisible();
  }

  countOf(t: LocationType): number {
    return this.locations.filter(l => l.type === t).length;
  }

  // ── selecting / adding / editing ───────────────────────────────────

  select(loc: VenueLocation, fly = false): void {
    if (this.form || this.imports) return;
    this.selected = loc;
    this.drawMarkers();
    if (fly && this.map) this.map.flyTo([loc.lat, loc.lng], Math.max(this.map.getZoom(), 18));
  }

  closePanels(): void {
    this.selected = null;
    this.form = null;
    this.imports = null;
    this.adding = false;
    this.accuracy = null;
    this.formError = '';
    this.draftMarker?.remove();
    this.draftMarker = undefined;
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

  // ── KML import (DEV/DIR/ADMIN) ─────────────────────────────────────

  async onKmlFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const text = await file.text();
    const points = parseKml(text);
    if (!points.length) { this.snack.openErrorSnackBar(kmlProblem(text)); return; }
    if (points.length > 300) { this.snack.openErrorSnackBar('That file has more than 300 places — split it into smaller files'); return; }
    this.closePanels();
    this.imports = points.map(p => ({ ...p, include: true }));
    if (this.map && this.L) this.map.fitBounds(this.L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number])).pad(0.3), { maxZoom: 18 });
  }

  async importSelected(): Promise<void> {
    if (!this.imports || !this.event || this.saving) return;
    const chosen = this.imports.filter(i => i.include).map(({ name, type, lat, lng }) => ({ name, type, lat, lng }));
    if (!chosen.length) return;
    this.saving = true;
    try {
      const res = await this.locationService.importMany(this.event._id, chosen);
      this.snack.openSucessSnackBar(`Imported ${res.created} location${res.created === 1 ? '' : 's'}`);
      this.closePanels();
      this.fittedFor = '';
      await this.load();
    } catch (err: any) {
      this.snack.openErrorSnackBar(err?.error?.message || 'Could not import the locations');
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
