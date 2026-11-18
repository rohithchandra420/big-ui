import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { BulkUsersComponent } from '../admin/user-registery/bulk-users/bulk-users.component';
import { EventService } from '../core/event.service';
import { NotificationService } from '../core/notification.service';
import { EventItem } from '../models/event.model';
import { VolunteersService } from './volunteers.service';
import type * as Leaflet from 'leaflet';
import { LocationInfo, VolBoard, VolDepartment, VolProfile, Volunteer } from './volunteers.model';
import {
  BoardView, DEPOSIT_LABEL, LOCATION_LABEL, Lane, RoleFilter, STAY_LABEL, SortDir, SortKey, StatFilter,
  askMessage, buildBoard, dayWord, money, moveMessage, shiftDate, sortRows
} from './volunteers.utils';
import { StaffBandInfo, StaffBandService } from '../core/staff-band.service';

type Panel = 'closed' | 'profile' | 'need' | 'add';
/** A home department a new volunteer may get (Add users). */
interface AddDepartment { _id: string; name: string; key: string }
interface Destination { id: string | null; name: string; icon: string }

/**
 * Volunteers (story V1): every volunteer on the event's staff list, grouped
 * by home department, with the Unassigned pool always in view. People who may
 * assign move volunteers by dragging (desktop) or by picking them and choosing
 * a destination in the bar (any device). Attendance is shown only — marking
 * stays in My Department. The server checks every rule again.
 */
@Component({
  selector: 'app-volunteers',
  templateUrl: './volunteers.component.html',
  styleUrls: ['./volunteers.component.css']
})
export class VolunteersComponent implements OnInit, AfterViewInit, OnDestroy {
  event: EventItem | null = null;
  board: VolBoard | null = null;
  /** Built in apply() — the template never iterates a getter. */
  view: BoardView = buildBoard(null, { search: '', stat: 'all', notMarked: false });
  destinations: Destination[] = [];
  loading = false;
  loadError = '';
  busy = false;

  search = '';
  stat: StatFilter = 'all';
  notMarked = false;
  /** B-018: the List opens first; Board is the second choice. */
  layout: 'board' | 'list' = 'list';
  /** B-003: List view column sort. */
  sortKey: SortKey = 'name';
  sortDir: SortDir = 'asc';
  /** List only: everyone, Volunteers or Team Leads. */
  roleFilter: RoleFilter = 'all';
  /**
   * The picked date (YYYY-MM-DD); null = today. It changes only the attendance
   * marks and the bed status (for that night) — user, 2026-11-18.
   */
  date: string | null = null;
  /** Today as the server sees it (learned from a load without a date). */
  realToday = '';
  stayLabel = STAY_LABEL;

  selected = new Set<string>();
  /** Lane id being hovered while dragging ('' = the pool, null = none). */
  dropOn: string | null = null;
  private dragIds: string[] = [];

  panel: Panel = 'closed';
  profile: VolProfile | null = null;
  profileOf: Volunteer | null = null;
  profileLoading = false;
  profileError = '';
  needOf: VolDepartment | null = null;
  needValue: number | null = null;
  needError = '';

  /** Height of the sticky page header, so the pool can stick right under it. */
  headHeight = 0;
  @ViewChild('head') head?: ElementRef<HTMLElement>;
  private resize?: ResizeObserver;
  private sub = new Subscription();

