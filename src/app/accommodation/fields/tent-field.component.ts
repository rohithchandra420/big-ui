import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, Subscription, of } from 'rxjs';

import { NotificationService } from '../../core/notification.service';
import { AuthService } from '../../core/auth.service';
import { AccomodationService } from '../../accomodation/accomodation.service';
import { LocationService } from '../../venue-map/location.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { FieldCounts, FieldOccupant, FieldTent, TentField, TentFieldService } from '../tent-field.service';
import {
  Layout, cellKey, cellsBetween, changesBetween, clearTents, erase, fromServer, isPath, matchesSearch,
  naturalCompare, parseKey, place, placedIds, setPath, tentAt, toSave,
} from './field-layout';
import { CELL, PathView, TYPE_COLORS, TentView, clampZoom, gridPathOf, pathViewsOf, tentViewsOf, typeColors } from './field-draw';
import { GridCell } from './field-grid.component';

export type Tool = 'place' | 'path' | 'erase' | 'move';

interface TypeGroup { id: string; name: string; tents: FieldTent[]; color: string; }

/**
 * Accommodation › Fields › one field (Tent Fields, Epic B). View: tents as
 * small houses with their number, coloured by how full they are; tap one for
 * its occupants; search by tent number or a person. Editors (DEV/DIR/ADMIN):
 * Edit layout → place tents square by square, mark paths, erase, move, undo,
 * then Save. Nothing is stored until Save.
 */
