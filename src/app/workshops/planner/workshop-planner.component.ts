import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import type { DayPilot as DP } from '@daypilot/daypilot-lite-javascript';
import { EventService } from '../../core/event.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';
import { WorkshopService } from '../workshop.service';
import { LiveSession, WorkshopCategory, WorkshopSchedule, WorkshopSession } from '../workshops.model';
import {
  MapStatus, PlannerDay, effectiveRegCloses, esc, eventDays, localDate, localIso, localTime, mapStatusOf, overlapsOf, regState, toInstant
} from '../planner.utils';

/** A card in the Now row: running now, or later today. */
export interface NowCard {
  id: string;
  title: string;
  colour: string;
  venue: string;
  start: string;
  end: string;
  running: boolean;
  /** The same one status as the Venue Map. */
  status: MapStatus;
  attended: number;
  capacity: number;
  /** Share of the capacity in use, for the meter (capped at 100). */
  fill: number;
}
import { SessionPrefill } from './session-panel/session-panel.component';

/**
 * Workshops › Planner (Workshops epic, W4): the event's sessions on a day
 * calendar with the venues as columns (DayPilot Lite, loaded only when this
 * page opens, like Leaflet). Everyone signed in sees it; the Workshop TL or
 * above drags, resizes and adds; the Workshop team opens / closes
 * pre-registration from a session's panel.
 */
