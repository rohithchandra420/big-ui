import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { I18nService, TPipe, WordKey } from './core/i18n';
import { Loaded, PublicApiService, PublicEvent, PublicSession, PublicSessionsAnswer } from './core/public-api.service';
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
  imports: [NgIf, NgFor, TPipe, HomeViewComponent, ScheduleViewComponent, SessionSheetComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit, OnDestroy {
  readonly views = VIEWS;
  view: View = 'home';

  event: PublicEvent | null = null;
  sessions: PublicSession[] = [];
  /** The session whose details are open. */
  selected: PublicSession | null = null;
  off = false;
  /** Nothing saved and the server can't be reached. */
  unreachable = false;
  offline = false;
  loadedAt = 0;
  now = Date.now();

  private sub?: Subscription;
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(private api: PublicApiService, public i18n: I18nService) {}

  ngOnInit(): void {
    this.view = this.viewFromHash();
    this.load();
    this.timers.push(setInterval(() => { if (this.visible()) this.load(); }, REFRESH_MS));
    this.timers.push(setInterval(() => this.now = Date.now(), 5000));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.timers.forEach(t => clearInterval(t));
  }

  load(): void {
    this.sub?.unsubscribe();
    // The schedule failing (with nothing saved) must not hide the whole page.
    const sessions$ = this.api.sessions().pipe(
      catchError(() => of<Loaded<PublicSessionsAnswer>>({ data: { off: false, sessions: this.sessions }, at: this.loadedAt || Date.now(), offline: true })));
    this.sub = forkJoin([this.api.event(), sessions$]).subscribe({
      next: ([ev, ss]) => {
        this.unreachable = false;
        this.offline = ev.offline || ss.offline;
        // Offline: show the oldest saved time among the parts that came from the phone.
        const saved = [ev, ss].filter(x => x.offline).map(x => x.at);
        this.loadedAt = saved.length ? Math.min(...saved) : Math.max(ev.at, ss.at);
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
