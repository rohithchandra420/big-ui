import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../core/event.service';
import { NotificationService } from '../core/notification.service';
import { EventItem } from '../models/event.model';
import { VolunteersService } from './volunteers.service';
import { VolBoard, VolDepartment, VolProfile, Volunteer } from './volunteers.model';
import { BoardView, Lane, StatFilter, buildBoard, moveMessage } from './volunteers.utils';

type Panel = 'closed' | 'profile' | 'need';
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
  layout: 'board' | 'list' = 'board';

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
    private zone: NgZone
  ) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.closePanel(); this.selected.clear(); this.board = null; this.load(); }
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
  }

  get canAssign(): boolean { return !!this.board?.canAssign; }

  async load() {
    if (!this.event) { this.board = null; this.apply(); return; }
    this.loading = !this.board;
    this.loadError = '';
    try {
      this.board = await this.volunteers.board(this.event._id);
      // Drop picks that are no longer on the board
      const ids = new Set(this.board.volunteers.map(v => v._id));
      [...this.selected].forEach(id => { if (!ids.has(id)) this.selected.delete(id); });
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the volunteers.';
    } finally {
      this.loading = false;
      this.apply();
    }
  }

  apply() {
    this.view = buildBoard(this.board, { search: this.search, stat: this.stat, notMarked: this.notMarked });
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

  trackVol = (_: number, v: Volunteer) => v._id;
  trackLane = (_: number, l: Lane) => l.dept._id;
  trackRow = (_: number, r: { v: Volunteer }) => r.v._id;
  trackDest = (_: number, d: Destination) => d.id || '';

  // ── picking and moving ──

  toggle(v: Volunteer) {
    if (!this.canAssign) { this.openProfile(v); return; }
    this.selected.has(v._id) ? this.selected.delete(v._id) : this.selected.add(v._id);
  }

  clearSelection() { this.selected.clear(); }

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
    this.profileError = '';
    this.profileLoading = true;
    try {
      const p = await this.volunteers.profile(this.event._id, v._id);
      if (this.profileOf?._id === v._id) this.profile = p;
    } catch (err: any) {
      this.profileError = err?.error?.message || 'Could not load the profile.';
    } finally {
      this.profileLoading = false;
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
  }

  get panelTitle(): string {
    return this.panel === 'need' ? 'Volunteers needed' : (this.profileOf?.name || '');
  }
  get panelSubtitle(): string {
    if (this.panel === 'need') return this.needOf?.name || '';
    const p = this.profile;
    return p ? `Volunteer · ${p.unassigned ? 'Unassigned' : p.department?.name || ''}` : 'Volunteer';
  }
}
