import {
  ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, TemplateRef, ViewChild, ViewContainerRef, forwardRef
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

export type DateTimeMode = 'datetime' | 'date' | 'time';
interface DayCell { key: string; day: number; off: boolean; today: boolean }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
/** Touch-only device: no hover and a coarse pointer (see `touch`). */
export const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * BiG's date / time picker (ui 1.65.0, user-approved look "B", 2026-11-19).
 * One component, three tags — the value formats are the browser inputs' own,
 * so it replaces `<input type="date|time|datetime-local">` one for one:
 *   <app-date>       'YYYY-MM-DD'
 *   <app-time>       'HH:mm'
 *   <app-date-time>  'YYYY-MM-DDTHH:mm'  (local time; one field for both)
 * Works with [(ngModel)] / formControlName (ControlValueAccessor); `(change)`
 * fires after every pick, like the native input's change event.
 * - Desktop: our panel on the CDK overlay (calendar, hour / minute columns,
 *   quick picks, Clear / Done), green rounded boxes, green scrollbars.
 * - Touch phones (user, 2026-11-19, option 1): the phone's own picker — a
 *   transparent native input lies over our field, so a tap opens the OS wheel.
 * Styles: global styles.css (.dtp-*).
 */
@Component({
  selector: 'app-date-time, app-date, app-time',
  templateUrl: './date-time.component.html',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateTimeComponent), multi: true }]
})
export class DateTimeComponent implements ControlValueAccessor, OnDestroy {
  /** Same format as the value (a date alone is fine for date + time). '' / null = no limit. */
  @Input() min: string | null = '';
  @Input() max: string | null = '';
  /** Minutes between the offered minutes (any minute can still be typed). */
  @Input() step = 5;
  /** Time used when only a day is picked (date + time). */
  @Input() defaultTime = '11:00';
  @Input() placeholder = '';
  /** A short label shown inside the field before the value (e.g. "Joins"), for compact filters. */
  @Input() prefix = '';
  @Input() ariaLabel = '';
  /** id of the field, for <label for>. */
  @Input() inputId = '';
  /** Quick picks (Now / Today / Tomorrow). */
  @Input() quick = true;
  @Input() set disabled(v: boolean | '' | null) { this.isDisabled = v === '' || !!v; }
  @Output() change = new EventEmitter<string>();

  @ViewChild('panelTpl') panelTpl?: TemplateRef<unknown>;
  @ViewChild('trigger', { read: ElementRef }) trigger?: ElementRef<HTMLElement>;

  readonly mode: DateTimeMode;
  readonly dow = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  readonly hours = Array.from({ length: 24 }, (_, h) => pad(h));
  value = '';
  isDisabled = false;
  open = false;
  /**
   * Touch-only devices (phones, tablets) use the phone's own picker; tests may switch it.
   * "No hover AND a coarse pointer": a touch-screen laptop (it hovers) keeps our panel.
   * Followed live, so switching DevTools device mode, or docking a tablet, changes it.
   */
  touch = false;
  private touchQuery: MediaQueryList | null = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(TOUCH_QUERY) : null;
  private onTouchChange = (e: MediaQueryListEvent) => { this.touch = e.matches; this.close(); this.cdr.markForCheck(); };

  // Panel state
  viewY = 0;
  viewM = 0;
  cells: DayCell[] = [];
  minutes: string[] = [];
  typed = '';

  private overlayRef?: OverlayRef;
  private onChange: (v: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private host: ElementRef<HTMLElement>, private overlay: Overlay, private vcr: ViewContainerRef, private cdr: ChangeDetectorRef) {
    const tag = host.nativeElement.tagName.toLowerCase();
    this.mode = tag === 'app-date' ? 'date' : tag === 'app-time' ? 'time' : 'datetime';
    this.touch = !!this.touchQuery?.matches;
    this.touchQuery?.addEventListener?.('change', this.onTouchChange);
  }

  ngOnDestroy() {
    this.touchQuery?.removeEventListener?.('change', this.onTouchChange);
    this.overlayRef?.dispose();
  }

  // ── value parts ──────────────────────────────────────────

  get datePart(): string { return this.mode === 'time' ? '' : this.value.slice(0, 10); }
  get timePart(): string { return this.mode === 'date' ? '' : this.mode === 'time' ? this.value.slice(0, 5) : this.value.slice(11, 16); }
  get hasDate(): boolean { return this.mode !== 'time'; }
  get hasTime(): boolean { return this.mode !== 'date'; }
  get icon(): string { return this.mode === 'time' ? 'schedule' : this.mode === 'date' ? 'event' : 'calendar_month'; }
  get nativeType(): string { return this.mode === 'datetime' ? 'datetime-local' : this.mode; }
  get monthLabel(): string { return `${MONTHS[this.viewM]} ${this.viewY}`; }
  get minDay(): string { return (this.min || '').slice(0, 10); }
  get maxDay(): string { return (this.max || '').slice(0, 10); }

