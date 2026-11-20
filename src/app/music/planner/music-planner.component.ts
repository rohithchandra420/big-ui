import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import type { DayPilot as DP } from '@daypilot/daypilot-lite-javascript';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { EventItem } from '../../models/event.model';
import { MusicService } from '../music.service';
import { MusicAct, MusicData, MusicSlot, MusicStage } from '../music.model';
import { DayPiece, MusicDay, clashesOf, dayOf, esc, hhmmOf, localValue, musicDays, nowInCell, pieceOn, shift, toIso } from '../music.utils';

const HOUR = 3600000;
/** Prefix of the calendar items that draw a slot's sound check (not movable). */
const SC = 'sc:';
/** The calendar's usual first hour; a day with earlier slots starts earlier. */
const FIRST_HOUR = 10;

interface SlotForm {
  act: string;
  stage: string;
  start: string;
  end: string;
  soundCheck: boolean;
  scStart: string;
  scEnd: string;
}

/**
 * Music › Planner (MUSIC_CONTEXT.md): the event's slots on a day calendar with
 * the stages as columns (DayPilot Lite, loaded when the page opens). A slot's
 * sound check shows as a light band above it. People who may edit drag,
 * resize and add; a clash (same stage, or the act twice at once) is a warning
 * only. Everyone else sees the details read-only.
 */
