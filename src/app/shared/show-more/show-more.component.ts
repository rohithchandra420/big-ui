import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, ViewChild
} from '@angular/core';

/** How many cards a phone list adds each time (and shows at first). */
export const CARD_STEP = 25;

/**
 * Phone cards (2026-11-25): infinite scroll under a card list (replaces the
 * paginator on phones, so only a few cards render at once). An invisible line
 * after the last card asks for the next 25 (`more`) as it comes into view
 * (a little before, so scrolling doesn't stall). One ask per list length, and
 * none while a server page is loading (`busy`). Without IntersectionObserver
 * a "Show 25 more" button stays as the fallback. Styles: `.pc-more` in styles.css.
 *
 *   <app-show-more [shown]="cards.length" [total]="filtered.length" (more)="showMoreCards()"></app-show-more>
 */
@Component({
  selector: 'app-show-more',
  template: `
    <div class="pc-more" *ngIf="total > 0">
      <div #sentinel class="pc-sentinel" aria-hidden="true"></div>
      <span class="pc-more-spin" *ngIf="shown < total && (busy || pending)" role="status"><mat-icon aria-hidden="true">progress_activity</mat-icon>Loading more…</span>
      <span>Showing {{ shown }} of {{ total }}</span>
      <button type="button" *ngIf="shown < total && !auto" [disabled]="busy" (click)="ask()">
        {{ busy ? 'Loading…' : 'Show ' + nextCount + ' more' }}
      </button>
    </div>`
})
export class ShowMoreComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() shown = 0;
  @Input() total = 0;
  @Input() step = CARD_STEP;
  /** A server-paged list is fetching the next page. */
  @Input() busy = false;
  @Output() more = new EventEmitter<void>();

  /** How long the "Loading more…" spinner shows before the next cards appear (ms), so the jump reads as loading. */
  @Input() delayMs = 1000;

  /** Infinite scroll is on (the browser can watch the end of the list). */
  readonly auto = typeof IntersectionObserver !== 'undefined';

  /** The end was reached: the spinner shows, the next cards come after `delayMs`. */
  pending = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('sentinel') set sentinelRef(ref: ElementRef<HTMLElement> | undefined) {
    const el = ref?.nativeElement || null;
    if (el === this.sentinel) return;
    if (this.sentinel) this.observer?.unobserve(this.sentinel);
    this.sentinel = el;
    if (el) this.observer?.observe(el);
  }

  private sentinel: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;
  private visible = false;
  /** The list length we last asked more for (one ask per length). */
  private askedAt = -1;

  constructor(private zone: NgZone) {}

  get nextCount(): number {
    return Math.min(this.step, this.total - this.shown);
  }

  ngAfterViewInit(): void {
    if (!this.auto) return;
    this.zone.runOutsideAngular(() => {
      this.observer = new IntersectionObserver(entries => {
        this.visible = entries.some(e => e.isIntersecting);
        if (this.visible) this.zone.run(() => this.check());
      }, { rootMargin: '0px 0px 300px 0px' });
      if (this.sentinel) this.observer.observe(this.sentinel);
    });
  }

  /**
   * New length / total / loading state. A new filter (shorter list or a new
   * total) may ask again. Then watch the end afresh: the observer reports again
   * once the browser has laid out the new cards, so a list whose end is still
   * on screen keeps filling, and one whose end moved away stops (never a
   * guess from the old position — that would load the whole list at once).
   */
  ngOnChanges(): void {
    if (this.shown < this.askedAt || this.total !== this.lastTotal) {
      this.askedAt = -1;
      this.cancelPending();   // a new filter: drop a load that was waiting for the old list
    }
    this.lastTotal = this.total;
    if (this.observer && this.sentinel) {
      this.visible = false;
      this.observer.unobserve(this.sentinel);
      this.observer.observe(this.sentinel);
    }
  }

  private lastTotal = 0;

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.cancelPending();
  }

  /** The fallback button: load straight away. */
  ask(): void {
    if (this.busy || this.shown >= this.total) return;
    this.askedAt = this.shown;
    this.more.emit();
  }

  /** End of the list in view: show the spinner, then load (once per list length). */
  private check(): void {
    if (!this.visible || this.busy || this.pending || this.shown >= this.total || this.askedAt === this.shown) return;
    const at = this.shown;
    this.askedAt = at;
    this.pending = true;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.pending = false;
      if (this.shown === at && this.shown < this.total) this.more.emit();
    }, this.delayMs);
  }

  private cancelPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending = false;
  }
}
