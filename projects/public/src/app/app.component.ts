import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { I18nService, TPipe, WordKey } from './core/i18n';
import { Loaded, PublicApiService, PublicEdition, PublicEvent, PublicHighlightsAnswer, PublicMapAnswer, PublicMapArea, PublicMapPin, PublicNews, PublicNewsAnswer, PublicPhoto, PublicSession, PublicSessionsAnswer } from './core/public-api.service';
import { HighlightsComponent } from './views/highlights-view.component';
import { MapViewComponent } from './views/map-view.component';
import { FindWayComponent } from './ui/find-way.component';
import { EmergencyComponent } from './ui/emergency.component';
import { PlanViewComponent } from './views/plan-view.component';
import { AlertsCardComponent } from './ui/alerts-card.component';
import { PlanService } from './core/plan.service';
import { AlertsService } from './core/alerts.service';
import { NewsTickerComponent } from './ui/news-ticker.component';
import { NewsViewComponent } from './views/news-view.component';
import { countdown, dayLabel, dayStart, timeLabel } from './core/festival-time';
import { HomeViewComponent } from './views/home-view.component';
import { ScheduleViewComponent } from './views/schedule-view.component';
import { SessionSheetComponent } from './ui/session-bits';

// Public participant page shell (PUBLIC_HOME_CONTEXT.md, PH1; design:
// mocks/mock-public-home-v2.html). Views switch by #hash — never by path,
// because GitHub Pages would answer /live/<path> with the staff app.

export type View = 'home' | 'schedule' | 'map' | 'plan' | 'news';
export const VIEWS: { key: View; icon: string; label: WordKey }[] = [
  { key: 'home', icon: 'home', label: 'nav.home' },
  { key: 'schedule', icon: 'calendar_month', label: 'nav.schedule' },
  { key: 'map', icon: 'map', label: 'nav.map' },
  { key: 'plan', icon: 'star', label: 'nav.plan' },
  { key: 'news', icon: 'campaign', label: 'nav.news' },
];
const SOON: Record<View, WordKey> = {
  home: 'soon.home', schedule: 'soon.schedule', map: 'soon.map', plan: 'soon.plan', news: 'soon.news',
};

/** Refresh every 30 s while the page is on screen. */
export const REFRESH_MS = 30000;

