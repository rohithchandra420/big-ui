import { AfterViewInit, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import type * as Leaflet from 'leaflet';
import { Subscription } from 'rxjs';
import { PublicMapArea, PublicMapPin } from '../core/public-api.service';
import { I18nService, TPipe } from '../core/i18n';
import { AREA_LOOK, PIN_LOOK, centreOf, directionsUrl } from '../core/map-data';
import { MyLocationService } from '../core/my-location.service';

const STREET = { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' };

/** Escapes staff-typed text before it goes into the map's HTML. */
const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Map tab (PH4a): OpenStreetMap street tiles (Satellite later, with the Esri
 * key), the public areas and pins only, "Show my location", tap for name /
 * Box Office status / Directions. Leaflet is loaded only when this tab opens
 * (its own chunk), so the page itself stays small.
 */
@Component({
  selector: 'pub-map-view',
  standalone: true,
  imports: [NgIf, NgFor, TPipe],
  template: `
    <section>
      <div class="sec-head"><h2>{{ 'map.title' | t }}</h2><span class="hand">{{ 'map.hand' | t }}</span></div>
      <div class="map-wrap">
        <div #mapEl class="map-el" [class.hidden]="failed"></div>
        <div class="map-msg" *ngIf="!ready && !failed">{{ 'map.loading' | t }}</div>
        <div class="map-msg" *ngIf="failed">{{ 'map.failed' | t }}</div>
        <button type="button" class="map-me" *ngIf="ready" (click)="locate()"><span class="ms">my_location</span>{{ 'map.me' | t }}</button>
      </div>
      <p class="map-note" *ngIf="locProblem">{{ (locProblem === 'denied' ? 'map.meDenied' : 'map.meUnavailable') | t }}</p>
      <p class="map-note" *ngIf="offline">{{ 'map.offlineTiles' | t }}</p>
      <p class="map-note" *ngIf="!pins.length && !areas.length">{{ 'map.empty' | t }}</p>
      <div class="legend" *ngIf="legend.length">
        <span *ngFor="let l of legend; trackBy: trackWord"><span class="ms" [style.color]="l.colour">{{ l.icon }}</span>{{ l.word | t }}</span>
      </div>
    </section>`,
})
export class MapViewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() pins: PublicMapPin[] = [];
  @Input() areas: PublicMapArea[] = [];
  /** A pin / area id to open on (from Home's shortcuts or the Emergency sheet). */
  @Input() focusId: string | null = null;
  @Input() offline = false;
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  ready = false;
  failed = false;
  locProblem: 'denied' | 'unavailable' | null = null;
  legend: { icon: string; colour: string; word: any }[] = [];

  private L?: typeof Leaflet;
  private map?: Leaflet.Map;
  private layer?: Leaflet.LayerGroup;
  private meLayer?: Leaflet.LayerGroup;
  private byId = new Map<string, Leaflet.Layer & { openPopup?: () => any }>();
  private fitted = false;
  private sub?: Subscription;

  constructor(private zone: NgZone, private i18n: I18nService, private me: MyLocationService) {}

  trackWord = (_: number, l: { word: string }) => l.word;

  async ngAfterViewInit(): Promise<void> {
    try {
      await loadCss('leaflet-css', 'assets/leaflet/leaflet.css');
      const mod: any = await import('leaflet');
      this.L = mod.default ?? mod;
      this.zone.runOutsideAngular(() => {
        this.map = this.L!.map(this.mapEl.nativeElement, { zoomControl: true }).setView([20.6, 78.9], 5);
        this.L!.tileLayer(STREET.url, { maxZoom: 19, attribution: STREET.attribution, keepBuffer: 4 }).addTo(this.map);
        this.layer = this.L!.layerGroup().addTo(this.map);
        this.meLayer = this.L!.layerGroup().addTo(this.map);
        setTimeout(() => this.map?.invalidateSize());
      });
      this.ready = true;
      this.draw();
      this.sub = this.me.location$.subscribe(loc => this.drawMe(loc?.at || null, loc?.accuracy || 0));
    } catch {
      this.failed = true;
    }
  }

  ngOnChanges(): void {
    this.legend = buildLegend(this.pins, this.areas);
    if (this.ready) this.draw();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.map?.remove();
  }

  async locate(): Promise<void> {
    const loc = await this.me.request();
    this.locProblem = loc ? null : this.me.problem;
    if (loc) this.map?.setView(loc.at, Math.max(this.map.getZoom(), 17));
  }

  private draw(): void {
    const L = this.L!, map = this.map!;
    this.layer!.clearLayers();
    this.byId.clear();
    const bounds: [number, number][] = [];
    // Areas first (under the pins); the boundary first of all.
    const areas = [...this.areas].sort((a, b) => (a.kind === 'boundary' ? -1 : 0) - (b.kind === 'boundary' ? -1 : 0));
    for (const a of areas) {
      const look = AREA_LOOK[a.kind];
      if (!look) continue;
      const opts: Leaflet.PolylineOptions = { color: look.colour, weight: look.line ? 4 : 2, dashArray: look.dash, opacity: .9 };
      const shape = look.line
        ? L.polyline(a.points, opts)
        : L.polygon(a.points, { ...opts, fillColor: look.colour, fillOpacity: a.kind === 'boundary' ? 0.04 : a.kind === 'nogo' ? 0.3 : 0.18 });
      shape.bindPopup(this.popup(a.name, look.word, centreOf(a)));
      shape.addTo(this.layer!);
      this.byId.set(a.id, shape as any);
      bounds.push(...a.points);
    }
    for (const p of this.pins) {
      const look = PIN_LOOK[p.type];
      if (!look) continue;
      const status = p.type === 'box_office' ? (p.open ? 'open' : 'closed') : '';
      const marker = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: 'pub-pin',
          html: `<span style="background:${look.colour}"><i class="ms">${look.icon}</i></span>${status ? `<b class="${status}"></b>` : ''}`,
          iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16]
        })
      });
      marker.bindPopup(this.popup(p.name, look.word, [p.lat, p.lng], p));
      marker.addTo(this.layer!);
      this.byId.set(p.id, marker as any);
      bounds.push([p.lat, p.lng]);
    }
    if (!this.fitted && bounds.length) {
      this.fitted = true;
      map.fitBounds(L.latLngBounds(bounds), { padding: [24, 24], maxZoom: 18 });
    }
    this.focus();
  }

  private focus(): void {
    if (!this.focusId || !this.map) return;
    const layer: any = this.byId.get(this.focusId);
    if (!layer) return;
    const at = layer.getLatLng ? layer.getLatLng() : layer.getBounds().getCenter();
    this.map.setView(at, Math.max(this.map.getZoom(), 18));
    layer.openPopup();
  }

  private drawMe(at: [number, number] | null, accuracy: number): void {
    if (!this.L || !this.meLayer) return;
    this.meLayer.clearLayers();
    if (!at) return;
    this.L.circle(at, { radius: Math.min(accuracy, 200), color: '#3b8fd6', weight: 1, fillOpacity: 0.12 }).addTo(this.meLayer);
    this.L.circleMarker(at, { radius: 8, color: '#fff', weight: 3, fillColor: '#3b8fd6', fillOpacity: 1 }).addTo(this.meLayer);
  }

  private popup(name: string, word: any, at: [number, number], pin?: PublicMapPin): string {
    const t = (k: any) => esc(this.i18n.t(k));
    let status = '';
    if (pin?.type === 'box_office') {
      status = `<div class="pp-status ${pin.open ? 'open' : 'closed'}">${t(pin.open ? 'map.open' : 'map.closed')}${pin.note ? ' · ' + esc(pin.note) : ''}</div>`;
    }
    return `<div class="pub-pop"><small>${t(word)}</small><b>${esc(name)}</b>${status}`
      + `<a href="${directionsUrl(at)}" target="_blank" rel="noopener">${t('map.directions')}</a></div>`;
  }
}

/** The legend: one chip per kind on the map, pins first. */
function buildLegend(pins: PublicMapPin[], areas: PublicMapArea[]) {
  const seen = new Map<string, { icon: string; colour: string; word: any }>();
  for (const p of pins) { const l = PIN_LOOK[p.type]; if (l && !seen.has(l.word)) seen.set(l.word, l); }
  for (const a of areas) { const l = AREA_LOOK[a.kind]; if (l && a.kind !== 'boundary' && !seen.has(l.word)) seen.set(l.word, l); }
  return [...seen.values()];
}

function loadCss(id: string, href: string): Promise<void> {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise(resolve => {
    const link = document.createElement('link');
    link.id = id; link.rel = 'stylesheet'; link.href = href;
    link.onload = () => resolve();
    link.onerror = () => resolve();
    document.head.appendChild(link);
    setTimeout(resolve, 5000);
  });
}
