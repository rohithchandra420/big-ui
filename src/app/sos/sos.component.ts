import { Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import type * as Leaflet from 'leaflet';
import { SosAlert, SosService } from '../core/sos.service';
import { EventService } from '../core/event.service';
import { NotificationService } from '../core/notification.service';

export const REFRESH_MS = 15000;
const STREET = { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' };

/**
 * SOS page (PUBLIC_HOME_CONTEXT.md, PH4b): alerts participants sent from the
 * public festival page — open ones first, with where they are, their message
 * and call-back phone, and "Mark handled". Refreshes every 15 s. Access:
 * DEV/DIR/ADMIN and the departments picked on Admin › Public Page (the
 * server checks the same rule).
 */
@Component({
  selector: 'app-sos',
  templateUrl: './sos.component.html',
  styleUrls: ['./sos.component.css']
})
export class SosComponent implements OnInit, OnDestroy {
  @ViewChild('mapEl') mapEl?: ElementRef<HTMLDivElement>;

  items: SosAlert[] = [];
  open = 0;
  loading = true;
  error = '';
  eventId: string | null = null;
  selectedId: string | null = null;
  notes: Record<string, string> = {};
  handlingId: string | null = null;
  now = Date.now();

  private L?: typeof Leaflet;
  private map?: Leaflet.Map;
  private pins?: Leaflet.LayerGroup;
  private timer?: ReturnType<typeof setInterval>;
  private subs: Subscription[] = [];

  constructor(private sos: SosService, private events: EventService, private route: ActivatedRoute,
              private notify: NotificationService, private zone: NgZone) {}

  ngOnInit(): void {
    this.subs.push(this.route.queryParamMap.subscribe(q => { this.selectedId = q.get('n'); this.focus(); }));
    this.subs.push(this.events.activeEvent.subscribe(ev => {
      this.eventId = ev?._id || null;
      this.load();
    }));
    this.timer = setInterval(() => { this.now = Date.now(); this.load(); }, REFRESH_MS);
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
    clearInterval(this.timer);
    this.map?.remove();
  }

  trackById = (_: number, s: SosAlert) => s._id;

  load(): void {
    if (!this.eventId) { this.loading = false; return; }
    const id = this.eventId;
    this.sos.list(id).subscribe({
      next: r => {
        if (this.eventId !== id) return;
        this.items = r.items;
        this.open = r.open;
        this.sos.open$.next(r.open);
        this.loading = false;
        this.error = '';
        this.drawPins();
      },
      error: () => { this.loading = false; this.error = 'Could not load SOS alerts.'; }
    });
  }

  select(s: SosAlert): void {
    this.selectedId = s._id;
    this.focus();
  }

  minutesAgo(s: SosAlert): number { return Math.max(0, Math.floor((this.now - Date.parse(s.createdAt)) / 60000)); }

  directions(s: SosAlert): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${s.lat.toFixed(6)},${s.lng.toFixed(6)}&travelmode=walking`;
  }

  tel(phone: string): string { return 'tel:' + phone.replace(/[\s-]/g, ''); }

  markHandled(s: SosAlert): void {
    this.handlingId = s._id;
    this.sos.handle(s._id, (this.notes[s._id] || '').trim()).subscribe({
      next: updated => {
        this.items = this.items.map(i => i._id === updated._id ? updated : i);
        this.open = this.items.filter(i => i.status === 'open').length;
        this.sos.open$.next(this.open);
        this.handlingId = null;
        this.drawPins();
        this.notify.openSucessSnackBar('Marked handled');
      },
      error: err => {
        this.handlingId = null;
        this.notify.openErrorSnackBar(err?.error?.message || 'Could not mark it handled');
      }
    });
  }

  // ── small map of the open alerts (Leaflet loaded on first use) ──

  private async ensureMap(): Promise<boolean> {
    if (this.map) return true;
    if (!this.mapEl) return false;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = 'assets/leaflet/leaflet.css';
      document.head.appendChild(link);
    }
    const mod: any = await import('leaflet');
    this.L = mod.default ?? mod;
    this.zone.runOutsideAngular(() => {
      this.map = this.L!.map(this.mapEl!.nativeElement).setView([20.6, 78.9], 5);
      this.L!.tileLayer(STREET.url, { maxZoom: 19, attribution: STREET.attribution }).addTo(this.map);
      this.pins = this.L!.layerGroup().addTo(this.map);
      setTimeout(() => this.map?.invalidateSize());
    });
    return true;
  }

  private async drawPins(): Promise<void> {
    const shown = this.items.filter(s => s.status === 'open' || s._id === this.selectedId);
    if (!shown.length || !(await this.ensureMap())) return;
    const L = this.L!;
    this.pins!.clearLayers();
    for (const s of shown) {
      L.circleMarker([s.lat, s.lng], {
        radius: s._id === this.selectedId ? 11 : 8, color: '#fff', weight: 3,
        fillColor: s.status === 'open' ? '#dc2626' : '#9ca3af', fillOpacity: 1
      }).addTo(this.pins!).on('click', () => this.zone.run(() => this.select(s)));
      if (s.accuracy) L.circle([s.lat, s.lng], { radius: Math.min(s.accuracy, 300), color: '#dc2626', weight: 1, fillOpacity: 0.08 }).addTo(this.pins!);
    }
    this.focus(shown);
  }

  private focus(shown = this.items.filter(s => s.status === 'open' || s._id === this.selectedId)): void {
    if (!this.map || !this.L || !shown.length) return;
    const sel = this.items.find(s => s._id === this.selectedId);
    if (sel) this.map.setView([sel.lat, sel.lng], 18);
    else this.map.fitBounds(this.L.latLngBounds(shown.map(s => [s.lat, s.lng] as [number, number])), { padding: [30, 30], maxZoom: 18 });
  }
}
