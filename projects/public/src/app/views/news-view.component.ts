import { Component, Input } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { PublicNews } from '../core/public-api.service';
import { I18nService, TPipe } from '../core/i18n';
import { NEWS_STYLE, agoText } from '../core/news';

/** News tab (PH3): every post of the event, newest first; Urgent in red. */
@Component({
  selector: 'pub-news-view',
  standalone: true,
  imports: [NgIf, NgFor, TPipe],
  template: `
    <section>
      <div class="sec-head"><h2>{{ 'news.title' | t }}</h2><span class="hand">{{ 'news.hand' | t }}</span></div>
      <div class="feed" *ngIf="news.length">
        <article class="post" *ngFor="let n of news; trackBy: track" [class.urgent]="n.type === 'urgent'" [style.--dot]="style(n).colour">
          <div class="post-ic"><span class="ms">{{ style(n).icon }}</span></div>
          <div class="post-body">
            <div class="post-tag">{{ style(n).word | t }}</div>
            <h3>{{ n.title }}</h3>
            <p>{{ n.message }}</p>
            <small>{{ ago(n) }}</small>
          </div>
        </article>
      </div>
      <div class="empty" *ngIf="!news.length"><span class="ms">campaign</span>{{ 'news.empty' | t }}</div>
    </section>`,
})
export class NewsViewComponent {
  @Input() news: PublicNews[] = [];
  @Input() now = Date.now();
  constructor(private i18n: I18nService) {}
  track = (_: number, n: PublicNews) => n.id;
  style(n: PublicNews) { return NEWS_STYLE[n.type] || NEWS_STYLE.general; }
  ago(n: PublicNews): string { return agoText(n.at, this.now, this.i18n); }
}
