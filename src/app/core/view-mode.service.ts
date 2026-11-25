import { Injectable, OnDestroy } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Subject, Subscription } from 'rxjs';

/**
 * Phone cards (2026-11-25): on a phone, list pages can show cards instead of
 * the table. Until UAT decides, each page has a Cards / Table switch (in
 * `app-sort-bar`); the choice is kept per page on this device (localStorage),
 * default Cards. Tablets and desktops always get the table.
 *
 * Pages ask `cards('<page>')` in the template; only ONE view is rendered
 * (`*ngIf`), never both.
 */
export type ViewMode = 'cards' | 'table';

/** Phones only: below 768 px. */
export const PHONE_QUERY = '(max-width: 767.98px)';

const STORE_PREFIX = 'big.viewMode.';

@Injectable({ providedIn: 'root' })
export class ViewModeService implements OnDestroy {
  /** True on a phone-width screen (kept current by the breakpoint watcher). */
  isPhone = false;

  /** Fires when the screen crosses the phone width or a page switches Cards / Table (server-paged lists reload). */
  readonly changed$ = new Subject<void>();

  private modes = new Map<string, ViewMode>();
  private sub: Subscription;

  constructor(breakpoints: BreakpointObserver) {
    this.isPhone = breakpoints.isMatched(PHONE_QUERY);
    this.sub = breakpoints.observe(PHONE_QUERY).subscribe(r => {
      if (r.matches === this.isPhone) return;
      this.isPhone = r.matches;
      this.changed$.next();
    });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  /** The page's chosen mode (on a phone). */
  modeOf(page: string): ViewMode {
    let m = this.modes.get(page);
    if (!m) {
      m = this.read(page);
      this.modes.set(page, m);
    }
    return m;
  }

  setMode(page: string, mode: ViewMode): void {
    this.modes.set(page, mode);
    try { localStorage.setItem(STORE_PREFIX + page, mode); } catch { /* private mode / full: keep it for this visit only */ }
    this.changed$.next();
  }

  /** Show cards on this page right now: a phone AND the page set to Cards. */
  cards(page: string): boolean {
    return this.isPhone && this.modeOf(page) === 'cards';
  }

  private read(page: string): ViewMode {
    try {
      return localStorage.getItem(STORE_PREFIX + page) === 'table' ? 'table' : 'cards';
    } catch {
      return 'cards';
    }
  }
}
