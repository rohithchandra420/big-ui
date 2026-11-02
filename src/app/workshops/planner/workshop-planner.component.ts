import { AfterViewInit, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import type { DayPilot as DP } from '@daypilot/daypilot-lite-javascript';
import { EventService } from '../../core/event.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';
import { WorkshopService } from '../workshop.service';
import { LiveSession, WorkshopCategory, WorkshopSchedule, WorkshopSession } from '../workshops.model';
import { PlannerDay, esc, eventDays, localDate, localIso, localTime, overlapsOf, regState, toInstant } from '../planner.utils';
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
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    if (this.liveTimer) clearInterval(this.liveTimer);
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
      })
    });
    dp.init();
    this.dp = dp;
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
      `<span class="wp-chip ${st}">${st === 'open' ? 'Reg open' : st === 'soon' ? 'Opens ' + localTime(new Date(s.regOpensAt!)) : 'Reg closed'}</span>` +
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
    } catch { /* keep the last figures; the next refresh tries again */ }
  }

  @HostListener('document:visibilitychange')
  onVisible(): void {
    if (!document.hidden) this.loadLive();
  }

  /** Share of the venue's capacity in use, for the meter (capped at 100). */
  fill(l: LiveSession): number {
    return l.venue.capacity ? Math.min(100, Math.round(l.attended / l.venue.capacity * 100)) : 0;
  }

  time(iso: string): string { return localTime(new Date(iso)); }

  /** Tap a live session: show its day and open it. */
  openLive(l: LiveSession): void {
    const d = localDate(new Date(l.start));
    if (d !== this.day && this.days.some(x => x.date === d)) { this.day = d; this.render(); }
    this.openSession(l.session);
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
  trackLive(_: number, l: LiveSession) { return l.session; }
  trackId(_: number, x: { _id: string }) { return x._id; }
}