@Component({
  selector: 'app-workshop-planner',
  templateUrl: './workshop-planner.component.html',
  styleUrls: ['./workshop-planner.component.css']
})
export class WorkshopPlannerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('dpEl') dpEl!: ElementRef<HTMLDivElement>;

  event: EventItem | null = null;
  schedule: WorkshopSchedule | null = null;
  days: PlannerDay[] = [];
  /** 'YYYY-MM-DD' of the day shown. */
  day = '';
  /** Sessions per day, for the day tabs. */
  dayCounts = new Map<string, number>();
  categories: WorkshopCategory[] = [];
  loading = false;
  loadError = '';
  calendarError = '';
  /** The event has no dates: the planner shows the days that have sessions (or today). */
  noEventDates = false;

  selectedId: string | null = null;
  panelOpen = false;
  panelSession: WorkshopSession | null = null;
  panelPrefill: SessionPrefill | null = null;

  /** Sessions running now (W8): attended against capacity. Refreshed every 30 s and on returning to the tab. */
  live: LiveSession[] = [];
  private liveTimer?: ReturnType<typeof setInterval>;
  private minuteTimer?: ReturnType<typeof setInterval>;
  /** Now → upcoming today (the row above the calendar). */
  nowRow: NowCard[] = [];

  private dp?: DP.Calendar;
  private DayPilot?: typeof DP;
  private sub = new Subscription();

  constructor(
    private events: EventService,
    private auth: AuthService,
    private workshopService: WorkshopService,
    private notify: NotificationService,
    private zone: NgZone
  ) {}

  get canManage(): boolean { return !!this.schedule?.canManage; }
  get canPlan(): boolean { return this.auth.canPlanWorkshops(this.auth.currentUser); }
  get hasVenues(): boolean { return !!this.schedule?.venues.length; }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.initCalendar();
    } catch {
      this.calendarError = 'The calendar could not be loaded. Check your connection and reload the page.';
    }
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) {
        this.closePanel();
        this.day = '';
        this.live = [];
        this.load();
        this.loadLive();
      }
    }));
    this.liveTimer = setInterval(() => this.loadLive(), 30000);
    this.minuteTimer = setInterval(() => this.tick(), 60000);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.liveTimer) clearInterval(this.liveTimer);
    if (this.minuteTimer) clearInterval(this.minuteTimer);
    this.dp?.dispose();
  }

  // ── DayPilot ───────────────────────────────────────────────

  /** Loads DayPilot Lite on first use (its own chunk) and creates the calendar. */
  protected async initCalendar(): Promise<void> {
    const mod: any = await import('@daypilot/daypilot-lite-javascript');
    const DayPilot: typeof DP = mod.DayPilot ?? mod.default?.DayPilot ?? mod;
    this.DayPilot = DayPilot;
    const run = (fn: () => void) => this.zone.run(fn);
    const dp = new DayPilot.Calendar(this.dpEl.nativeElement, {
      viewType: 'Resources',
      heightSpec: 'BusinessHours',
      businessBeginsHour: 7,
      businessEndsHour: 21,
      cellHeight: 28,
      headerHeight: 44,
      columnMarginRight: 4,
      timeFormat: 'Clock24Hours',
      eventBorderRadius: 8,
      eventMoveHandling: 'Disabled',
      eventResizeHandling: 'Disabled',
      timeRangeSelectedHandling: 'Disabled',
      onBeforeHeaderRender: args => {
        const v = this.schedule?.venues.find(x => x._id === args.header.id);
        if (v) args.header.html = `<div class="wp-col"><b>${esc(v.name)}</b><span>capacity ${v.capacity}</span></div>`;
      },
      onBeforeEventRender: args => {
        const s = this.schedule?.sessions.find(x => x._id === args.data.id);
        if (s) this.renderEvent(s, args.data);
      },
      onEventClick: args => run(() => this.openSession(String(args.e.data.id))),
      onEventMoved: args => run(() => this.moved(String(args.e.data.id), args.newStart, args.newEnd, args.newResource)),
      onEventResized: args => run(() => this.moved(String(args.e.data.id), args.newStart, args.newEnd, null)),
      onTimeRangeSelected: args => run(() => {
        dp.clearSelection();
        this.openNew({ venue: String(args.resource), day: this.day, start: this.hhmm(args.start), end: this.hhmm(args.end) });
      }),
      // Phones: each empty cell carries its venue + time, so a plain tap can add a session (see listenForTaps).
      // + the current-time line (DayPilot Lite has none): drawn inside the cell that holds "now", in every venue.
      onBeforeCellRender: args => {
        let html = this.touch ? `<i class="wp-cell" data-r="${esc(String(args.cell.resource))}" data-s="${this.hhmm(args.cell.start)}"></i>` : '';
        const at = this.nowIn(args.cell.start.toString(), args.cell.end.toString());
        if (at !== null) html += `<i class="wp-now-line" style="top:${at}%"></i>`;
        if (html) args.cell.properties.html = html;
      }
    });
    dp.init();
    this.dp = dp;
    if (this.touch) this.listenForTaps();
  }

  /**
   * Where "now" falls in a calendar cell ('YYYY-MM-DDTHH:mm:ss' local start / end):
   * a percentage from the cell's top, or null when now isn't in it.
   */
  nowIn(cellStart: string, cellEnd: string, now = new Date()): number | null {
    const n = localIso(now);
    if (n < cellStart || n >= cellEnd) return null;
    const ms = (iso: string) => new Date(iso).getTime();   // parsed as local time
    return Math.round((now.getTime() - ms(cellStart)) / (ms(cellEnd) - ms(cellStart)) * 1000) / 10;
  }

  /** A touch screen (DayPilot only selects time there after a tap-and-hold, which fights with scrolling). */
  private readonly touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

  /**
   * Phones: a short tap (no scroll) on an empty slot opens New session there,
   * one hour long. Desktop keeps drag-to-select.
   */
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
      const cell = (e.target as HTMLElement | null)?.closest?.('.wp-cell') as HTMLElement | null;
      if (!cell || !this.canManage) return;
      this.zone.run(() => this.tapSlot(cell.dataset['r'] || '', cell.dataset['s'] || ''));
    }, { passive: true });
  }

  /** New session at a tapped slot: that venue and time, one hour long (editable in the form). */
  tapSlot(venue: string, start: string): void {
    if (!venue || !/^\d\d:\d\d$/.test(start)) return;
    const [h, m] = start.split(':').map(Number);
    const endMin = Math.min(23 * 60 + 55, h * 60 + m + 60);
    const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
    this.openNew({ venue, day: this.day, start, end });
  }

  /** A session's card on the calendar: title, time, who runs it, registration and overlap. */
  private renderEvent(s: WorkshopSession, data: any): void {
    const st = regState(s);
    const clash = overlapsOf(s, this.schedule!.sessions).length > 0;
    const selected = s._id === this.selectedId;
    const who = (s.facilitatorsOverride?.length ? s.facilitatorsOverride : s.workshop?.facilitators || []).join(', ');
    data.barColor = s.workshop?.category?.colour || '#475569';
    data.backColor = selected ? '#e8f0eb' : '#ffffff';
    data.borderColor = clash ? '#f59e0b' : selected ? '#1E4638' : '#d9e2dc';
    data.html =
      `<div class="wp-ev"><div class="wp-t">${esc(s.workshop?.title || '')}</div>` +
      `<div class="wp-m">${localTime(new Date(s.start))}–${localTime(new Date(s.end))}${who ? ' · ' + esc(who) : ''}</div>` +
      `<div class="wp-chips">` + (s.counts ? `<span class="wp-chip">${s.counts.pre}/${s.preRegLimit || s.venue?.capacity}${s.counts.wait ? ' +' + s.counts.wait : ''}</span>` : '') +
      `<span class="wp-chip ${st}">${st === 'open' ? (s.regManual === true ? 'Reg open' : 'Reg open till ' + localTime(effectiveRegCloses(s)))
        : st === 'soon' ? 'Opens ' + localTime(new Date(s.regOpensAt!)) : 'Reg closed'}</span>` +
      (s.doorManual === false ? '<span class="wp-chip shut">Entry closed</span>' : '') +
      (clash ? '<span class="wp-chip warn">Overlap</span>' : '') + '</div></div>';
  }

  private hhmm(d: DP.Date): string {
    return d.toString('HH:mm');
  }

  /** Redraw the calendar for the day shown. */
  private render(): void {
    if (!this.dp || !this.schedule) return;
    const sc = this.schedule;
    this.dp.update({
      startDate: this.day,
      columns: sc.venues.map(v => ({ id: v._id, name: v.name })),
      events: sc.sessions
        .filter(s => localDate(new Date(s.start)) === this.day)
        .map(s => ({ id: s._id, text: s.workshop?.title || '', start: localIso(new Date(s.start)), end: localIso(new Date(s.end)), resource: s.venue?._id })),
      eventMoveHandling: sc.canManage ? 'Update' : 'Disabled',
      eventResizeHandling: sc.canManage ? 'Update' : 'Disabled',
      timeRangeSelectedHandling: sc.canManage ? 'Enabled' : 'Disabled'
    });
  }

  // ── live (W8) ──────────────────────────────────────────────

  async loadLive(): Promise<void> {
    if (!this.event || document.hidden) return;
    try {
      this.live = (await this.workshopService.getLive(this.event._id)).live;
      this.buildNowRow();
    } catch { /* keep the last figures; the next refresh tries again */ }
  }

  @HostListener('document:visibilitychange')
  onVisible(): void {
    if (!document.hidden) { this.loadLive(); this.tick(); }
  }

  /**
   * Once a minute while the page is visible: the schedule again (fresh list
   * numbers and statuses for the Now row) and the calendar's current-time line.
   */
  tick(): void {
    if (!this.event || document.hidden) return;
    this.load();
  }

  /**
   * The Now row (user, 2026-11-04): always shown — sessions running now, then
   * the rest of today's in start order, scrolling sideways. Stored for the *ngFor.
   */
  private buildNowRow(): void {
    const sc = this.schedule;
    const now = new Date();
    const today = localDate(now);
    if (!sc) { this.nowRow = []; return; }
    const liveById = new Map(this.live.map(l => [l.session, l]));
    this.nowRow = sc.sessions
      .filter(s => s.status === 'scheduled' && new Date(s.end) > now &&
        (new Date(s.start) <= now || localDate(new Date(s.start)) === today))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .map(s => {
        const l = liveById.get(s._id);
        // The live call is fresher (every 30 s) for how many are in.
        const counted = l ? { ...s, counts: { ...(s.counts || { pre: 0, wait: 0, walkin: 0 }), attended: l.attended } } as WorkshopSession : s;
        const st = mapStatusOf(counted, now);
        const capacity = s.venue?.capacity || 0, attended = counted.counts?.attended || 0;
        return {
          id: s._id, title: s.workshop?.title || 'Session', colour: s.workshop?.category?.colour || '#475569',
          venue: s.venue?.name || '', start: s.start, end: s.end, running: new Date(s.start) <= now,
          status: st, attended, capacity, fill: capacity ? Math.min(100, Math.round(attended / capacity * 100)) : 0
        };
      });
  }

  time(iso: string): string { return localTime(new Date(iso)); }

  /** Tap a card in the Now row: show its day and open it. */
  openCard(c: NowCard): void {
    const d = localDate(new Date(c.start));
    if (d !== this.day && this.days.some(x => x.date === d)) { this.day = d; this.render(); }
    this.openSession(c.id);
  }

  // ── data ───────────────────────────────────────────────────

  async load(showId?: string | null): Promise<void> {
    if (!this.event) { this.schedule = null; return; }
    this.loading = true;
    this.loadError = '';
    try {
      const sc = await this.workshopService.getSchedule(this.event._id);
      this.schedule = sc;
      this.setDays(sc);
      const seen = new Map<string, WorkshopCategory>();
      sc.workshops.forEach(w => { if (w.category) seen.set(w.category._id, w.category); });
      this.categories = [...seen.values()];
      if (showId !== undefined) {
        this.panelSession = showId ? sc.sessions.find(s => s._id === showId) || null : null;
        this.selectedId = this.panelSession?._id || null;
      } else if (this.panelSession) {
        this.panelSession = sc.sessions.find(s => s._id === this.panelSession!._id) || null;
      }
      this.render();
      this.buildNowRow();
    } catch {
      this.loadError = 'Could not load the schedule.';
    } finally {
      this.loading = false;
    }
  }

  /** Day tabs from the event's dates (or, without dates, the days that have sessions). */
  private setDays(sc: WorkshopSchedule): void {
    let days = eventDays(sc.event.startDate, sc.event.endDate);
    this.noEventDates = !days.length;
    if (!days.length) {
      const dates = [...new Set(sc.sessions.map(s => localDate(new Date(s.start))))].sort();
      if (!dates.length) dates.push(localDate(new Date()));
      days = dates.map((d, i) => ({
        date: d, sub: `Day ${i + 1}`,
        label: new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
      }));
    }
    this.days = days;
    this.dayCounts = new Map(days.map(d => [d.date, sc.sessions.filter(s => localDate(new Date(s.start)) === d.date).length]));
    if (!days.some(d => d.date === this.day)) {
      const today = localDate(new Date());
      this.day = (days.find(d => d.date === today) || days[0]).date;
    }
  }

  setDay(date: string): void {
    this.day = date;
    this.selectedId = null;
    this.render();
  }

  /** Dragged or resized on the calendar (Workshop TL or above): save, show any warnings. */
  private async moved(id: string, start: DP.Date, end: DP.Date, resource: DP.ResourceId | null): Promise<void> {
    const data: any = { start: toInstant(this.day, this.hhmm(start)), end: toInstant(this.day, this.hhmm(end)) };
    if (resource) data.venue = String(resource);
    // Moved to another time: registration and cut-off move with it, so their order stays valid.
    const old = this.schedule?.sessions.find(s => s._id === id);
    const delta = old ? new Date(data.start).getTime() - new Date(old.start).getTime() : 0;
    if (old && delta) {
      for (const k of ['regOpensAt', 'regClosesAt', 'cutoffAt'] as const) {
        if (old[k]) data[k] = new Date(new Date(old[k]!).getTime() + delta).toISOString();
      }
    }
    try {
      const res = await this.workshopService.updateSession(id, data);
      const msg = res.warnings?.length ? `Moved. ${res.warnings.join('. ')}.` : 'Moved';
      this.notify.openSucessSnackBar(msg);
      await this.load(this.panelOpen && this.panelSession?._id === id ? id : undefined);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not move the session');
      await this.load();   // put it back where it was
    }
  }

  // ── panel ──────────────────────────────────────────────────

  openSession(id: string): void {
    const s = this.schedule?.sessions.find(x => x._id === id);
    if (!s) return;
    this.panelPrefill = null;
    this.panelSession = s;
    this.selectedId = id;
    this.panelOpen = true;
    this.render();
  }

  openNew(prefill?: SessionPrefill): void {
    this.panelSession = null;
    this.panelPrefill = prefill || { day: this.day };
    this.panelOpen = true;
  }

  closePanel(): void {
    this.panelOpen = false;
    this.panelSession = null;
    this.panelPrefill = null;
    if (this.selectedId) { this.selectedId = null; this.render(); }
  }

  /** After add / save / delete / registration switch in the panel. */
  async onChanged(id: string | null): Promise<void> {
    await this.load(id);
    if (id) {
      const s = this.schedule?.sessions.find(x => x._id === id);
      const d = s && localDate(new Date(s.start));
      if (d && d !== this.day && this.days.some(x => x.date === d)) { this.day = d; this.render(); }
    }
  }

  trackDay(_: number, d: PlannerDay) { return d.date; }
  trackCard(_: number, c: NowCard) { return c.id; }
  trackId(_: number, x: { _id: string }) { return x._id; }
}
