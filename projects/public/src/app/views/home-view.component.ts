import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { PublicEvent, PublicSession } from '../core/public-api.service';
import { TPipe } from '../core/i18n';
import { CategoryChip, categoriesOf, festivalDay, isLive } from '../core/sessions';
import { CategoryChipsComponent, LiveCardComponent, SessionRowComponent } from '../ui/session-bits';

/**
 * Home's sessions (PH2): Live now + Up next (rest of today) with category
 * chips. Before the festival: the first day as a preview. After it: nothing.
 * Lists are rebuilt in ngOnChanges (stable identities for *ngFor).
 */
@Component({
  selector: 'pub-home-view',
  standalone: true,
  imports: [NgIf, NgFor, TPipe, LiveCardComponent, SessionRowComponent, CategoryChipsComponent],
  template: `
    <section *ngIf="live.length">
      <div class="sec-head"><span class="live-dot"></span><h2>{{ 'live.title' | t }}</h2><span class="hand">{{ 'live.hand' | t }}</span></div>
      <div class="rail">
        <pub-live-card *ngFor="let s of live; trackBy: track" [session]="s" [now]="now" (open)="open.emit($event)"></pub-live-card>
      </div>
    </section>

    <section *ngIf="event.phase !== 'after'">
      <div class="sec-head">
        <h2>{{ (event.phase === 'before' ? 'next.preview' : 'next.title') | t }}</h2>
        <span class="hand">{{ 'next.hand' | t }}</span>
        <div class="sp"></div>
        <button type="button" class="lnk" (click)="schedule.emit()">{{ 'next.full' | t }}</button>
      </div>
      <pub-category-chips *ngIf="categories.length > 1" [categories]="categories" [value]="category" (valueChange)="setCategory($event)"></pub-category-chips>
      <div class="timeline" *ngIf="shown.length">
        <pub-session-row *ngFor="let s of shown; trackBy: track" [session]="s" [now]="now" (open)="open.emit($event)"></pub-session-row>
      </div>
      <div class="empty" *ngIf="!shown.length">
        <span class="ms">sentiment_calm</span>{{ (category ? 'next.emptyCat' : 'next.empty') | t }}
      </div>
    </section>`,
})
export class HomeViewComponent implements OnChanges {
  @Input({ required: true }) event!: PublicEvent;
  @Input() sessions: PublicSession[] = [];
  @Input() now = Date.now();
  @Output() open = new EventEmitter<PublicSession>();
  @Output() schedule = new EventEmitter<void>();

  live: PublicSession[] = [];
  next: PublicSession[] = [];
  shown: PublicSession[] = [];
  categories: CategoryChip[] = [];
  category = '';

  track = (_: number, s: PublicSession) => s.id;

  ngOnChanges(): void {
    const ev = this.event;
    if (ev.phase === 'after') {
      this.live = []; this.next = [];
    } else if (ev.phase === 'before') {
      this.live = [];
      this.next = this.sessions.filter(s => festivalDay(s.start) === ev.days[0]);
    } else {
      this.live = this.sessions.filter(s => isLive(s, this.now));
      this.next = this.sessions.filter(s => festivalDay(s.start) === ev.today && Date.parse(s.start) > this.now);
    }
    this.categories = categoriesOf(this.next);
    if (this.category && !this.categories.some(c => c.key === this.category)) this.category = '';
    this.filter();
  }

  setCategory(key: string): void {
    this.category = key;
    this.filter();
  }

  private filter(): void {
    this.shown = this.category ? this.next.filter(s => s.category?.name === this.category) : this.next;
  }
}
