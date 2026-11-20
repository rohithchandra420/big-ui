import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, ViewChild } from '@angular/core';
import { NgFor, NgIf, NgTemplateOutlet } from '@angular/common';
import type * as Leaflet from 'leaflet';
import { Subscription } from 'rxjs';
import { PublicMapArea, PublicMapPin } from '../core/public-api.service';
import { I18nService, TPipe } from '../core/i18n';
import { AREA_LOOK, PIN_LOOK, centreOf, directionsUrl } from '../core/map-data';
import { LiveBadge, badgeOf } from '../core/live-status';
import { MyLocationService } from '../core/my-location.service';

const STREET = { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' };

/** Covers the whole world; the festival boundary is cut out of it as a hole. */
const WORLD: [number, number][] = [[-89, -179.9], [-89, 179.9], [89, 179.9], [89, -179.9]];

/** Escapes staff-typed text before it goes into the map's HTML. */
const esc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Map tab (PH4a; live status 2026-11-20): OpenStreetMap street tiles, the
 * public areas and pins only, a grey veil outside the festival boundary, a
 * live badge on each place that has a status (workshop state, who plays, the
 * Medical Bay, WASH, Box Office), "Show my location", tap for details /
 * Directions. Leaflet is loaded only when the map is shown (its own chunk).
 *
 * `preview` = the small card on Home: no controls, no popups, a tap opens
 * the Map tab (`openMap`).
 */
@Component({
  selector: 'pub-map-view',
  standalone: true,
  imports: [NgIf, NgFor, NgTemplateOutlet, TPipe],
  template: `
    <section *ngIf="!preview; else small">
      <div class="sec-head"><h2>{{ 'map.title' | t }}</h2><span class="hand">{{ 'map.hand' | t }}</span></div>
      <ng-container *ngTemplateOutlet="mapBox"></ng-container>
      <p class="map-note" *ngIf="locProblem">{{ (locProblem === 'denied' ? 'map.meDenied' : 'map.meUnavailable') | t }}</p>
      <p class="map-note" *ngIf="offline">{{ 'map.offlineTiles' | t }}</p>
      <p class="map-note" *ngIf="!pins.length && !areas.length">{{ 'map.empty' | t }}</p>
      <div class="legend" *ngIf="legend.length">
        <span *ngFor="let l of legend; trackBy: trackWord"><span class="ms" [style.color]="l.colour">{{ l.icon }}</span>{{ l.word | t }}</span>
      </div>
    </section>

    <ng-template #small>
      <button type="button" class="map-card" (click)="openMap.emit()" [attr.aria-label]="'map.preview' | t">
        <ng-container *ngTemplateOutlet="mapBox"></ng-container>
        <span class="map-card-go"><span class="ms">open_in_full</span>{{ 'find.openMap' | t }}</span>
      </button>
    </ng-template>

    <ng-template #mapBox>
      <div class="map-wrap" [class.small]="preview">
        <div #mapEl class="map-el" [class.hidden]="failed"></div>
        <div class="map-msg" *ngIf="!ready && !failed">{{ 'map.loading' | t }}</div>
        <div class="map-msg" *ngIf="failed">{{ 'map.failed' | t }}</div>
        <button type="button" class="map-me" *ngIf="ready && !preview" (click)="locate()"><span class="ms">my_location</span>{{ 'map.me' | t }}</button>
      </div>
    </ng-template>`,
})
export class MapViewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() pins: PublicMapPin[] = [];
  @Input() areas: PublicMapArea[] = [];
  /** A pin / area id to open on (from Home's shortcuts or the Emergency sheet). */
  @Input() focusId: string | null = null;
  @Input() offline = false;
  /** The small Home card (see above). */
  @Input() preview = false;
  @Output() openMap = new EventEmitter<void>();
  @ViewChild('mapEl') mapEl?: ElementRef<HTMLDivElement>;

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
      // The Home card loads Leaflet only once it scrolls into view.
      if (this.preview && this.mapEl) await inView(this.mapEl.nativeElement);
      await loadCss('leaflet-css', 'assets/leaflet/leaflet.css');
      const mod: any = await import('leaflet');
      this.L = mod.default ?? mod;
      const el = this.mapEl?.nativeElement;
      if (!el) return;
      const still = this.preview;
      this.zone.runOutsideAngular(() => {
        this.map = this.L!.map(el, {
          zoomControl: !still, dragging: !still, scrollWheelZoom: !still, doubleClickZoom: !still,
          touchZoom: !still, boxZoom: !still, keyboard: !still, attributionControl: true,
        }).setView([20.6, 78.9], 5);
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
    // The grey veil outside the festival ground: the world with the boundary cut out.
    const grounds = this.areas.filter(a => a.kind === 'boundary' && a.points.length >= 3);
    if (grounds.length) {
      L.polygon([WORLD, ...grounds.map(g => g.points)], {
        stroke: false, fillColor: '#1f2937', fillOpacity: 0.42, interactive: false,
      }).addTo(this.layer!);
    }
    // Areas first (under the pins); the boundary first of all.
    const areas = [...this.areas].sort((a, b) => (a.kind === 'boundary' ? -1 : 0) - (b.kind === 'boundary' ? -1 : 0));
    for (const a of areas) {
      const look = AREA_LOOK[a.kind];
      if (!look) continue;
      const isGround = a.kind === 'boundary';
      const opts: Leaflet.PolylineOptions = isGround
        ? { color: look.colour, weight: 5, opacity: 1, interactive: false }
        : { color: look.colour, weight: look.line ? 4 : 2, dashArray: look.dash, opacity: .9, interactive: !this.preview };
      const shape = look.line
        ? L.polyline(a.points, opts)
        : L.polygon(a.points, { ...opts, fillColor: look.colour, fillOpacity: isGround ? 0 : a.kind === 'nogo' ? 0.3 : 0.18 });
      const badge = badgeOf(a, this.i18n);
      if (!this.preview && !isGround) shape.bindPopup(this.popup(a.name, look.word, centreOf(a), badge));
      shape.addTo(this.layer!);
      // Every place on the ground gets its icon (2026-11-20): inside the live
      // label when it has one, else a round badge in the kind's colour.
      if (badge) this.addBadge(centreOf(a), { ...badge, icon: look.icon }, 'center', [0, 0]);
      else if (!look.line && !isGround) this.addAreaIcon(a, look);
      this.byId.set(a.id, shape as any);
      bounds.push(...a.points);
    }
    for (const p of this.pins) {
      const look = PIN_LOOK[p.type];
      if (!look) continue;
      const badge = badgeOf(p, this.i18n);
      const marker = L.marker([p.lat, p.lng], {
        interactive: !this.preview,
        icon: L.divIcon({
          className: 'pub-pin',
          html: `<span style="background:${look.colour}"><i class="ms">${look.icon}</i></span>${badge ? `<b class="t-${badge.tone}"></b>` : ''}`,
          iconSize: [34, 34], iconAnchor: [17, 17], popupAnchor: [0, -16]
        })
      });
      if (!this.preview) marker.bindPopup(this.popup(p.name, look.word, [p.lat, p.lng], badge));
      marker.addTo(this.layer!);
      if (badge && !this.preview) this.addBadge([p.lat, p.lng], badge, 'top', [0, -20]);
      this.byId.set(p.id, marker as any);
      bounds.push([p.lat, p.lng]);
    }
    if (!this.fitted && bounds.length) {
      this.fitted = true;
      // Fit to the festival ground when drawn, else to everything.
      const fit = grounds.length ? grounds.flatMap(g => g.points) : bounds;
      map.fitBounds(L.latLngBounds(fit), { padding: this.preview ? [8, 8] : [24, 24], maxZoom: 18 });
    }
    this.focus();
  }

  /** A round icon in the middle of an area without a live status; a tap opens its popup. */
  private addAreaIcon(a: PublicMapArea, look: { icon: string; colour: string }): void {
    const s = this.preview ? 22 : 28;
    const m = this.L!.marker(centreOf(a), {
      interactive: !this.preview, keyboard: false, zIndexOffset: -500,
      icon: this.L!.divIcon({
        className: 'pub-area-ic' + (this.preview ? ' sm' : ''), iconSize: [s, s], iconAnchor: [s / 2, s / 2],
        html: `<span style="background:${look.colour}"><i class="ms">${look.icon}</i></span>`
      })
    });
    if (!this.preview) m.on('click', () => (this.byId.get(a.id) as any)?.openPopup?.(centreOf(a)));
    m.addTo(this.layer!);
  }

  /** A permanent label on the map: icon + a few words, coloured by its tone. */
  private addBadge(at: [number, number], b: LiveBadge, direction: 'center' | 'top', offset: [number, number]): void {
    this.L!.tooltip({ permanent: true, direction, offset, interactive: false, className: `pub-badge t-${b.tone}${this.preview ? ' sm' : ''}` })
      .setLatLng(at)
      .setContent(`<i class="ms">${b.icon}</i>${esc(b.text)}`)
      .addTo(this.layer!);
  }

  private focus(): void {
    if (!this.focusId || !this.map || this.preview) return;
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
    this.L.circle(at, { radius: Math.min(accuracy, 200), color: '#3b8fd6', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(this.meLayer);
    this.L.circleMarker(at, { radius: 8, color: '#fff', weight: 3, fillColor: '#3b8fd6', fillOpacity: 1, interactive: false }).addTo(this.meLayer);
  }

  private popup(name: string, word: any, at: [number, number], badge: LiveBadge | null): string {
    const t = (k: any) => esc(this.i18n.t(k));
    const status = badge ? `<div class="pp-status t-${badge.tone}">${esc(badge.detail)}</div>` : '';
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

/** Resolves once the element is on screen (at once without IntersectionObserver). */
function inView(el: Element): Promise<void> {
  if (typeof IntersectionObserver === 'undefined') return Promise.resolve();
  return new Promise(resolve => {
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { io.disconnect(); resolve(); }
    }, { rootMargin: '200px' });
    io.observe(el);
  });
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
