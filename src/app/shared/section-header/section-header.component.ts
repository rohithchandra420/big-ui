import { ChangeDetectorRef, Component, ElementRef, HostBinding, NgZone, OnDestroy, OnInit, Optional, ViewChild } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatSidenavContent } from '@angular/material/sidenav';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { NavAccessService } from '../../core/nav-access.service';
import { NavHistoryService } from '../../core/nav-history.service';
import { NavSection, NavTab, matchUrl } from '../../core/nav-sections';

/**
 * Navigation Tabs (NAV_TABS_CONTEXT.md): the tab row placed as the last row
 * inside a section page's own header — a thin Back strip on the left edge and
 * the section's pages as tabs. Tabs are plain route links lit from the URL.
 * Hidden when there is no Back and fewer than two tabs.
 * On phones the tab row hides while scrolling down and slides back on scroll up.
 */
@Component({
  selector: 'app-section-header',
  templateUrl: './section-header.component.html',
  styleUrls: ['./section-header.component.css']
})
export class SectionHeaderComponent implements OnInit, OnDestroy {
  section: NavSection | null = null;
  /** Stored list (stable identities) — rebuilt only when the visible tabs change. */
  tabs: NavTab[] = [];
  activePath = '';
  showBack = false;
  backLabel = 'Back';
  @HostBinding('class.tuck') tucked = false;
  moreRight = false;

  @ViewChild('strip') strip?: ElementRef<HTMLElement>;

  private url = '';
  private isMobile = false;
  private lastTop = 0;
  private subs: Subscription[] = [];

  constructor(
    private router: Router,
    private access: NavAccessService,
    private history: NavHistoryService,
    private breakpoints: BreakpointObserver,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    @Optional() private scroller: MatSidenavContent | null
  ) {}

  ngOnInit(): void {
    this.url = this.router.url;
    this.refresh();
    this.subs.push(
      this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd)).subscribe(e => {
        this.url = e.urlAfterRedirects;
        this.tucked = false;
        this.lastTop = 0;
        this.refresh();
      }),
      this.access.changed$.subscribe(() => this.refresh()),
      this.breakpoints.observe(['(max-width: 768px)']).subscribe(r => {
        this.isMobile = r.matches;
        if (!r.matches) this.tucked = false;
      })
    );
    if (this.scroller) {
      // CdkScrollable reports outside Angular's zone; re-enter only when the state flips.
      this.subs.push(this.scroller.elementScrolled().subscribe(() => this.onScroll()));
    }
  }

  @HostBinding('class.empty') get empty(): boolean {
    return !this.section || (!this.showBack && this.tabs.length < 2);
  }

  trackByPath = (_: number, t: NavTab) => t.path;

  private refresh(): void {
    const m = matchUrl(this.url);
    this.section = m ? m.section : null;
    const next = this.section ? this.access.visibleTabs(this.section) : [];
    if (next.map(t => t.path).join('|') !== this.tabs.map(t => t.path).join('|')) this.tabs = next;
    this.activePath = m?.tab?.path || '';
    this.showBack = !!this.section && this.history.canGoBack(this.url);
    this.backLabel = m?.detail && m.tab ? `Back to ${m.tab.label}` : 'Back';
    setTimeout(() => { this.centerActive(); this.updateFade(); });
  }

  goBack(): void {
    this.history.back(this.url);
  }

  updateFade(): void {
    const el = this.strip?.nativeElement;
    const more = !!el && el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    if (more !== this.moreRight) { this.moreRight = more; this.cdr.markForCheck(); }
  }

  /** Long tab rows (Hospitality, Admin) scroll sideways; keep the lit tab in view. */
  private centerActive(): void {
    const el = this.strip?.nativeElement;
    const on = el?.querySelector<HTMLElement>('.sec-tab.on');
    if (!el || !on) return;
    if (on.offsetLeft < el.scrollLeft || on.offsetLeft + on.offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2);
    }
  }

  private onScroll(): void {
    if (!this.isMobile || !this.section || !this.scroller) return;
    const top = this.scroller.measureScrollOffset('top');
    let next = this.tucked;
    if (top < 24) next = false;
    else if (top > this.lastTop + 4) next = true;
    else if (top < this.lastTop - 4) next = false;
    this.lastTop = top;
    if (next !== this.tucked) this.zone.run(() => { this.tucked = next; this.cdr.markForCheck(); });
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }
}
