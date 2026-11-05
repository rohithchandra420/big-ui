import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { PublicSession } from '../core/public-api.service';
import { I18nService, TPipe } from '../core/i18n';
import { timeLabel } from '../core/festival-time';
import { CategoryChip, placesText, statePulse, stateText, stateTone } from '../core/sessions';
import { Change, PlanService } from '../core/plan.service';
import { AlertsService } from '../core/alerts.service';

// Small display pieces for workshop sessions (PH2). Styles live in the app's
// global styles.css (section "Sessions") to keep each component tiny.

const hm = (iso: string, i18n: I18nService) => timeLabel(Date.parse(iso), i18n.lang);

/** The status pill, e.g. a pulsing amber "Registration open at the venue". */
@Component({
  selector: 'pub-status',
  standalone: true,
  imports: [NgIf],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="st" [class]="'st ' + tone"><i class="pulse" *ngIf="pulse"></i>{{ text }}</span>`,
})
export class StatusPillComponent {
  @Input({ required: true }) set session(s: PublicSession) {
    this.tone = stateTone(s);
    this.pulse = statePulse(s);
    this.text = stateText(s, this.i18n);
  }
  tone = 'closed';
  pulse = false;
  text = '';
  constructor(private i18n: I18nService) {}
}

/** ☆ Star = keep in "My plan" on this phone (PH5). Offers alerts after the first star. */
@Component({
  selector: 'pub-star',
  standalone: true,
  imports: [TPipe],
  template: `
    <button type="button" class="star" [class.on]="on" [attr.aria-pressed]="on"
            [attr.aria-label]="(on ? 'plan.remove' : 'plan.add') | t" (click)="toggle($event)">
      <span class="ms" [class.fill]="on">star</span>
    </button>`,
})
export class StarComponent {
  @Input({ required: true }) session!: PublicSession;
  constructor(private plan: PlanService, private alerts: AlertsService) {}
  get on(): boolean { return this.plan.has(this.session.id); }
  toggle(e: Event): void {
    e.stopPropagation();
    if (this.plan.toggle(this.session) && this.alerts.shouldOfferAfterStar()) this.alerts.offer$.next();
  }
}

/** A "Live now" card. */
@Component({
  selector: 'pub-live-card',
  standalone: true,
  imports: [NgIf, TPipe, StatusPillComponent, StarComponent],
  template: `
    <div class="live-card">
      <button type="button" class="live-open" (click)="open.emit(session)">
        <div class="ph" [style.--c1]="session.category?.colour || '#2f6b52'">
          <span class="ms ph-ic">{{ session.category?.icon || 'local_florist' }}</span>
          <span class="badge"><span class="dot"></span>{{ 'live.left' | t: { n: minsLeft } }}</span>
          <span class="cat" *ngIf="session.category">{{ session.category.name }}</span>
        </div>
        <div class="live-body">
          <h3>{{ session.title }}</h3>
          <pub-status [session]="session"></pub-status>
          <div class="meta">
            <span><span class="ms">location_on</span>{{ session.venue }}</span>
            <span><span class="ms">schedule</span>{{ start }}–{{ end }}</span>
          </div>
          <div class="places" *ngIf="places">{{ places }}</div>
        </div>
      </button>
      <pub-star class="on-photo" [session]="session"></pub-star>
    </div>`,
})
export class LiveCardComponent {
  @Input({ required: true }) session!: PublicSession;
  @Input() now = Date.now();
  @Output() open = new EventEmitter<PublicSession>();
  constructor(private i18n: I18nService) {}
  get minsLeft(): number { return Math.max(1, Math.ceil((Date.parse(this.session.end) - this.now) / 60000)); }
  get start(): string { return hm(this.session.start, this.i18n); }
  get end(): string { return hm(this.session.end, this.i18n); }
  get places(): string { return placesText(this.session, this.i18n); }
}

/** A timeline row (Up next / Schedule). */
@Component({
  selector: 'pub-session-row',
  standalone: true,
  imports: [NgIf, NgFor, TPipe, StatusPillComponent, StarComponent],
  template: `
    <div class="tl-row" [style.--dot]="session.category?.colour || '#7d8a82'" [class.over]="over" [class.cancelled]="session.state === 'cancelled'">
      <div class="tl-time">{{ start }}<small>{{ end }}</small></div>
      <div class="tl-card" [class.changed]="changes.length">
        <button type="button" class="tl-main" (click)="open.emit(session)">
          <div class="tl-info">
            <div class="tl-soon" *ngIf="soonMins !== null">{{ 'next.inMin' | t: { n: soonMins } }}</div>
            <h4>{{ session.title }}</h4>
            <pub-status [session]="session"></pub-status>
            <div class="meta">
              <span *ngIf="session.category" [style.color]="session.category.colour"><span class="ms" [style.color]="session.category.colour">{{ session.category.icon }}</span>{{ session.category.name }}</span>
              <span><span class="ms">location_on</span>{{ session.venue }}</span>
              <span *ngIf="places"><span class="ms">event_seat</span>{{ places }}</span>
            </div>
            <div class="chg" *ngFor="let c of changes"><span class="ms">update</span>{{ ('plan.changed.' + c) | t }}</div>
          </div>
        </button>
        <pub-star [session]="session"></pub-star>
      </div>
    </div>`,
})
export class SessionRowComponent {
  @Input({ required: true }) session!: PublicSession;
  @Input() now = Date.now();
  @Output() open = new EventEmitter<PublicSession>();
  constructor(private i18n: I18nService, private plan: PlanService) {}
  /** Changed since the person last looked (starred sessions only, PH5). */
  get changes(): Change[] { return this.plan.changes(this.session); }
  get start(): string { return hm(this.session.start, this.i18n); }
  get end(): string { return hm(this.session.end, this.i18n); }
  get over(): boolean { return this.now >= Date.parse(this.session.end); }
  get places(): string { return placesText(this.session, this.i18n); }
  /** "in 25 min" within the next hour. */
  get soonMins(): number | null {
    const m = Math.ceil((Date.parse(this.session.start) - this.now) / 60000);
    return m > 0 && m <= 60 && this.session.state !== 'cancelled' ? m : null;
  }
}

/** Category filter chips. `value` '' = all. */
@Component({
  selector: 'pub-category-chips',
  standalone: true,
  imports: [NgFor, TPipe],
  template: `
    <div class="filters" role="group">
      <button type="button" class="fchip" [class.on]="value === ''" (click)="pick('')"><span class="ms">apps</span>{{ 'cat.all' | t }}</button>
      <button type="button" class="fchip" *ngFor="let c of categories; trackBy: track" [class.on]="value === c.key"
              [style.--dot]="c.colour" (click)="pick(c.key)"><span class="ms">{{ c.icon }}</span>{{ c.name }}</button>
    </div>`,
})
export class CategoryChipsComponent {
  @Input() categories: CategoryChip[] = [];
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  track = (_: number, c: CategoryChip) => c.key;
  pick(key: string): void { this.value = key; this.valueChange.emit(key); }
}

/** Session details: bottom sheet on phones, centred card on desktop. */
@Component({
  selector: 'pub-session-sheet',
  standalone: true,
  imports: [NgIf, TPipe, StatusPillComponent, StarComponent],
  template: `
    <div class="scrim" (click)="close.emit()"></div>
    <div class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="session.title">
      <div class="grab"></div>
      <button type="button" class="sheet-x" (click)="close.emit()" [attr.aria-label]="'sheet.close' | t"><span class="ms">close</span></button>
      <pub-star class="sheet-star" [session]="session"></pub-star>
      <div class="sheet-cat" *ngIf="session.category" [style.color]="session.category.colour">
        <span class="ms">{{ session.category.icon }}</span>{{ session.category.name }}
      </div>
      <h3>{{ session.title }}</h3>
      <div class="meta">
        <span><span class="ms">schedule</span>{{ day }} · {{ start }}–{{ end }}</span>
        <span><span class="ms">location_on</span>{{ session.venue }}</span>
      </div>
      <pub-status [session]="session"></pub-status>
      <div class="places" *ngIf="places">{{ places }}</div>
      <p class="with" *ngIf="session.facilitators.length">{{ 'sheet.with' | t: { names: session.facilitators.join(', ') } }}</p>
      <p class="desc" *ngIf="session.description">{{ session.description }}</p>
      <dl class="facts">
        <ng-container *ngIf="session.ageLimit"><dt>{{ 'sheet.age' | t }}</dt><dd>{{ session.ageLimit }}</dd></ng-container>
        <ng-container *ngIf="session.language"><dt>{{ 'sheet.language' | t }}</dt><dd>{{ session.language }}</dd></ng-container>
        <ng-container *ngIf="session.bringYourOwn"><dt>{{ 'sheet.bring' | t }}</dt><dd>{{ session.bringYourOwn }}</dd></ng-container>
        <ng-container *ngIf="session.itemsRequired"><dt>{{ 'sheet.items' | t }}</dt><dd>{{ session.itemsRequired }}</dd></ng-container>
      </dl>
    </div>`,
})
export class SessionSheetComponent {
  @Input({ required: true }) session!: PublicSession;
  @Output() close = new EventEmitter<void>();
  constructor(private i18n: I18nService) {}
  get start(): string { return hm(this.session.start, this.i18n); }
  get end(): string { return hm(this.session.end, this.i18n); }
  get places(): string { return placesText(this.session, this.i18n); }
  get day(): string {
    return new Date(this.session.start).toLocaleDateString(this.i18n.lang === 'en' ? 'en-IN' : this.i18n.lang,
      { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
  }
  @HostListener('document:keydown.escape') onEsc(): void { this.close.emit(); }
}
