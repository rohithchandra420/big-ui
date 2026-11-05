import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output } from '@angular/core';
import { NgIf } from '@angular/common';
import { PublicNews } from '../core/public-api.service';
import { TPipe } from '../core/i18n';
import { NEWS_STYLE, tickerNews } from '../core/news';

/** Seconds each post stays in the ticker. */
export const TICK_MS = 4500;

/**
 * Home's rotating news strip (PH3): posts of the last 24 hours, recent Urgent
 * ones first; hidden when there are none. Tap → the News tab.
 */
@Component({
  selector: 'pub-news-ticker',
  standalone: true,
  imports: [NgIf, TPipe],
  template: `
    <button type="button" class="ticker" *ngIf="current as n" [class.urgent]="n.type === 'urgent'" (click)="all.emit()"
            [attr.aria-label]="n.title">
      <span class="ticker-tag">{{ style(n).word | t }}</span>
      <span class="ticker-msg">{{ n.title }}</span>
      <span class="ticker-more">{{ 'news.all' | t }}<span class="ms">chevron_right</span></span>
    </button>`,
})
export class NewsTickerComponent implements OnChanges, OnDestroy {
  @Input() news: PublicNews[] = [];
  @Input() now = Date.now();
  @Output() all = new EventEmitter<void>();

  items: PublicNews[] = [];
  index = 0;
  private timer?: ReturnType<typeof setInterval>;

  get current(): PublicNews | null { return this.items.length ? this.items[this.index % this.items.length] : null; }

  style(n: PublicNews) { return NEWS_STYLE[n.type] || NEWS_STYLE.general; }

  ngOnChanges(): void {
    const keep = this.current?.id;
    this.items = tickerNews(this.news, this.now);
    const at = this.items.findIndex(n => n.id === keep);
    this.index = at >= 0 ? at : 0;
    clearInterval(this.timer);
    if (this.items.length > 1) this.timer = setInterval(() => this.index = (this.index + 1) % this.items.length, TICK_MS);
  }

  ngOnDestroy(): void { clearInterval(this.timer); }
}
