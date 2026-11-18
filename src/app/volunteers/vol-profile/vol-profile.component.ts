import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from '@angular/core';
import type * as Leaflet from 'leaflet';
import { NotificationService } from '../../core/notification.service';
import { DepartmentService } from '../../core/department.service';
import { StaffBandInfo, StaffBandService } from '../../core/staff-band.service';
import { VolunteersService } from '../volunteers.service';
import { LocationInfo, VolProfile } from '../volunteers.model';
import { DEPOSIT_LABEL, LOCATION_LABEL, askMessage, money } from '../volunteers.utils';

/**
 * One volunteer's (or Team Lead's) complete profile: contact, details, staff
 * band, 7 days of attendance and location on request. Used by the Volunteers
 * page and by My Department (user, 2026-11-19). Extra sections (Move to,
 * Role) come in as content and show under it. The server checks every rule.
 * - `departmentId` set: loaded through My Department (that department's TL or
 *   a top role); the server says whether location may be asked (`can`).
 * - otherwise through Volunteers; `canAskLocation` = the page's Manage group.
 */
@Component({
  selector: 'app-vol-profile',
  templateUrl: './vol-profile.component.html'
})
export class VolProfileComponent implements OnChanges, OnDestroy {
  @Input() eventId = '';
  @Input() userId = '';
  @Input() departmentId = '';
  /** Volunteers: marked on the picked date. Not given: any slot marked today. */
  @Input() marked: boolean | null = null;
  @Input() canAskLocation = false;
  @Output() loaded = new EventEmitter<VolProfile | null>();

  profile: VolProfile | null = null;
  loading = false;
  error = '';
  money = money;
  depositLabel = DEPOSIT_LABEL;
  locationLabel = LOCATION_LABEL;

  constructor(
    private volunteers: VolunteersService,
    private departments: DepartmentService,
    private staffBands: StaffBandService,
    private notify: NotificationService
  ) {}

  ngOnChanges(ch: SimpleChanges) {
    if (ch['userId'] || ch['eventId'] || ch['departmentId']) this.load();
  }

  ngOnDestroy() { this.map?.remove(); }

  get isTl(): boolean { return this.profile?.role === 'TL'; }
  get markedToday(): boolean {
    if (this.marked !== null) return this.marked;
    const d = this.profile?.attendance[this.profile.attendance.length - 1];
    return !!d && (d.morning || d.afternoon || d.night);
  }
  /** Location section: never for a Team Lead. */
  get showLocation(): boolean {
    if (!this.profile || this.isTl) return false;
    return this.departmentId ? !!this.profile.can?.location : this.canAskLocation;
  }

  /** (Re)loads everything for the current person. */
  async load() {
    const id = this.userId, ev = this.eventId;
    this.profile = null;
    this.error = '';
    this.resetBand();
    this.location = null;
    this.map?.remove();
    this.map = undefined;
    if (!id || !ev) return;
    this.loading = true;
    try {
      const p = this.departmentId
        ? await this.departments.memberProfile(this.departmentId, id, ev)
        : await this.volunteers.profile(ev, id);
      if (id !== this.userId) return;
      this.profile = p;
      this.loaded.emit(p);
      if (this.showLocation) this.loadLocation();
      this.loadBand();
    } catch (err: any) {
      if (id !== this.userId) return;
      this.error = err?.error?.message || 'Could not load the profile.';
      this.loaded.emit(null);
    } finally {
      if (id === this.userId) this.loading = false;
    }
  }

  // ── staff wrist band (B-010) ──
  band: StaffBandInfo | null = null;
  bandBusy = false;
  bandReasonOpen = false;
  bandReason = '';

  private resetBand() { this.band = null; this.bandReasonOpen = false; this.bandReason = ''; }

  /** The Link / Replace buttons show only when the server lets this person change the band (403 → hidden). */
  async loadBand() {
    const id = this.userId;
    this.resetBand();
    try {
      const info = await this.staffBands.get(id, this.eventId);
      if (id === this.userId) this.band = info;
    } catch { /* not allowed or not reachable: status only */ }
  }

  async changeBand(replace: boolean) {
    const p = this.profile, id = this.userId;
    if (!p || this.bandBusy) return;
    if (replace && !this.bandReason.trim()) { this.bandReasonOpen = true; return; }
    const raw = await this.staffBands.scan(`${replace ? 'Replace' : 'Link'} band: ${p.name}`);
    if (!raw || id !== this.userId) return;
    this.bandBusy = true;
    try {
      if (replace) await this.staffBands.replace(id, this.eventId, raw, this.bandReason.trim());
      else await this.staffBands.link(id, this.eventId, raw);
      this.notify.openSucessSnackBar(replace ? 'Band replaced' : 'Band linked');
      if (this.profile && id === this.userId) this.profile = { ...this.profile, band: true };
      await this.loadBand();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save the band');
    } finally {
      this.bandBusy = false;
    }
  }

  // ── location on request (V3) ──
  location: LocationInfo | null = null;
  locationLoading = false;
  asking = false;
  @ViewChild('locMap') locMap?: ElementRef<HTMLDivElement>;
  private map?: Leaflet.Map;

  async loadLocation() {
    const id = this.userId;
    if (!this.showLocation) return;
    this.locationLoading = !this.location;
    try {
      const info = await this.volunteers.location(this.eventId, id);
      if (id !== this.userId) return;
      this.location = info;
      // The map box appears with the answer; draw once it is on the page
      setTimeout(() => this.drawMap());
    } catch {
      this.location = null;
    } finally {
      this.locationLoading = false;
    }
  }

  async askLocation() {
    if (!this.showLocation || this.asking) return;
    this.asking = true;
    try {
      const res = await this.volunteers.askLocation(this.eventId, [this.userId]);
      const text = askMessage(res);
      res.asked ? this.notify.openSucessSnackBar(text) : this.notify.openErrorSnackBar(text);
      await this.loadLocation();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not send the request.');
    } finally {
      this.asking = false;
    }
  }

  mapsLink(lat?: number, lng?: number): string {
    return `https://www.google.com/maps/search/?api=1&query=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
  }

  /** Small map of the last answer (Leaflet is loaded on first use, like the SOS page). */
  private async drawMap() {
    const at = this.location?.latest;
    const el = this.locMap?.nativeElement;
    if (!at || !el || typeof at.lat !== 'number' || typeof at.lng !== 'number') return;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = 'assets/leaflet/leaflet.css';
      document.head.appendChild(link);
    }
    const mod: any = await import('leaflet');
    const L: typeof Leaflet = mod.default || mod;
    if (this.locMap?.nativeElement !== el) return;   // the panel changed meanwhile
    this.map?.remove();
    this.map = L.map(el, { zoomControl: true, attributionControl: true }).setView([at.lat, at.lng], 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(this.map);
    L.circleMarker([at.lat, at.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#1E4638', fillOpacity: 1 }).addTo(this.map);
    setTimeout(() => this.map?.invalidateSize());
  }
}