  /** "Thu 12 Nov 2026", "11:00", "Thu 12 Nov 2026 · 11:00". */
  get label(): string {
    const d = this.datePart ? this.dateText(this.datePart) : '';
    const t = this.timePart;
    if (this.mode === 'date') return d;
    if (this.mode === 'time') return t;
    return d ? `${d} · ${t || this.defaultTime}` : '';
  }
  get placeholderText(): string {
    return this.placeholder || (this.mode === 'date' ? 'Pick a date' : this.mode === 'time' ? 'Pick a time' : 'Pick a date and time');
  }

  dateText(key: string): string {
    const d = new Date(key + 'T00:00:00');
    return isNaN(d.getTime()) ? key : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  private clean(v: unknown): string {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) return '';
    if (this.mode === 'date') return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
    if (this.mode === 'time') return HHMM.test(s.slice(0, 5)) ? s.slice(0, 5) : '';
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return s.slice(0, 10) + 'T' + s.slice(11, 16);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T${this.defaultTime}` : '';
  }

  private commit(v: string) {
    if (v === this.value) return;
    this.value = v;
    this.onChange(v);
    this.change.emit(v);
  }

  // ── ControlValueAccessor ─────────────────────────────────

  writeValue(v: unknown) { this.value = this.clean(v); this.cdr.markForCheck(); }
  registerOnChange(fn: (v: string) => void) { this.onChange = fn; }
  registerOnTouched(fn: () => void) { this.onTouched = fn; }
  setDisabledState(d: boolean) { this.isDisabled = d; }

  // ── phones: the native input ─────────────────────────────

  onNative(v: string) { this.commit(this.clean(v)); this.onTouched(); }

  /**
   * A tap on the field (phones): open the browser's own picker straight away.
   * Without this a desktop-style browser opens it only from its small calendar
   * icon, so a tap anywhere else did nothing. Older browsers open it on focus.
   */
  openNative(e: Event) {
    const el = e.target as HTMLInputElement & { showPicker?: () => void };
    if (this.isDisabled || !el?.showPicker) return;
    try { el.showPicker(); } catch { /* not allowed here: the browser falls back to its own behaviour */ }
  }

  // ── desktop: the panel ───────────────────────────────────

  toggle() {
    if (this.isDisabled || this.touch) return;
    this.open ? this.close() : this.openPanel();
  }

  openPanel() {
    const base = this.datePart || this.clampDay(keyOf(new Date()));
    const d = new Date(base + 'T00:00:00');
    this.viewY = d.getFullYear();
    this.viewM = d.getMonth();
    this.buildCells();
    this.buildMinutes();
    this.buildQuick();
    this.typed = this.timePart;
    this.open = true;
    this.attach();
    setTimeout(() => this.scrollToPicked());
  }

  close() {
    if (!this.open) return;
    this.open = false;
    if (this.overlayRef?.hasAttached()) this.overlayRef.detach();
    this.onTouched();
  }

  private attach() {
    if (!this.panelTpl || !this.trigger) return;
    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        positionStrategy: this.overlay.position().flexibleConnectedTo(this.trigger)
          .withPositions([
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
            { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
            { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
            { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 }
          ])
          .withPush(true),
        scrollStrategy: this.overlay.scrollStrategies.reposition(),
        panelClass: 'dtp-overlay'
      });
    }
    if (!this.overlayRef.hasAttached()) this.overlayRef.attach(new TemplatePortal(this.panelTpl, this.vcr));
  }

  /** The open panel's element (on the overlay layer, outside the host). */
  get panelElement(): HTMLElement | null { return this.overlayRef?.hasAttached() ? this.overlayRef.overlayElement : null; }

  private scrollToPicked() {
    this.panelElement?.querySelectorAll<HTMLElement>('.dtp-col').forEach(col => {
      const on = col.querySelector<HTMLElement>('.on');
      if (on) col.scrollTop = on.offsetTop - col.offsetTop - col.clientHeight / 2 + on.clientHeight / 2;
    });
  }

  // ── calendar ─────────────────────────────────────────────

  private dayOff(key: string): boolean {
    return (!!this.minDay && key < this.minDay) || (!!this.maxDay && key > this.maxDay);
  }
  private clampDay(key: string): string {
    if (this.minDay && key < this.minDay) return this.minDay;
    if (this.maxDay && key > this.maxDay) return this.maxDay;
    return key;
  }

  buildCells() {
    const first = new Date(this.viewY, this.viewM, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(this.viewY, this.viewM + 1, 0).getDate();
    const today = keyOf(new Date());
    const cells: DayCell[] = [];
    for (let i = 0; i < lead; i++) cells.push({ key: '', day: 0, off: true, today: false });
    for (let d = 1; d <= days; d++) {
      const key = `${this.viewY}-${pad(this.viewM + 1)}-${pad(d)}`;
      cells.push({ key, day: d, off: this.dayOff(key), today: key === today });
    }
    this.cells = cells;
  }

  get canPrev(): boolean { return !this.minDay || `${this.viewY}-${pad(this.viewM + 1)}-01` > this.minDay.slice(0, 8) + '01'; }
  get canNext(): boolean { return !this.maxDay || `${this.viewY}-${pad(this.viewM + 1)}-01` < this.maxDay.slice(0, 8) + '01'; }

  shiftMonth(n: number) {
    if ((n < 0 && !this.canPrev) || (n > 0 && !this.canNext)) return;
    const d = new Date(this.viewY, this.viewM + n, 1);
    this.viewY = d.getFullYear();
    this.viewM = d.getMonth();
    this.buildCells();
  }

  pickDay(c: DayCell) {
    if (!c.key || c.off) return;
    if (this.mode === 'date') { this.commit(c.key); this.close(); return; }
    this.commit(`${c.key}T${this.timePart || this.defaultTime}`);
  }

  trackCell = (i: number, c: DayCell) => c.key || 'lead' + i;
  trackStr = (_: number, s: string) => s;

  // ── time ─────────────────────────────────────────────────

  get pickedHour(): string { return this.timePart.slice(0, 2); }
  get pickedMinute(): string { return this.timePart.slice(3, 5); }

  buildMinutes() {
    const step = Math.max(1, Math.min(30, Math.round(this.step) || 5));
    const list: string[] = [];
    for (let m = 0; m < 60; m += step) list.push(pad(m));
    const cur = this.pickedMinute;
    if (cur && !list.includes(cur)) { list.push(cur); list.sort(); }
    this.minutes = list;
  }

  private setTime(hhmm: string) {
    if (!HHMM.test(hhmm)) return;
    if (this.mode === 'time') { this.commit(hhmm); }
    else this.commit(`${this.datePart || this.clampDay(keyOf(new Date()))}T${hhmm}`);
    this.typed = hhmm;
    this.buildMinutes();
  }
  pickHour(h: string) { this.setTime(`${h}:${this.pickedMinute || '00'}`); }
  pickMinute(m: string) { this.setTime(`${this.pickedHour || this.defaultTime.slice(0, 2)}:${m}`); }

  /** The "Type a time" box: 9, 930, 9:30, 09.30 → 09:30. */
  applyTyped() {
    const s = this.typed.trim().replace('.', ':');
    let m = /^(\d{1,2}):?(\d{2})?$/.exec(s);
    if (!m) return;
    const h = +m[1], min = m[2] ? +m[2] : 0;
    if (h > 23 || min > 59) return;
    this.setTime(`${pad(h)}:${pad(min)}`);
  }

  // ── quick picks / footer ─────────────────────────────────

  private nowHHMM(): string { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  /** Stored for the *ngFor (built when the panel opens). */
  quickPicks: { id: string; label: string }[] = [];
  private buildQuick() {
    const today = keyOf(new Date()), tomorrow = keyOf(new Date(Date.now() + 86400000));
    if (!this.quick) this.quickPicks = [];
    else if (this.mode === 'time') this.quickPicks = [{ id: 'now', label: 'Now' }];
    else if (this.mode === 'date') this.quickPicks = this.dayOff(today) ? [] : [{ id: 'today', label: 'Today' }];
    else this.quickPicks = [
      { id: 'now', label: 'Now' }, { id: 'today', label: `Today ${this.defaultTime}` }, { id: 'tomorrow', label: `Tomorrow ${this.defaultTime}` }
    ].filter(q => !this.dayOff(q.id === 'tomorrow' ? tomorrow : today));
  }
  pickQuick(id: string) {
    const today = keyOf(new Date()), tomorrow = keyOf(new Date(Date.now() + 86400000));
    if (this.mode === 'time') { this.setTime(this.nowHHMM()); return; }
    if (this.mode === 'date') { this.commit(today); this.close(); return; }
    if (id === 'now') this.commit(`${today}T${this.nowHHMM()}`);
    else this.commit(`${id === 'tomorrow' ? tomorrow : today}T${this.defaultTime}`);
    const d = new Date(this.datePart + 'T00:00:00');
    this.viewY = d.getFullYear(); this.viewM = d.getMonth();
    this.buildCells(); this.buildMinutes();
    this.typed = this.timePart;
    setTimeout(() => this.scrollToPicked());
  }
  trackQuick = (_: number, q: { id: string }) => q.id;

  clear() { this.commit(''); this.typed = ''; this.close(); }

  // ── outside click / keys ─────────────────────────────────

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent) {
    const t = e.target as Node;
    if (this.open && !this.host.nativeElement.contains(t) && !this.panelElement?.contains(t)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.close(); }

  /** Arrow keys move the picked day while the panel is open (date / date + time). */
  onPanelKey(e: KeyboardEvent) {
    if (!this.hasDate) return;
    const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[e.key];
    if (!step || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.preventDefault();
    const base = new Date((this.datePart || keyOf(new Date())) + 'T00:00:00');
    const next = keyOf(new Date(base.getFullYear(), base.getMonth(), base.getDate() + step));
    if (this.dayOff(next)) return;
    this.mode === 'date' ? this.commit(next) : this.commit(`${next}T${this.timePart || this.defaultTime}`);
    const d = new Date(next + 'T00:00:00');
    if (d.getMonth() !== this.viewM || d.getFullYear() !== this.viewY) { this.viewY = d.getFullYear(); this.viewM = d.getMonth(); }
    this.buildCells();
  }
}
