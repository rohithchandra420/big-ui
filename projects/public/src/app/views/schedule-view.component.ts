import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { PublicEvent, PublicSession } from '../core/public-api.service';
import { I18nService, TPipe } from '../core/i18n';
import { dayLabel } from '../core/festival-time';
import { CategoryChip, categoriesOf, festivalDay } from '../core/sessions';
import { CategoryChipsComponent, SessionRowComponent } from '../ui/session-bits';

/** Schedule tab (PH2): pick a festival day, filter by category, the whole day. */
@Component({
  selector: 'pub-schedule-view',
  standalone: true,
  imports: [NgIf, NgFor, TPipe, SessionRowComponent, CategoryChipsComponent],
  template: `
    <section>
      <div class="sec-head"><h2>{{ 'sched.title' | t }}</h2><span class="hand">{{ 'sched.hand' | t }}</span></div>
      <div class="day-pick" role="group">
        <button type="button" *ngFor="let d of event.days; let i = index; trackBy: trackDay" [class.on]="d === day" (click)="setDay(d)">
          {{ 'hero.day' | t: { n: i + 1 } }}<small>{{ label(d) }}</small>
        </button>
      </div>
      <pub-category-chips *ngIf="categories.length > 1" [categories]="categories" [value]="category" (valueChange)="setCategory($event)"></pub-category-chips>
      <div class="timeline" *ngIf="shown.length">
        <pub-session-row *ngFor="let s of shown; trackBy: track" [session]="s" [now]="now" (open)="open.emit($event)"></pub-session-row>
      </div>
      <div class="empty" *ngIf="!shown.length"><span class="ms">event_busy</span>{{ 'sched.empty' | t }}</div>
    </section>`,
})
export class ScheduleViewComponent implements OnChanges {
  @Input({ required: true }) event!: PublicEvent;
  @Input() sessions: PublicSession[] = [];
  @Input() now = Date.now();
  @Output() open = new EventEmitter<PublicSession>();

  day = '';
  category = '';
  ofDay: PublicSession[] = [];
  shown: PublicSession[] = [];
  categories: CategoryChip[] = [];

  constructor(private i18n: I18nService) {}

  track = (_: number, s: PublicSession) => s.id;
  trackDay = (_: number, d: string) => d;
  label(d: string): string { return dayLabel(d, this.i18n.lang); }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.day || !this.event.days.includes(this.day)) {
      this.day = this.event.days.includes(this.event.today) ? this.event.today : this.event.days[0];
    }
    if (changes['sessions'] || changes['event']) this.build();
  }

  setDay(d: string): void {
    this.day = d;
    this.build();
  }

  setCategory(key: string): void {
    this.category = key;
    this.filter();
  }

  private build(): void {
    this.ofDay = this.sessions.filter(s => festivalDay(s.start) === this.day)
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    this.categories = categoriesOf(this.ofDay);
    if (this.category && !this.categories.some(c => c.key === this.category)) this.category = '';
    this.filter();
  }

  private filter(): void {
    this.shown = this.category ? this.ofDay.filter(s => s.category?.name === this.category) : this.ofDay;
  }
}