@Component({
  selector: 'app-tent-field',
  templateUrl: './tent-field.component.html',
  styleUrls: ['./tent-field.component.css']
})
export class TentFieldComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly CELL = CELL;
  readonly MAX = 60;

  field: TentField | null = null;
  counts: FieldCounts | null = null;
  canEdit = false;
  loading = true;
  loadError = '';

  /** Every tent this page knows (placed here + not placed anywhere), by id. */
  tents = new Map<string, FieldTent>();
  private typeColor = new Map<string, string>();

  layout: Layout = { cells: {}, paths: {} };
  private saved: Layout = { cells: {}, paths: {} };
  private undoStack: Layout[] = [];

  tentViews: TentView[] = [];
  gridPath = '';
  pathViews: PathView[] = [];
  groups: TypeGroup[] = [];

  editing = false;
  tool: Tool = 'place';
  pickedType = '';
  pickedTent = '';
  moving = '';
  changes = 0;
  savingLayout = false;

  zoom = 1;
  search = '';
  matches: string[] = [];
  selected: FieldTent | null = null;

  settingsOpen = false;
  settings = { name: '', rows: 1, cols: 1, area: '' };
  /** B3: the event's Camping zones on the Venue Map, and which other field each is linked to. */
  zones: { _id: string; name: string; takenBy: string }[] = [];
  settingsError = '';
  savingSettings = false;

  @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;

  private id = '';
  private sub?: Subscription;
  private drag: { last: [number, number]; before: Layout; pathOn: boolean } | null = null;
  private fitPending = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fieldService: TentFieldService,
    private notify: NotificationService,
    private confirm: ConfirmationService,
    private auth: AuthService,
    private accomodation: AccomodationService,
    private locations: LocationService
  ) {}

  ngOnInit(): void {
    this.sub = this.route.paramMap.subscribe(p => {
      this.id = p.get('id') || '';
      this.fitPending = true;
      this.load(this.route.snapshot.queryParamMap.get('edit') === '1');
    });
  }

  /** Fit one tick later: changing the zoom while the view is being checked isn't allowed. */
  ngAfterViewInit(): void { setTimeout(() => this.fitIfReady()); }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  // ── Loading ──────────────────────────────────────────────────
  load(startEditing = false, keepSelected = ''): void {
    this.loading = true;
    this.loadError = '';
    this.fieldService.get(this.id).subscribe({
      next: d => {
        this.loading = false;
        this.field = d.field;
        this.counts = d.counts;
        this.canEdit = d.canEdit;
        this.tents = new Map([...d.tents, ...d.unplaced].map(t => [t._id, t]));
        this.colourTypes();
        this.saved = fromServer(d.tents, d.field.paths);
        this.layout = this.saved;
        this.undoStack = [];
        this.editing = startEditing && d.canEdit;
        this.moving = '';
        this.selected = keepSelected ? this.tents.get(keepSelected) || null : null;
        this.rebuild();
        this.runSearch();
        setTimeout(() => this.fitIfReady());
      },
      error: e => {
        this.loading = false;
        this.loadError = e?.status === 404 ? 'This field was not found. It may have been deleted.' : (e?.error?.message || 'Could not load the field.');
      }
    });
  }

  private colourTypes(): void {
    this.typeColor = typeColors(this.tents.values());
  }

  colorOf(t: FieldTent | null | undefined): string {
    return this.typeColor.get(t?.passType?._id || '') || TYPE_COLORS[0];
  }

  /** Rebuild the drawn lists and the "tents to place" groups from the current layout. */
  private rebuild(): void {
    this.tentViews = tentViewsOf(this.layout.cells, this.tents, this.typeColor);
    this.gridPath = this.field ? gridPathOf(this.field.rows, this.field.cols) : '';
    this.pathViews = pathViewsOf(this.layout.paths);

    const placed = placedIds(this.layout);
    const byType = new Map<string, TypeGroup>();
    for (const t of this.tents.values()) {
      if (placed.has(t._id)) continue;
      const id = t.passType?._id || '';
      if (!byType.has(id)) byType.set(id, { id, name: t.passType?.name || 'Other', tents: [], color: this.colorOf(t) });
      byType.get(id)!.tents.push(t);
    }
    this.groups = [...byType.values()]
      .map(g => ({ ...g, tents: g.tents.sort((a, b) => naturalCompare(a.tent_no, b.tent_no)) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!this.groups.some(g => g.id === this.pickedType)) this.pickedType = this.groups[0]?.id || '';
    if (this.pickedTent && placed.has(this.pickedTent)) this.pickedTent = '';
    this.changes = changesBetween(this.saved, this.layout);
  }

  trackGroup = (_: number, g: TypeGroup) => g.id;
  trackTent = (_: number, t: FieldTent) => t._id;

  get width(): number { return (this.field?.cols || 1) * CELL; }
  get height(): number { return (this.field?.rows || 1) * CELL; }
  get unplacedCount(): number { return this.groups.reduce((n, g) => n + g.tents.length, 0); }

  get nextTent(): FieldTent | null {
    if (this.pickedTent) {
      const t = this.tents.get(this.pickedTent);
      if (t && !placedIds(this.layout).has(t._id)) return t;
    }
    return this.groups.find(g => g.id === this.pickedType)?.tents[0] || null;
  }

  // ── Zoom ─────────────────────────────────────────────────────
  private fitIfReady(): void {
    if (!this.fitPending || !this.field || !this.scroller) return;
    this.fitPending = false;
    this.fit();
  }

  fit(): void {
    const el = this.scroller?.nativeElement;
    if (!el || !this.field) return;
    const w = Math.max(200, el.clientWidth - 24), h = Math.max(200, el.clientHeight - 24);
    this.zoom = clampZoom(Math.min(w / this.width, h / this.height));
  }

  zoomBy(f: number): void { this.zoom = clampZoom(this.zoom * f); }

  // ── Search ───────────────────────────────────────────────────
  runSearch(): void {
    const q = this.search.trim();
    if (!q) { this.matches = []; return; }
    const ids = Object.values(this.layout.cells);
    this.matches = ids.filter(id => { const t = this.tents.get(id); return !!t && matchesSearch(q, t); });
    if (this.matches.length) this.scrollTo(this.matches[0]);
  }

  private scrollTo(id: string): void {
    const k = Object.keys(this.layout.cells).find(key => this.layout.cells[key] === id);
    const el = this.scroller?.nativeElement;
    if (!k || !el) return;
    const [r, c] = parseKey(k);
    const s = CELL * this.zoom;
    el.scrollTo({ left: Math.max(0, c * s - el.clientWidth / 2 + s / 2), top: Math.max(0, r * s - el.clientHeight / 2 + s / 2), behavior: 'smooth' });
    if (!this.editing && this.matches.length === 1) this.selected = this.tents.get(id) || null;
  }

  // ── Pointer on the grid ──────────────────────────────────────
  onDown(g: GridCell): void {
    const { r, c } = g;
    const cell: [number, number] = [r, c];
    if (!this.editing) {
      const id = tentAt(this.layout, r, c);
      this.selected = id ? this.tents.get(id) || null : null;
      return;
    }
    if (this.tool === 'move') { this.moveTap(r, c); return; }
    this.drag = { last: cell, before: this.layout, pathOn: !isPath(this.layout, r, c) };
    this.apply(r, c);
  }

  onMove(g: GridCell): void {
    if (!this.drag) return;
    const cell: [number, number] = [g.r, g.c];
    if (cell[0] === this.drag.last[0] && cell[1] === this.drag.last[1]) return;
    for (const [r, c] of cellsBetween(this.drag.last, cell).slice(1)) this.apply(r, c);
    this.drag.last = cell;
  }

  @HostListener('window:pointerup')
  onUp(): void {
    if (!this.drag) return;
    if (this.drag.before !== this.layout) this.undoStack.push(this.drag.before);
    this.drag = null;
  }

  private apply(r: number, c: number): void {
    let next = this.layout;
    if (this.tool === 'place') {
      const t = this.nextTent;
      if (!t) return;
      next = place(this.layout, r, c, t._id);
      if (next !== this.layout) this.pickedTent = '';
    } else if (this.tool === 'path') {
      next = setPath(this.layout, r, c, this.drag?.pathOn ?? true);
    } else if (this.tool === 'erase') {
      next = erase(this.layout, r, c);
    }
    if (next !== this.layout) { this.layout = next; this.rebuild(); }
  }

  private moveTap(r: number, c: number): void {
    const id = tentAt(this.layout, r, c);
    if (!this.moving) { this.moving = id || ''; return; }
    if (id) { this.moving = id === this.moving ? '' : id; return; }
    if (isPath(this.layout, r, c)) return;
    const before = this.layout;
    this.layout = place(this.layout, r, c, this.moving);
    if (this.layout !== before) { this.undoStack.push(before); this.rebuild(); }
    this.moving = '';
  }

  // ── Editing ──────────────────────────────────────────────────
  startEdit(): void {
    this.editing = true;
    this.selected = null;
    this.tool = 'place';
    this.settingsOpen = false;
  }

  setTool(t: Tool): void { this.tool = t; this.moving = ''; }

  pickType(id: string): void { this.pickedType = id; this.pickedTent = ''; this.tool = 'place'; }
  pickTent(t: FieldTent): void { this.pickedType = t.passType?._id || ''; this.pickedTent = t._id; this.tool = 'place'; }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.layout = prev;
    this.moving = '';
    this.rebuild();
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }

  get placedNow(): number { return Object.keys(this.layout.cells).length; }

  /** One click: every tent back to "to place" (walkways stay). Undo brings them back; Save stores it. */
  clearAll(): void {
    const n = this.placedNow;
    if (!n) return;
    this.confirm.confirm({
      title: 'Remove all tents?',
      message: 'All ' + n + ' ' + (n === 1 ? 'tent goes' : 'tents go') + ' back to the list. Walkways stay. You can Undo, and nothing changes until you Save.',
      confirmText: 'Remove all', danger: true
    }).subscribe(ok => {
      if (!ok) return;
      const before = this.layout;
      this.layout = clearTents(this.layout);
      if (this.layout !== before) { this.undoStack.push(before); this.moving = ''; this.rebuild(); }
    });
  }

  discard(): void {
    const done = () => { this.layout = this.saved; this.undoStack = []; this.editing = false; this.moving = ''; this.rebuild(); };
    if (!this.changes) { done(); return; }
    this.confirm.confirm({
      title: 'Discard changes?', message: `${this.changes} ${this.changes === 1 ? 'change' : 'changes'} to this layout will be lost.`,
      confirmText: 'Discard', danger: true
    }).subscribe(ok => { if (ok) done(); });
  }

  saveLayout(): void {
    if (!this.field || this.savingLayout) return;
    this.savingLayout = true;
    this.fieldService.saveLayout(this.field._id, { version: this.field.layoutVersion, ...toSave(this.layout) }).subscribe({
      next: r => {
        this.savingLayout = false;
        this.field = { ...this.field!, ...r.field };
        this.counts = r.counts;
        this.saved = this.layout;
        this.undoStack = [];
        this.editing = false;
        this.moving = '';
        this.rebuild();
        this.notify.openSucessSnackBar('Layout saved');
      },
      error: e => {
        this.savingLayout = false;
        this.notify.openErrorSnackBar(e?.error?.message || 'Could not save the layout');
      }
    });
  }

  /** Leaving with unsaved changes asks first (route guard). */
  canLeave(): Observable<boolean> {
    if (!this.editing || !this.changes) return of(true);
    return this.confirm.confirm({
      title: 'Leave without saving?', message: `${this.changes} ${this.changes === 1 ? 'change' : 'changes'} to this layout are not saved.`,
      confirmText: 'Leave', danger: true
    });
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent): void {
    if (this.editing && this.changes) { ev.preventDefault(); ev.returnValue = ''; }
  }

  // ── Settings (rename / resize / delete) ──────────────────────
  openSettings(): void {
    if (!this.field) return;
    this.settings = { name: this.field.name, rows: this.field.rows, cols: this.field.cols, area: this.field.area || '' };
    this.settingsError = '';
    this.settingsOpen = true;
    this.loadZones();
  }

  private async loadZones(): Promise<void> {
    const f = this.field;
    if (!f) return;
    try {
      const [areas, list] = await Promise.all([
        this.locations.listAreas(f.event),
        new Promise<{ fields: TentField[] }>((res, rej) => this.fieldService.list(f.event).subscribe({ next: res, error: rej })),
      ]);
      const owner = new Map(list.fields.filter(x => x.area && x._id !== f._id).map(x => [x.area as string, x.name]));
      this.zones = areas.areas.filter(a => a.kind === 'camping')
        .map(a => ({ _id: a._id, name: a.name, takenBy: owner.get(a._id) || '' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      this.zones = [];
    }
  }

  trackZone = (_: number, z: { _id: string }) => z._id;

  showOnMap(): void {
    if (this.field?.area) this.router.navigate(['/venue-map'], { queryParams: { area: this.field.area } });
  }

  saveSettings(): void {
    if (!this.field) return;
    const name = this.settings.name.trim(), rows = Number(this.settings.rows), cols = Number(this.settings.cols);
    const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= this.MAX;
    if (!name) { this.settingsError = 'Give the field a name.'; return; }
    if (!ok(rows) || !ok(cols)) { this.settingsError = `Rows and columns go from 1 to ${this.MAX}.`; return; }
    this.savingSettings = true;
    this.fieldService.update(this.field._id, { name, rows, cols, area: this.settings.area || null }).subscribe({
      next: () => {
        this.savingSettings = false;
        this.settingsOpen = false;
        this.notify.openSucessSnackBar('Field saved');
        this.fitPending = true;
        this.load();
      },
      error: e => { this.savingSettings = false; this.settingsError = e?.error?.message || 'Could not save the field.'; }
    });
  }

  deleteField(): void {
    if (!this.field) return;
    const f = this.field;
    const n = this.counts?.placed || 0;
    this.confirm.confirm({
      title: `Delete ${f.name}?`,
      message: n ? `Its ${n} ${n === 1 ? 'tent goes' : 'tents go'} back to "not placed". The tents and the people in them are not changed.` : 'This field has no tents on it.',
      confirmText: 'Delete field', danger: true
    }).subscribe(ok => {
      if (!ok) return;
      this.fieldService.remove(f._id).subscribe({
        next: () => { this.notify.openSucessSnackBar(`${f.name} deleted`); this.router.navigate(['/accommodation/fields']); },
        error: e => this.notify.openErrorSnackBar(e?.error?.message || 'Could not delete the field')
      });
    });
  }

  // ── Details panel ────────────────────────────────────────────
  rowColOf(t: FieldTent): string {
    const k = Object.keys(this.layout.cells).find(key => this.layout.cells[key] === t._id);
    if (!k) return '';
    const [r, c] = parseKey(k);
    return `Row ${r + 1} · Column ${c + 1}`;
  }

  takenOf(t: FieldTent): number { return (t.occupants || []).length; }

  /** "1 Male · 1 Female", like Inventory's Gender column. */
  genderMix(t: FieldTent): string {
    const n = new Map<string, number>();
    for (const o of t.occupants || []) { const g = o.gender || 'Not given'; n.set(g, (n.get(g) || 0) + 1); }
    return [...n.entries()].map(([g, c]) => c + ' ' + g).join(' · ');
  }

  /** Same rule as Inventory's Vacate: admin roles or Box Office write access (the server checks too). */
  get canManage(): boolean {
    const user = this.auth.currentUser;
    if (!user) return false;
    if (['DEV', 'DIR', 'ADMIN'].includes(user.role)) return true;
    return this.auth.hasPermission(user, 'box-office:write');
  }

  vacating = '';

  vacate(o: FieldOccupant, t: FieldTent): void {
    this.confirm.confirm({
      title: 'Vacate occupant',
      message: 'Vacate "' + (o.name || 'this occupant') + '" from tent ' + t.tent_no + '?',
      confirmText: 'Vacate',
      danger: true,
    }).subscribe(ok => {
      if (!ok) return;
      this.vacating = o._id;
      this.accomodation.vacateTentSlot(o._id).subscribe({
        next: () => {
          this.vacating = '';
          this.notify.openSucessSnackBar('Occupant vacated');
          this.load(false, t._id);
        },
        error: e => { this.vacating = ''; this.notify.openErrorSnackBar(e?.error?.message || 'Error vacating occupant'); }
      });
    });
  }

  cellKey = cellKey;
}