@Component({
  selector: 'pub-root',
  standalone: true,
  imports: [NgIf, NgFor, TPipe, HomeViewComponent, ScheduleViewComponent, SessionSheetComponent, NewsTickerComponent, NewsViewComponent,
            MapViewComponent, FindWayComponent, EmergencyComponent, PlanViewComponent, AlertsCardComponent, HighlightsComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  readonly views = VIEWS;
  view: View = 'home';

  event: PublicEvent | null = null;
  sessions: PublicSession[] = [];
  news: PublicNews[] = [];
  pins: PublicMapPin[] = [];
  areas: PublicMapArea[] = [];
  private mapKey = '';
  photos: PublicPhoto[] = [];
  stats: PublicEdition[] = [];
  private hlKey = '';
  /** The place the Map tab opens on (from a shortcut / the Emergency sheet). */
  mapFocus: string | null = null;
  /** The staff help tile whose text is open. */
  helpOpen: { icon: string; title: string; text: string } | null = null;
  /** The session whose details are open. */
  selected: PublicSession | null = null;
  off = false;
  /** Nothing saved and the server can't be reached. */
  unreachable = false;
  offline = false;
  loadedAt = 0;
  now = Date.now();

  private sub?: Subscription;
  private sub2?: Subscription;
  private timers: ReturnType<typeof setInterval>[] = [];

  /** PH5: the one-time alerts offer after the first star. */
  offerAlerts = false;

  constructor(private api: PublicApiService, public i18n: I18nService, private plan: PlanService, private alerts: AlertsService) {}

  get planCount(): number { return this.plan.count; }

  ngOnInit(): void {
    this.view = this.viewFromHash();
    this.load();
    this.alerts.init();
    this.sub2 = this.alerts.offer$.subscribe(() => this.offerAlerts = true);
    this.timers.push(setInterval(() => { if (this.visible()) this.load(); }, REFRESH_MS));
    this.timers.push(setInterval(() => this.now = Date.now(), 5000));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.sub2?.unsubscribe();
    this.timers.forEach(t => clearInterval(t));
  }

  load(): void {
    this.sub?.unsubscribe();
    // The schedule failing (with nothing saved) must not hide the whole page.
    const sessions$ = this.api.sessions().pipe(
      catchError(() => of<Loaded<PublicSessionsAnswer>>({ data: { off: false, sessions: this.sessions }, at: this.loadedAt || Date.now(), offline: true })));
    // Same for the news (PH3).
    const news$ = this.api.news().pipe(
      catchError(() => of<Loaded<PublicNewsAnswer>>({ data: { off: false, news: this.news }, at: this.loadedAt || Date.now(), offline: true })));
    // …and the map (PH4a).
    const map$ = this.api.map().pipe(
      catchError(() => of<Loaded<PublicMapAnswer>>({ data: { off: false, pins: this.pins, areas: this.areas }, at: this.loadedAt || Date.now(), offline: true })));
    // …and the highlights (PH6).
    const hl$ = this.api.highlights().pipe(
      catchError(() => of<Loaded<PublicHighlightsAnswer>>({ data: { off: false, photos: this.photos, stats: this.stats }, at: this.loadedAt || Date.now(), offline: true })));
    this.sub = forkJoin([this.api.event(), sessions$, news$, map$, hl$]).subscribe({
      next: ([ev, ss, nw, mp, hl]) => {
        this.unreachable = false;
        this.offline = ev.offline || ss.offline || nw.offline || mp.offline || hl.offline;
        // Offline: show the oldest saved time among the parts that came from the phone.
        const saved = [ev, ss, nw, mp, hl].filter(x => x.offline).map(x => x.at);
        this.loadedAt = saved.length ? Math.min(...saved) : Math.max(ev.at, ss.at, nw.at, mp.at, hl.at);
        if ('photos' in hl.data && JSON.stringify(hl.data) !== this.hlKey) {
          this.hlKey = JSON.stringify(hl.data);
          this.photos = hl.data.photos;
          this.stats = hl.data.stats;
        }
        this.news = 'news' in nw.data ? nw.data.news : [];
        // Keep the same arrays when nothing changed, so the map isn't redrawn every 30 s.
        if ('pins' in mp.data && JSON.stringify(mp.data) !== this.mapKey) {
          this.mapKey = JSON.stringify(mp.data);
          this.pins = mp.data.pins;
          this.areas = mp.data.areas;
        }
        this.now = Date.now();
        this.off = ev.data.off;
        this.event = ev.data.off ? null : ev.data as PublicEvent;
        this.sessions = 'sessions' in ss.data ? ss.data.sessions : [];
        // Keep an open details sheet showing the fresh copy of its session.
        if (this.selected) this.selected = this.sessions.find(s => s.id === this.selected!.id) || null;
      },
      error: () => this.unreachable = true,
    });
  }

  openSession(s: PublicSession): void { this.selected = s; }
  closeSession(): void { this.selected = null; }

  /** Open the Map tab, optionally on one place (PH4a). */
  openMap(placeId: string | null): void {
    this.go('map');
    this.mapFocus = placeId;
  }

  openHelp(h: { icon: string; title: string; text: string }): void { this.helpOpen = h; }

  get contacts() { return this.event?.emergency?.contacts || []; }
  get help() { return this.event?.help || []; }

  /** Back on screen after a while (phone unlocked, tab switched back): refresh now. */
  @HostListener('document:visibilitychange')
  onVisible(): void {
    if (this.visible() && Date.now() - this.loadedAt >= REFRESH_MS) this.load();
  }

  @HostListener('window:hashchange')
  onHash(): void {
    this.view = this.viewFromHash();
    window.scrollTo({ top: 0 });
  }

  go(view: View): void {
    this.mapFocus = null;   // a tab opens the plain map; openMap() sets a place after this
    location.hash = view === 'home' ? '' : view;
    this.view = view;
  }

  get soonText(): WordKey { return SOON[this.view]; }
  get viewIcon(): string { return this.view === 'home' ? 'local_florist' : VIEWS.find(v => v.key === this.view)!.icon; }

  get freshText(): string {
    if (this.offline) return this.i18n.t('fresh.offline', { time: timeLabel(this.loadedAt) });
    if (this.event?.phase !== 'during') return this.i18n.t('fresh.ok');
    const secs = Math.max(0, Math.round((this.now - this.loadedAt) / 1000));
    return secs < 5 ? this.i18n.t('fresh.now') : this.i18n.t('fresh.ago', { s: secs });
  }

  /** 1-based number of today among the festival days (0 when not a festival day). */
  get dayNumber(): number {
    return this.event ? this.event.days.indexOf(this.event.today) + 1 : 0;
  }

  get countdown() {
    return countdown(this.event ? dayStart(this.event.startDate) : 0, this.now);
  }

  dayLabel(day: string): string { return dayLabel(day, this.i18n.lang); }

  trackDay = (_: number, day: string) => day;
  trackView = (_: number, v: { key: View }) => v.key;

  private visible(): boolean {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
  }

  private viewFromHash(): View {
    const key = (location.hash || '').replace(/^#\/?/, '') as View;
    return VIEWS.some(v => v.key === key) ? key : 'home';
  }
}