@Component({
  selector: 'app-music-planner',
  templateUrl: './music-planner.component.html',
  styleUrls: ['./music-planner.component.css']
})
export class MusicPlannerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('dpEl') dpEl!: ElementRef<HTMLDivElement>;

  event: EventItem | null = null;
  data: MusicData | null = null;
  days: MusicDay[] = [];
  day = '';
  dayCounts = new Map<string, number>();
  loading = false;
  loadError = '';
  calendarError = '';
  noEventDates = false;

  /** The slot panel: closed, a new slot, or an existing one. */
  panelOpen = false;
  editing: MusicSlot | null = null;
  form: SlotForm = this.blank();
  formError = '';
  /** Clashes of the form as it stands (shown before saving). */
  formClashes: { text: string }[] = [];
  busy = false;

  private dp?: DP.Calendar;
  private sub = new Subscription();
  /** The shown day's calendar items (slot or sound check) and how they are cut at midnight. */
  private pieces = new Map<string, DayPiece>();
  /** Redraws the current-time line once a minute. */
  private minuteTimer?: ReturnType<typeof setInterval>;
  private readonly touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

  constructor(
    private events: EventService,
    private music: MusicService,
    private notify: NotificationService,
    private confirm: ConfirmationService,
    private zone: NgZone
  ) {}

  get canEdit(): boolean { return !!this.data?.canEdit; }
  get stages(): MusicStage[] { return this.data?.stages || []; }
  get acts(): MusicAct[] { return this.data?.acts || []; }
  get canAdd(): boolean { return this.canEdit && !!this.stages.length && !!this.acts.length; }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.initCalendar();
    } catch {
      this.calendarError = 'The calendar could not be loaded. Check your connection and reload the page.';
    }
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.closePanel(); this.day = ''; this.load(); }
    }));
    this.minuteTimer = setInterval(() => this.tick(), 60000);
  }

  /** Once a minute while the page is visible: move the current-time line. */
  tick(): void {
    if (!document.hidden) this.render();
  }

  @HostListener('document:visibilitychange')
  onVisible(): void { this.tick(); }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.minuteTimer) clearInterval(this.minuteTimer);
    this.dp?.dispose();
  }

  // ── DayPilot ───────────────────────────────────────────────

  protected async initCalendar(): Promise<void> {
    const mod: any = await import('@daypilot/daypilot-lite-javascript');
    const DayPilot: typeof DP = mod.DayPilot ?? mod.default?.DayPilot ?? mod;
    const run = (fn: () => void) => this.zone.run(fn);
    const dp = new DayPilot.Calendar(this.dpEl.nativeElement, {
      viewType: 'Resources',
      heightSpec: 'BusinessHours',
      businessBeginsHour: FIRST_HOUR,
      businessEndsHour: 24,
      cellHeight: 26,
      headerHeight: 40,
      columnMarginRight: 4,
      timeFormat: 'Clock24Hours',
      eventBorderRadius: 8,
      eventMoveHandling: 'Disabled',
      eventResizeHandling: 'Disabled',
      timeRangeSelectedHandling: 'Disabled',
      onBeforeHeaderRender: args => {
        const s = this.stages.find(x => x._id === args.header.id);
        if (s) args.header.html = `<div class="mu-col"><b>${esc(s.name)}</b>${s.area ? `<span>${esc(s.area.name)}</span>` : ''}</div>`;
      },
      onBeforeEventRender: args => this.renderItem(args.data),
      onEventClick: args => run(() => this.openSlot(this.slotIdOf(String(args.e.data.id)))),
      onEventMoved: args => run(() => this.moved(String(args.e.data.id), args.newStart, args.newEnd, args.newResource)),
      onEventResized: args => run(() => this.moved(String(args.e.data.id), args.newStart, args.newEnd, null)),
      onTimeRangeSelected: args => run(() => {
        dp.clearSelection();
        this.openNew(String(args.resource), args.start.toString('HH:mm'), args.end.toString('HH:mm'));
      }),
      // Phones: a plain tap on an empty cell adds a slot there (DayPilot only selects after a long press).
      // + the current-time line (DayPilot Lite has none): drawn inside the cell that holds "now", in every stage.
      onBeforeCellRender: args => {
        let html = this.touch ? `<i class="mu-cell" data-r="${esc(String(args.cell.resource))}" data-s="${args.cell.start.toString('HH:mm')}"></i>` : '';
        const at = nowInCell(args.cell.start.toString(), args.cell.end.toString());
        if (at !== null) html += `<i class="mu-now-line" style="top:${at}%"></i>`;
        if (html) args.cell.properties.html = html;
      }
    });
    dp.init();
    this.dp = dp;
    if (this.touch) this.listenForTaps();
  }

  private listenForTaps(): void {
    const el = this.dpEl.nativeElement;
    let t0 = 0, x0 = 0, y0 = 0;
    el.addEventListener('touchstart', e => {
      const p = e.touches[0];
      t0 = Date.now(); x0 = p.clientX; y0 = p.clientY;
    }, { passive: true });
    el.addEventListener('touchend', e => {
      const p = e.changedTouches[0];
      if (Date.now() - t0 > 400 || Math.abs(p.clientX - x0) > 10 || Math.abs(p.clientY - y0) > 10) return;
      const cell = (e.target as HTMLElement | null)?.closest?.('.mu-cell') as HTMLElement | null;
      if (!cell || !this.canAdd) return;
      this.zone.run(() => this.openNew(cell.dataset['r'] || '', cell.dataset['s'] || ''));
    }, { passive: true });
  }

  private slotIdOf(itemId: string): string { return itemId.startsWith(SC) ? itemId.slice(SC.length) : itemId; }

  /** A slot card (act, time, genre, clash) or its sound-check band. */
  private renderItem(data: any): void {
    const id = String(data.id);
    const slot = this.data?.slots.find(s => s._id === this.slotIdOf(id));
    if (!slot) return;
    const act = this.acts.find(a => a._id === slot.act);
    const t = (iso: string) => hhmmOf(new Date(iso));
    // Cut at midnight: shown on both days; change its times from the panel (a drag would move only this part).
    const piece = this.pieces.get(id);
    const cut = !!piece && (piece.fromBefore || piece.intoNext);
    if (cut) { data.moveDisabled = true; data.resizeDisabled = true; }
    if (id.startsWith(SC)) {
      data.cssClass = 'mu-sc-item';
      data.backColor = '#f3f0fb';
      data.borderColor = '#d9d0f0';
      data.barHidden = true;
      data.moveDisabled = true;
      data.resizeDisabled = true;
      data.html = `<div class="mu-sc">Sound check · ${t(slot.soundCheckStart!)}–${t(slot.soundCheckEnd!)}</div>`;
      return;
    }
    const clash = clashesOf(slot, this.data!.slots).length > 0;
    data.barColor = '#6b46c1';
    data.backColor = '#ffffff';
    data.borderColor = clash ? '#f59e0b' : '#d9d0f0';
    data.html = `<div class="mu-ev"><div class="mu-t">${esc(act?.name || 'Act')}</div>` +
      `<div class="mu-m">${t(slot.start)}–${t(slot.end)}${act?.genre ? ' · ' + esc(act.genre) : ''}</div>` +
      (piece?.fromBefore ? '<span class="mu-chip">From the day before</span>' : '') +
      (piece?.intoNext ? '<span class="mu-chip">Continues after midnight</span>' : '') +
      (clash ? '<span class="mu-chip warn">Clash</span>' : '') + '</div>';
  }

  /** Redraw the calendar for the day shown. */
  private render(): void {
    if (!this.dp || !this.data) return;
    // Every slot (and sound check) that touches the day, cut at its midnights: a slot past midnight shows on both days.
    const items: any[] = [];
    this.pieces = new Map();
    const add = (id: string, start: string, end: string, stage: string) => {
      const piece = pieceOn(start, end, this.day);
      if (!piece) return;
      this.pieces.set(id, piece);
      items.push({ id, text: '', start: piece.start, end: piece.end, resource: stage });
    };
    this.data.slots.forEach(s => {
      add(s._id, s.start, s.end, s.stage);
      if (s.soundCheckStart && s.soundCheckEnd) add(SC + s._id, s.soundCheckStart, s.soundCheckEnd, s.stage);
    });
    // Start the calendar early enough to show early-hours slots (e.g. the rest of a set from the night before).
    const firstHour = Math.min(FIRST_HOUR, ...items.map(i => new Date(i.start).getHours()));
    this.dp.update({
      startDate: this.day,
      businessBeginsHour: firstHour,
      columns: this.stages.map(s => ({ id: s._id, name: s.name })),
      events: items,
      eventMoveHandling: this.canEdit ? 'Update' : 'Disabled',
      eventResizeHandling: this.canEdit ? 'Update' : 'Disabled',
      timeRangeSelectedHandling: this.canAdd ? 'Enabled' : 'Disabled'
    });
  }

  // ── data ───────────────────────────────────────────────────

  async load(): Promise<void> {
    if (!this.event) { this.data = null; return; }
    this.loading = true;
    this.loadError = '';
    try {
      this.data = await this.music.load(this.event._id);
      this.setDays();
      if (this.editing) this.editing = this.data.slots.find(s => s._id === this.editing!._id) || null;
      this.render();
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the music plan.';
    } finally {
      this.loading = false;
    }
  }

  /** Day tabs from the event's dates (or, without dates, the days that have slots — or today). */
  private setDays(): void {
    let days = musicDays(this.event?.startDate, this.event?.endDate);
    this.noEventDates = !days.length;
    if (!days.length) {
      const dates = [...new Set((this.data?.slots || []).map(s => dayOf(new Date(s.start))))].sort();
      if (!dates.length) dates.push(dayOf(new Date()));
      days = dates.map((d, i) => ({
        date: d, sub: `Day ${i + 1}`,
        label: new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      }));
    }
    this.days = days;
    this.dayCounts = new Map(days.map(d => [d.date, (this.data?.slots || []).filter(s => pieceOn(s.start, s.end, d.date)).length]));
    if (!days.some(d => d.date === this.day)) {
      const today = dayOf(new Date());
      this.day = (days.find(d => d.date === today) || days[0]).date;
    }
  }

  setDay(date: string): void {
    this.day = date;
    this.render();
  }

  /** Dragged or resized: the sound check moves with the slot; then save and warn on a clash. */
  private async moved(itemId: string, start: DP.Date, end: DP.Date, resource: DP.ResourceId | null): Promise<void> {
    const slot = this.data?.slots.find(s => s._id === this.slotIdOf(itemId));
    if (!slot || itemId.startsWith(SC)) return;
    const startIso = new Date(start.toString()).toISOString();
    const delta = new Date(startIso).getTime() - new Date(slot.start).getTime();
    const change: any = { start: startIso, end: new Date(end.toString()).toISOString() };
    if (resource) change.stage = String(resource);
    if (delta && slot.soundCheckStart) {
      change.soundCheckStart = shift(slot.soundCheckStart, delta);
      change.soundCheckEnd = shift(slot.soundCheckEnd, delta);
    }
    try {
      const res = await this.music.updateSlot(slot._id, change);
      this.savedMessage('Moved', res.clashes.length);
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not move the slot');
      await this.load();   // put it back
    }
  }

  private savedMessage(what: string, clashes: number): void {
    if (clashes) this.notify.openSucessSnackBar(`${what}. Warning: it clashes with ${clashes} other slot${clashes === 1 ? '' : 's'}.`);
    else this.notify.openSucessSnackBar(what);
  }

  // ── panel ──────────────────────────────────────────────────

  private blank(): SlotForm {
    return { act: '', stage: '', start: '', end: '', soundCheck: false, scStart: '', scEnd: '' };
  }

  /** New slot: on a stage and time from the calendar, one hour long by default. */
  openNew(stage = '', start = '', end = ''): void {
    if (!this.canAdd) return;
    const s = /^\d\d:\d\d$/.test(start) ? start : '19:00';
    const startValue = `${this.day}T${s}`;
    const endValue = /^\d\d:\d\d$/.test(end) && end > s ? `${this.day}T${end}` : localValue(new Date(new Date(startValue).getTime() + HOUR));
    this.editing = null;
    this.form = { ...this.blank(), stage: stage || this.stages[0]?._id || '', start: startValue, end: endValue };
    this.formError = '';
    this.panelOpen = true;
    this.checkForm();
  }

  openSlot(id: string): void {
    const s = this.data?.slots.find(x => x._id === id);
    if (!s) return;
    this.editing = s;
    this.form = {
      act: s.act, stage: s.stage, start: localValue(s.start), end: localValue(s.end),
      soundCheck: !!s.soundCheckStart, scStart: localValue(s.soundCheckStart), scEnd: localValue(s.soundCheckEnd)
    };
    this.formError = '';
    this.panelOpen = true;
    this.checkForm();
  }

  closePanel(): void {
    this.panelOpen = false;
    this.editing = null;
    this.formClashes = [];
  }

  /** Sound check on: 45 minutes, ending 15 minutes before the start. */
  toggleSoundCheck(): void {
    this.form.soundCheck = !this.form.soundCheck;
    if (this.form.soundCheck && this.form.start && !this.form.scStart) {
      const st = new Date(this.form.start).getTime();
      this.form.scStart = localValue(new Date(st - 60 * 60000));
      this.form.scEnd = localValue(new Date(st - 15 * 60000));
    }
    this.checkForm();
  }

  /** What the form would save (ISO instants), or null while a time is missing. */
  private formSlot(): Omit<MusicSlot, '_id'> | null {
    const f = this.form;
    if (!f.act || !f.stage || !f.start || !f.end) return null;
    return {
      act: f.act, stage: f.stage, start: toIso(f.start)!, end: toIso(f.end)!,
      soundCheckStart: f.soundCheck ? toIso(f.scStart) : null, soundCheckEnd: f.soundCheck ? toIso(f.scEnd) : null
    };
  }

  /** Recomputes the clash warning for the form (called on each change). */
  checkForm(): void {
    const s = this.formSlot();
    if (!s || !this.data) { this.formClashes = []; return; }
    this.formClashes = clashesOf({ ...s, _id: this.editing?._id }, this.data.slots).map(o => {
      const why = o.stage === s.stage ? (this.stageName(o.stage) + ' is in use') : 'the act plays elsewhere';
      return { text: `${this.actName(o.act)} · ${hhmmOf(new Date(o.start))}–${hhmmOf(new Date(o.end))} — ${why}` };
    });
  }

  async save(): Promise<void> {
    const s = this.formSlot();
    if (!s) { this.formError = 'Pick the act and stage, and give the start and end.'; return; }
    if (this.form.soundCheck && (!s.soundCheckStart || !s.soundCheckEnd)) { this.formError = 'Give both sound check times, or switch it off.'; return; }
    if (!this.event) return;
    this.busy = true;
    this.formError = '';
    try {
      const res = this.editing ? await this.music.updateSlot(this.editing._id, s) : await this.music.addSlot(this.event._id, s);
      this.savedMessage(this.editing ? 'Saved' : 'Slot added', res.clashes.length);
      const d = dayOf(new Date(res.slot.start));
      this.closePanel();
      await this.load();
      if (d !== this.day && this.days.some(x => x.date === d)) this.setDay(d);
    } catch (err: any) {
      this.formError = err?.error?.message || 'Could not save the slot.';
    } finally {
      this.busy = false;
    }
  }

  remove(): void {
    const s = this.editing;
    if (!s) return;
    this.confirm.confirm({
      title: 'Delete Slot',
      message: `Delete ${this.actName(s.act)} on ${this.stageName(s.stage)} at ${hhmmOf(new Date(s.start))}? It also leaves the public schedule.`,
      confirmText: 'Delete', danger: true
    }).subscribe(async ok => {
      if (!ok) return;
      try {
        await this.music.removeSlot(s._id);
        this.notify.openSucessSnackBar('Slot deleted');
        this.closePanel();
        await this.load();
      } catch (err: any) {
        this.notify.openErrorSnackBar(err?.error?.message || 'Could not delete the slot.');
      }
    });
  }

  // ── read-only details ───────────────────────────────────────

  actName(id: string): string { return this.acts.find(a => a._id === id)?.name || 'Act'; }
  stageName(id: string): string { return this.stages.find(s => s._id === id)?.name || 'Stage'; }
  actOf(id: string | undefined): MusicAct | undefined { return this.acts.find(a => a._id === id); }
  when(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${hhmmOf(d)}`;
  }
  time(iso: string | null): string { return iso ? hhmmOf(new Date(iso)) : ''; }

  get panelTitle(): string {
    if (!this.editing) return 'New slot';
    return this.actName(this.editing.act);
  }
  get panelSubtitle(): string {
    if (!this.editing) return this.event?.name || '';
    return `${this.stageName(this.editing.stage)} · ${this.when(this.editing.start)}`;
  }

  trackDay(_: number, d: MusicDay) { return d.date; }
  trackId(_: number, x: { _id: string }) { return x._id; }
  trackText(_: number, x: { text: string }) { return x.text; }
}