  constructor(
    private events: EventService,
    private volunteers: VolunteersService,
    private notify: NotificationService,
    private zone: NgZone,
    private dialog: MatDialog,
    private staffBands: StaffBandService
  ) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.closePanel(); this.selected.clear(); this.board = null; this.date = null; this.load(); }
    }));
  }

  ngAfterViewInit() {
    const el = this.head?.nativeElement;
    if (!el || typeof ResizeObserver === 'undefined') return;
    this.resize = new ResizeObserver(() => this.zone.run(() => { this.headHeight = el.offsetHeight; }));
    this.resize.observe(el);
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.resize?.disconnect();
    this.map?.remove();
  }

  get canAssign(): boolean { return !!this.board?.canAssign; }
  /** V3: may ask for locations and read the answers. */
  get canManage(): boolean { return !!this.board?.canManage; }

  // ── add users (1.60.0): Manage only; the server makes them Volunteers with no extra access ──

  /**
   * Home departments for a new volunteer: the Unassigned pool first, then every
   * department except Medical (matched by key). A stored list — replaced only
   * when it really changes, so the form's options keep their identities.
   */
  addDepartments: AddDepartment[] = [];

  private buildAddDepartments() {
    const b = this.board;
    const next: AddDepartment[] = !b ? [] : [
      ...(b.pool ? [{ _id: b.pool._id, name: `${b.pool.name} (Unassigned)`, key: 'volunteer' }] : []),
      ...b.departments.filter(d => d.key !== 'medical').map(d => ({ _id: d._id, name: d.name, key: d.key }))
    ];
    const same = next.length === this.addDepartments.length &&
      next.every((d, i) => d._id === this.addDepartments[i]._id && d.name === this.addDepartments[i].name);
    if (!same) this.addDepartments = next;
  }

  openAdd() {
    if (!this.event || !this.canManage) return;
    this.closePanel();
    this.panel = 'add';
  }

  /** The form saved a new volunteer: close it and show them on the board. */
  onUserAdded() {
    this.closePanel();
    this.load();
  }

  openBulk() {
    if (!this.event || !this.canManage) return;
    this.dialog.open(BulkUsersComponent, { width: '920px', maxWidth: '95vw', disableClose: true, data: { volunteersMode: true } })
      .afterClosed().subscribe(added => { if (added) this.load(); });
  }

  // ── location on request (V3) ──
  location: LocationInfo | null = null;
  locationLoading = false;
  locationLabel = LOCATION_LABEL;
  @ViewChild('locMap') locMap?: ElementRef<HTMLDivElement>;
  private map?: Leaflet.Map;

  /** Only volunteers who share are asked; the answer says how many were not. */
  async askLocation(ids: string[]) {
    if (!this.event || !this.canManage || this.busy || !ids.length) return;
    this.busy = true;
    try {
      const res = await this.volunteers.askLocation(this.event._id, ids);
      const text = askMessage(res);
      res.asked ? this.notify.openSucessSnackBar(text) : this.notify.openErrorSnackBar(text);
      if (this.profileOf && ids.includes(this.profileOf._id)) await this.loadLocation(this.profileOf);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not send the request.');
    } finally {
      this.busy = false;
    }
  }

  /** Asks everyone picked, then drops the picks. */
  async askSelected() {
    await this.askLocation([...this.selected]);
    this.selected.clear();
  }

  async loadLocation(v: Volunteer) {
    if (!this.event || !this.canManage) return;
    this.locationLoading = !this.location;
    try {
      const info = await this.volunteers.location(this.event._id, v._id);
      if (this.profileOf?._id !== v._id) return;
      this.location = info;
      // The map box appears with the answer; draw once it is on the page
      setTimeout(() => this.drawMap());
    } catch {
      this.location = null;
    } finally {
      this.locationLoading = false;
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

  async load() {
    if (!this.event) { this.board = null; this.apply(); return; }
    this.loading = !this.board;
    this.loadError = '';
    try {
      const asked = this.date;
      const b = await this.volunteers.board(this.event._id, asked || undefined);
      if (asked !== this.date) return;   // another date was picked meanwhile; that load wins
      this.board = b;
      if (!asked) this.realToday = b.today;
      // Drop picks that are no longer on the board (Team Leads are never picked)
      const ids = new Set(this.board.volunteers.filter(v => v.role !== 'TL').map(v => v._id));
      [...this.selected].forEach(id => { if (!ids.has(id)) this.selected.delete(id); });
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the volunteers.';
    } finally {
      this.loading = false;
      this.buildAddDepartments();
      this.apply();
    }
  }

  apply() {
    const view = buildBoard(this.board, { search: this.search, stat: this.stat, notMarked: this.notMarked, role: this.roleFilter });
    this.view = { ...view, rows: sortRows(view.rows, this.sortKey, this.sortDir) };
    const lanes = buildBoard(this.board, { search: '', stat: 'all', notMarked: false }).lanes;
    this.destinations = [
      { id: null, name: 'Unassigned', icon: 'person_search' },
      ...lanes.map(l => ({ id: l.dept._id, name: l.dept.name, icon: l.icon }))
    ];
  }

  setStat(s: StatFilter) {
    this.stat = this.stat === s ? 'all' : s;
    this.apply();
  }

  toggleNotMarked() {
    this.notMarked = !this.notMarked;
    this.apply();
  }

  setRole(r: RoleFilter) {
    this.roleFilter = r;
    this.apply();
  }

  // ── picked date (Marked + Stay only) ──
  get isToday(): boolean { return !this.date || this.date === this.realToday; }
  /** "Today" or "Mon 16 Nov". */
  get dayLabel(): string { return this.board ? dayWord(this.board.today, this.realToday || this.board.today) : ''; }
  /** For the "Not marked …" texts: "today" / "on Mon 16 Nov". */
  get dayPhrase(): string { return this.isToday ? 'today' : 'on ' + this.dayLabel; }

  shiftDay(n: number) {
    if (!this.board) return;
    this.pickDate(shiftDate(this.board.today, n));
  }

  /** From the date box or the steppers; an empty or broken value is ignored. */
  pickDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return;
    this.date = value === this.realToday ? null : value;
    this.load();
  }

  backToToday() {
    this.date = null;
    this.load();
  }

  /** A header click sorts by that column; clicking it again flips the order. */
  sortBy(key: SortKey) {
    this.sortDir = this.sortKey === key && this.sortDir === 'asc' ? 'desc' : 'asc';
    this.sortKey = key;
    this.apply();
  }

  sortIcon(key: SortKey): string {
    return this.sortKey !== key ? 'unfold_more' : this.sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  ariaSort(key: SortKey): string {
    return this.sortKey !== key ? 'none' : this.sortDir === 'asc' ? 'ascending' : 'descending';
  }

  money = money;
  depositLabel = DEPOSIT_LABEL;

  trackVol = (_: number, v: Volunteer) => v._id;
  trackLane = (_: number, l: Lane) => l.dept._id;
  trackRow = (_: number, r: { v: Volunteer }) => r.v._id;
  trackDest = (_: number, d: Destination) => d.id || '';

  // ── picking and moving ──

  toggle(v: Volunteer) {
    if (!this.canAssign || v.role === 'TL') { this.openProfile(v); return; }
    this.selected.has(v._id) ? this.selected.delete(v._id) : this.selected.add(v._id);
  }

  clearSelection() { this.selected.clear(); }

  /** List view: everyone left after search and filters is picked. */
  get allShownPicked(): boolean {
    const vols = this.view.rows.filter(r => r.v.role !== 'TL');
    return vols.length > 0 && vols.every(r => this.selected.has(r.v._id));
  }

  /** Volunteers among the rows shown (Team Leads can't be picked). */
  get pickableShown(): number { return this.view.rows.filter(r => r.v.role !== 'TL').length; }

  /** List view header: pick every volunteer shown, or unpick them when they all are. */
  toggleAllShown() {
    if (!this.canManage) return;
    const all = this.allShownPicked;
    this.view.rows.filter(r => r.v.role !== 'TL').forEach(r => (all ? this.selected.delete(r.v._id) : this.selected.add(r.v._id)));
  }

  /** `deptId` null = free to the Unassigned pool. */
  async move(ids: string[], deptId: string | null) {
    if (!this.event || !this.board || !this.canAssign || this.busy || !ids.length) return;
    const first = this.board.volunteers.find(v => v._id === ids[0])?.name || 'Volunteer';
    this.busy = true;
    try {
      const res = await this.volunteers.assign(this.event._id, ids, deptId);
      this.selected.clear();
      if (res.moved) this.notify.openSucessSnackBar(moveMessage(res.moved, first, deptId ? res.department?.name || 'the department' : null));
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not move them.');
    } finally {
      this.busy = false;
    }
  }

  moveSelected(deptId: string | null) { this.move([...this.selected], deptId); }

  dragStart(ev: DragEvent, v: Volunteer) {
    if (!this.canAssign) { ev.preventDefault(); return; }
    // Dragging one of the picked volunteers drags all of them
    this.dragIds = this.selected.has(v._id) ? [...this.selected] : [v._id];
    ev.dataTransfer?.setData('text/plain', v._id);
    if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
  }

  dragOver(ev: DragEvent, laneId: string) {
    if (!this.dragIds.length) return;
    ev.preventDefault();
    this.dropOn = laneId;
  }

  dragLeave(ev: DragEvent, laneId: string) {
    const to = ev.relatedTarget as Node | null;
    if (this.dropOn === laneId && !(ev.currentTarget as HTMLElement).contains(to)) this.dropOn = null;
  }

  drop(ev: DragEvent, laneId: string) {
    ev.preventDefault();
    const ids = this.dragIds;
    this.dragEnd();
    this.move(ids, laneId || null);
  }

  dragEnd() { this.dragIds = []; this.dropOn = null; }

  // ── panels ──

  async openProfile(v: Volunteer) {
    if (!this.event) return;
    this.panel = 'profile';
    this.profileOf = v;
    this.profile = null;
    this.band = null;
    this.profileError = '';
    this.profileLoading = true;
    try {
      const p = await this.volunteers.profile(this.event._id, v._id);
      if (this.profileOf?._id === v._id) this.profile = p;
      if (this.canManage && v.role !== 'TL') this.loadLocation(v);
      this.loadBand(v);
    } catch (err: any) {
      this.profileError = err?.error?.message || 'Could not load the profile.';
    } finally {
      this.profileLoading = false;
    }
  }

  // ── staff wrist band (B-010) ──
  band: StaffBandInfo | null = null;
  bandBusy = false;
  bandReasonOpen = false;
  bandReason = '';

  /** The Link / Replace buttons show only when the server lets this person change the band (403 → hidden). */
  async loadBand(v: Volunteer) {
    this.band = null;
    this.bandReasonOpen = false;
    this.bandReason = '';
    if (!this.event) return;
    try {
      const info = await this.staffBands.get(v._id, this.event._id);
      if (this.profileOf?._id === v._id) this.band = info;
    } catch { /* not allowed or not reachable: status only */ }
  }

  async changeBand(replace: boolean) {
    const v = this.profileOf, ev = this.event;
    if (!v || !ev || this.bandBusy) return;
    if (replace && !this.bandReason.trim()) { this.bandReasonOpen = true; return; }
    const raw = await this.staffBands.scan(`${replace ? 'Replace' : 'Link'} band: ${v.name}`);
    if (!raw || this.profileOf?._id !== v._id) return;
    this.bandBusy = true;
    try {
      if (replace) await this.staffBands.replace(v._id, ev._id, raw, this.bandReason.trim());
      else await this.staffBands.link(v._id, ev._id, raw);
      this.notify.openSucessSnackBar(replace ? 'Band replaced' : 'Band linked');
      if (this.profile && this.profileOf?._id === v._id) this.profile = { ...this.profile, band: true };
      await this.loadBand(v);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save the band');
    } finally {
      this.bandBusy = false;
    }
  }

  moveFromProfile(deptId: string | null) {
    const v = this.profileOf;
    if (!v) return;
    this.closePanel();
    this.move([v._id], deptId);
  }

  /** The destination the open profile's volunteer is in now. */
  isCurrent(d: Destination): boolean {
    const p = this.profile;
    return !!p && (d.id === null ? p.unassigned : p.department?._id === d.id);
  }

  openNeed(d: VolDepartment) {
    if (!d.canSetNeed) return;
    this.panel = 'need';
    this.needOf = d;
    this.needValue = d.needed || null;
    this.needError = '';
  }

  async saveNeed() {
    const d = this.needOf;
    if (!this.event || !d || this.busy) return;
    const n = Number(this.needValue ?? 0);
    if (!Number.isInteger(n) || n < 0 || n > 1000) { this.needError = 'A whole number from 0 to 1000 (0 = no number).'; return; }
    this.busy = true;
    this.needError = '';
    try {
      await this.volunteers.setNeed(this.event._id, d._id, n);
      this.notify.openSucessSnackBar(n ? `${d.name} needs ${n} volunteer${n === 1 ? '' : 's'}` : `${d.name}: number removed`);
      this.closePanel();
      await this.load();
    } catch (err: any) {
      this.needError = err?.error?.message || 'Could not save the number.';
    } finally {
      this.busy = false;
    }
  }

  closePanel() {
    this.panel = 'closed';
    this.profile = null;
    this.profileOf = null;
    this.needOf = null;
    this.location = null;
    this.band = null;
    this.bandReasonOpen = false;
    this.bandReason = '';
    this.map?.remove();
    this.map = undefined;
  }

  get panelTitle(): string {
    if (this.panel === 'add') return 'New volunteer';
    return this.panel === 'need' ? 'Volunteers needed' : (this.profileOf?.name || '');
  }
  get panelIcon(): string {
    return this.panel === 'add' ? 'person_add' : this.panel === 'need' ? 'group_add' : 'person';
  }
  get panelSubtitle(): string {
    if (this.panel === 'add') return `Joins ${this.event?.name || 'the event'}'s staff list`;
    if (this.panel === 'need') return this.needOf?.name || '';
    const p = this.profile;
    if (this.isTlProfile) return `Team Lead${p?.teams?.length ? ' · ' + p.teams.join(', ') : ''}`;
    return p ? `Volunteer · ${p.unassigned ? 'Unassigned' : p.department?.name || ''}` : 'Volunteer';
  }

  /** The open profile is a Team Lead: no moves, location requests or deposits here. */
  get isTlProfile(): boolean { return this.profileOf?.role === 'TL'; }
}
