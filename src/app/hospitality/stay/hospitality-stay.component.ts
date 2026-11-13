import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { EventItem } from '../../models/event.model';
import { localDate } from '../../workshops/planner.utils';
import { HospitalityService } from '../hospitality.service';
import { GENDERS, Gender, StayItem, StayOverview, StayPerson, StayTypeItem, StayUnitItem } from '../hospitality.model';

type Tab = 'units' | 'allocate' | 'calendar';
interface UnitForm { _id?: string; batch: boolean; type: string; name: string; prefix: string; start: number; count: number; beds: number; area: string; notes: string; ranges: { from: string; to: string }[] }
interface FreeUnit { unit: StayUnitItem; free: number; mixed: boolean }

const DAY = 86400000;
/** 'YYYY-MM-DD' + n days. */
const plusDays = (d: string, n: number) => localDate(new Date(new Date(d + 'T00:00:00').getTime() + n * DAY));

/**
 * Hospitality › Stay (H6): staff / guest accommodation — Units, Allocate,
 * Calendar. Separate from participant Tents. HospitalityGuard; the server
 * checks every rule (beds per night, availability, overlaps, gender).
 */
@Component({
  selector: 'app-hospitality-stay',
  templateUrl: './hospitality-stay.component.html',
  styleUrls: ['./hospitality-stay.component.css']
})
export class HospitalityStayComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  data: StayOverview | null = null;
  loading = false;
  loadError = '';
  busy = false;
  tab: Tab = 'units';
  readonly genders = GENDERS;

  // Units
  typeName = '';
  typeIcon = 'bed';
  form: UnitForm | null = null;
  expanded = '';

  // Allocate
  q = '';
  people: StayPerson[] = [];
  searched = false;
  person: StayPerson | null = null;
  from = '';
  to = '';
  gender: Gender | '' = '';
  /** Guest groups: how many people (beds). */
  groupCount = 1;
  /** The night the counts are for (default tonight). */
  statsNight = '';
  freeUnits: FreeUnit[] = [];
  stays: (StayItem & { unitName: string })[] = [];

  // Calendar (a window of days)
  calFrom = '';
  calDays = 14;
  calDates: string[] = [];
  cell: { unit: StayUnitItem; date: string; who: StayItem[] } | null = null;

  /** The search next to the tabs: units (Units / Calendar) or people and units (Allocate). */
  filter = '';
  /** Unit filters (Units / Calendar). '' = all. */
  typeFilter = '';
  nightFilter: '' | 'empty' | 'room' | 'full' | 'closed' = '';
  readonly nightOptions = [
    { value: 'empty', label: 'Empty' }, { value: 'room', label: 'Has room' },
    { value: 'full', label: 'Full' }, { value: 'closed', label: 'Not available' }
  ];
  shownUnits: StayUnitItem[] = [];
  shownStays: (StayItem & { unitName: string })[] = [];

  private sub = new Subscription();

  constructor(private events: EventService, private hospitality: HospitalityService,
              private notify: NotificationService, private confirm: ConfirmationService) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.data = null; this.calFrom = ''; this.load(); }
    }));
  }
  ngOnDestroy() { this.sub.unsubscribe(); }

  trackId = (_: number, x: { _id: string }) => x._id;
  trackFree = (_: number, x: FreeUnit) => x.unit._id;
  trackDate = (_: number, d: string) => d;

  /** Whole mess period (Units / Allocate), or the calendar window. */
  async load() {
    if (!this.event) return;
    this.loading = !this.data;
    this.loadError = '';
    try {
      this.data = await this.hospitality.getStay(this.event._id, undefined, undefined, this.statsNight || undefined);
      this.statsNight = this.data.nightStats.date;
      if (!this.calFrom) this.calFrom = this.data.today >= this.data.messDates.opensOn && this.data.today <= this.data.messDates.closesOn ? this.data.today : this.data.messDates.opensOn;
      this.buildCalendar();
      this.buildStays();
      this.applyFilter();
      this.buildFree();
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the stays.';
    } finally {
      this.loading = false;
    }
  }

  /** Stored lists for the *ngFor, rebuilt when the search or the data changes. */
  applyFilter() {
    const q = this.filter.trim().toLowerCase();
    const has = (...parts: (string | undefined | null)[]) => !q || parts.some(p => (p || '').toLowerCase().includes(q));
    const units = this.data?.units || [];
    // A person matches a unit only when they sleep there on the dates being looked at
    // (user, 2026-11-04): the picked night on Units, the week on screen on Calendar.
    const first = this.tab === 'calendar' ? this.calDates[0] : this.statsNight;
    const after = this.tab === 'calendar' ? plusDays(this.calDates[this.calDates.length - 1] || first, 1) : plusDays(this.statsNight, 1);
    const staysThen = (u: StayUnitItem) => u.stays.filter(s => s.from < after && s.to > first);
    const night = (u: StayUnitItem) => u.nights.find(n => n.date === this.statsNight);
    const nightOk = (u: StayUnitItem) => {
      if (!this.nightFilter) return true;
      const n = night(u);
      if (!n) return false;
      if (this.nightFilter === 'closed') return !n.open;
      if (!n.open) return false;
      if (this.nightFilter === 'empty') return n.taken === 0;
      if (this.nightFilter === 'full') return n.taken >= u.beds;
      return n.taken < u.beds;
    };
    this.shownUnits = units.filter(u =>
      (!this.typeFilter || u.type?._id === this.typeFilter) && nightOk(u) &&
      (has(u.name, u.type?.name, u.area?.name) || staysThen(u).some(s => has(s.person.name))));
    const typeOf = new Map(units.map(u => [u._id, u.type?._id || '']));
    this.shownStays = this.stays.filter(s => has(s.person.name, s.unitName) && (!this.typeFilter || typeOf.get(String(s.unit)) === this.typeFilter));
  }

  setTab(t: Tab) {
    this.tab = t;
    if (t === 'allocate') this.buildFree();
    this.applyFilter();
  }

  get filtersOn(): boolean { return !!(this.filter || this.typeFilter || this.nightFilter); }
  clearFilters() { this.filter = ''; this.typeFilter = ''; this.nightFilter = ''; this.applyFilter(); this.buildFree(); }
  /** Type filter: also narrows the free units on Allocate. */
  onTypeFilter() { this.applyFilter(); this.buildFree(); }
  trackOpt = (_: number, o: { value: string }) => o.value;

  get filterHint(): string {
    return this.tab === 'allocate' ? 'Search stays by person or unit' : this.tab === 'calendar' ? 'Search units or who sleeps there' : 'Search units, types or areas';
  }

  // ── Units ────────────────────────────────────────────────

  async addType() {
    const name = this.typeName.trim();
    if (!name || !this.event) return;
    await this.run(async () => {
      await this.hospitality.addStayType(this.event!._id, { name, icon: this.typeIcon });
      this.typeName = '';
    }, `Type "${name}" added`);
  }

  deleteType(t: StayTypeItem) {
    this.confirm.confirm({ title: 'Delete Type', message: `Delete "${t.name}"?`, confirmText: 'Delete', danger: true }).subscribe(ok => {
      if (ok) this.run(() => this.hospitality.deleteStayType(t._id), 'Type deleted');
    });
  }

  newUnit(batch: boolean) {
    this.form = { batch, type: this.data?.types[0]?._id || '', name: '', prefix: 'A-', start: 1, count: 10, beds: 6, area: '', notes: '', ranges: [] };
  }

  editUnit(u: StayUnitItem) {
    this.form = { _id: u._id, batch: false, type: u.type?._id || '', name: u.name, prefix: '', start: 1, count: 1, beds: u.beds, area: u.area?._id || '', notes: u.notes, ranges: u.available.map(r => ({ ...r })) };
  }

  addRange() { this.form?.ranges.push({ from: this.data?.messDates.opensOn || '', to: this.data?.messDates.closesOn || '' }); }
  removeRange(i: number) { this.form?.ranges.splice(i, 1); }

  get batchPreview(): string {
    const f = this.form;
    if (!f?.batch || !f.count) return '';
    const name = (i: number) => `${f.prefix}${String(f.start + i).padStart(2, '0')}`;
    return f.count === 1 ? name(0) : `${name(0)} … ${name(f.count - 1)}`;
  }

  async saveUnit() {
    const f = this.form;
    if (!f || !this.event) return;
    if (!f.type) { this.notify.openErrorSnackBar('Add a type first (Dorm, Tent, Villa…)'); return; }
    const base = { type: f.type, beds: Number(f.beds), area: f.area || null, notes: f.notes.trim(), available: f.ranges.filter(r => r.from && r.to) };
    await this.run(async () => {
      if (f._id) await this.hospitality.updateUnit(f._id, { ...base, name: f.name.trim() });
      else if (f.batch) await this.hospitality.addUnits(this.event!._id, { ...base, prefix: f.prefix, start: Number(f.start), count: Number(f.count) });
      else await this.hospitality.addUnit(this.event!._id, { ...base, name: f.name.trim() });
      this.form = null;
    }, f._id ? 'Unit saved' : f.batch ? 'Units added' : 'Unit added');
  }

  deleteUnit(u: StayUnitItem) {
    this.confirm.confirm({ title: 'Delete Unit', message: `Delete ${u.name}?`, confirmText: 'Delete', danger: true }).subscribe(ok => {
      if (ok) this.run(() => this.hospitality.deleteUnit(u._id), 'Unit deleted');
    });
  }

  /** The unit open in the slide panel (looked up by id, so a reload shows fresh data). */
  get expandedUnit(): StayUnitItem | null {
    return this.expanded ? this.data?.units.find(u => u._id === this.expanded) || null : null;
  }
  unitSubtitle(u: StayUnitItem | null): string {
    if (!u) return '';
    return [u.type?.name, `${u.beds} bed${u.beds === 1 ? '' : 's'}`, u.area?.name].filter(Boolean).join(' · ');
  }

  /** Busiest night in the mess period: "4 / 6". */
  peak(u: StayUnitItem): number { return u.nights.reduce((m, n) => Math.max(m, n.taken), 0); }
  availText(u: StayUnitItem): string {
    return u.available.length ? u.available.map(r => `${this.short(r.from)}–${this.short(r.to)}`).join(', ') : 'Whole mess period';
  }

  // ── Allocate ─────────────────────────────────────────────

  async search() {
    const q = this.q.trim();
    if (q.length < 2 || !this.event) return;
    try {
      this.people = (await this.hospitality.searchStayPeople(this.event._id, q)).people;
      this.searched = true;
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not search.');
    }
  }

  pick(p: StayPerson) {
    this.person = p;
    this.people = [];
    this.searched = false;
    this.gender = p.gender || '';
    this.groupCount = 1;
    if (!this.from && this.data) this.from = this.data.today > this.data.messDates.opensOn ? this.data.today : this.data.messDates.opensOn;
    if (!this.to && this.from) this.to = plusDays(this.from, 1);
    this.buildFree();
  }

  /** Units with a bed free on every night of from..to (and open), most free first. */
  buildFree() {
    this.freeUnits = [];
    if (!this.data || !this.person || !this.from || !this.to || this.to <= this.from) return;
    const out: FreeUnit[] = [];
    for (const u of this.data.units) {
      if (this.typeFilter && u.type?._id !== this.typeFilter) continue;
      const nights = u.nights.filter(n => n.date >= this.from && n.date < this.to);
      const wanted = Math.round((Date.parse(this.to) - Date.parse(this.from)) / DAY);
      if (nights.length < wanted || nights.some(n => !n.open)) continue;
      const free = Math.min(...nights.map(n => u.beds - n.taken));
      if (free < this.groupSize) continue;
      const mixed = !!this.gender && u.stays.some(s => s.from < this.to && s.to > this.from && s.gender !== this.gender);
      out.push({ unit: u, free, mixed });
    }
    this.freeUnits = out.sort((a, b) => Number(a.mixed) - Number(b.mixed) || b.free - a.free || a.unit.name.localeCompare(b.unit.name));
  }

  /** Beds wanted: the group size for a guest, 1 for staff. */
  get groupSize(): number { return this.person?.kind === 'guest' ? Math.max(1, Math.min(50, Math.round(this.groupCount || 1))) : 1; }
  stepPeople(by: number) { this.groupCount = Math.max(1, Math.min(50, (this.groupCount || 1) + by)); this.buildFree(); }

  /** Allocate someone from the "No bed tonight" list. */
  allocateFor(p: { _id: string; name: string; detail: string }) {
    this.tab = 'allocate';
    this.from = this.statsNight;
    this.to = plusDays(this.statsNight, 1);
    this.pick({ kind: 'staff', _id: p._id, name: p.name, gender: null, detail: p.detail, stays: [] });
  }

  shiftStats(n: number) {
    if (!this.data) return;
    const d = plusDays(this.statsNight, n);
    if (d < this.data.messDates.opensOn || d > this.data.messDates.closesOn) return;
    this.statsNight = d;
    this.load();
  }
  /** Back to today: only offered when today is a mess night. */
  get todayInMess(): boolean {
    const d = this.data;
    return !!d && d.today >= d.messDates.opensOn && d.today <= d.messDates.closesOn;
  }
  statsToToday() {
    if (!this.data || !this.todayInMess) return;
    this.statsNight = this.data.today;
    this.load();
  }

  async assign(f: FreeUnit, confirmGender = false) {
    const p = this.person;
    if (!p || !this.event || this.busy) return;
    if (!this.gender) { this.notify.openErrorSnackBar('Pick their gender first'); return; }
    this.busy = true;
    try {
      await this.hospitality.addStay(this.event._id, { unit: f.unit._id, kind: p.kind, person: p._id, from: this.from, to: this.to, gender: this.gender, people: this.groupSize, confirmGender });
      this.notify.openSucessSnackBar(`${p.name}${this.groupSize > 1 ? ` (${this.groupSize} people)` : ''} → ${f.unit.name}, ${this.short(this.from)} to ${this.short(this.to)}`);
      this.person = null;
      this.q = '';
      await this.load();
    } catch (err: any) {
      if (err?.error?.code === 'GENDER_MISMATCH') {
        this.busy = false;
        this.confirm.confirm({ title: 'Different Gender', message: err.error.message, confirmText: 'Allocate anyway' })
          .subscribe(ok => { if (ok) this.assign(f, true); });
        return;
      }
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not allocate.');
    } finally {
      this.busy = false;
    }
  }

  /** Every stay, soonest first, for the Allocate list. */
  private buildStays() {
    const list: (StayItem & { unitName: string })[] = [];
    for (const u of this.data?.units || []) for (const s of u.stays) list.push({ ...s, unitName: u.name });
    this.stays = list.sort((a, b) => a.from.localeCompare(b.from) || a.person.name.localeCompare(b.person.name));
  }

  move(s: StayItem, which: 'move-in' | 'move-out', undo = false) {
    this.run(() => this.hospitality.moveStay(s._id, which, undo), which === 'move-in' ? (undo ? 'Moved in undone' : 'Moved in') : (undo ? 'Moved out undone' : 'Moved out'));
  }

  cancelStay(s: StayItem & { unitName: string }) {
    this.confirm.confirm({ title: 'Cancel Stay', message: `Cancel ${s.person.name}'s stay in ${s.unitName}?`, confirmText: 'Cancel stay', danger: true }).subscribe(ok => {
      if (ok) this.run(() => this.hospitality.cancelStay(s._id), 'Stay cancelled');
    });
  }

  // ── Calendar ─────────────────────────────────────────────

  buildCalendar() {
    this.calDates = [];
    if (!this.data || !this.calFrom) return;
    for (let i = 0; i < this.calDays; i++) {
      const d = plusDays(this.calFrom, i);
      if (d > this.data.messDates.closesOn) break;
      this.calDates.push(d);
    }
    this.cell = null;
  }
  shiftCal(n: number) {
    if (!this.data) return;
    let d = plusDays(this.calFrom, n);
    if (d < this.data.messDates.opensOn) d = this.data.messDates.opensOn;
    if (d > this.data.messDates.closesOn) return;
    this.calFrom = d;
    this.buildCalendar();
    this.applyFilter();
  }
  calToToday() {
    if (!this.data || !this.todayInMess) return;
    this.calFrom = this.data.today;
    this.buildCalendar();
    this.applyFilter();
  }
  night(u: StayUnitItem, d: string) { return u.nights.find(n => n.date === d); }
  openCell(u: StayUnitItem, d: string) {
    this.cell = { unit: u, date: d, who: u.stays.filter(s => s.from <= d && s.to > d) };
  }

  // ── helpers ──────────────────────────────────────────────

  short(d: string): string {
    return d ? new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
  }
  dow(d: string): string { return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2); }
  time(iso: string | null): string { return iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; }

  private async run(fn: () => Promise<unknown>, ok: string) {
    if (this.busy) return;
    this.busy = true;
    try {
      await fn();
      this.notify.openSucessSnackBar(ok);
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'That did not work.');
    } finally {
      this.busy = false;
    }
  }
}
