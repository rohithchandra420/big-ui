import { Injectable, OnDestroy } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { NavAccessService } from './nav-access.service';
import { NavSection, SectionKey, matchUrl } from './nav-sections';

const KEY = 'navLastTab';

/**
 * Navigation Tabs: remembers the last tab used in each section (this browser
 * only) and how many pages deep the person is inside the app, for the smart
 * Back button: a detail page goes up to its parent tab; any other page goes
 * to the previous page in the app; with neither, Back is hidden.
 */
@Injectable({ providedIn: 'root' })
export class NavHistoryService implements OnDestroy {
  /** Pages behind the current one inside this app (0 = first page, or after a refresh). */
  private depth = 0;
  private started = false;
  private pendingPop = false;
  private pendingReplace = false;
  private last: Partial<Record<SectionKey, string>> = {};
  private sub: Subscription;

  constructor(private router: Router, private location: Location, private access: NavAccessService) {
    this.last = this.read();
    this.sub = this.router.events.subscribe(e => {
      if (e instanceof NavigationStart) {
        this.pendingPop = e.navigationTrigger === 'popstate';
        this.pendingReplace = !!this.router.getCurrentNavigation()?.extras?.replaceUrl;
      } else if (e instanceof NavigationEnd) {
        this.onEnd(e.urlAfterRedirects);
      }
    });
  }

  private onEnd(url: string): void {
    if (!this.started) {
      this.started = true;
      this.depth = 0;
    } else if (this.pendingPop) {
      this.depth = Math.max(0, this.depth - 1);
    } else if (!this.pendingReplace) {
      this.depth++;
    }
    const m = matchUrl(url);
    if (m && m.tab && !m.detail) {
      this.last = { ...this.last, [m.section.key]: m.tab.path };
      this.write();
    }
  }

  /** Back is shown on a detail page, or when there is an earlier page in this app. */
  canGoBack(url: string): boolean {
    return !!matchUrl(url)?.detail || this.depth > 0;
  }

  back(url: string): void {
    const m = matchUrl(url);
    if (m?.detail && m.tab) {
      this.router.navigateByUrl(m.tab.path);
    } else if (this.depth > 0) {
      this.location.back();
    }
  }

  /** Where a sidebar section link goes: the last tab used there if still allowed, else the first allowed tab. */
  sectionLink(section: NavSection): string {
    const tabs = this.access.visibleTabs(section);
    const remembered = this.last[section.key];
    if (remembered && tabs.some(t => t.path === remembered)) return remembered;
    return tabs[0]?.path || section.tabs[0].path;
  }

  private read(): Partial<Record<SectionKey, string>> {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch {
      return {};
    }
  }

  private write(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.last)); } catch { /* private mode: not remembered */ }
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
