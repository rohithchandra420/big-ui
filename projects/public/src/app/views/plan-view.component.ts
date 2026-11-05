import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Subscription } from 'rxjs';
import { PublicSession } from '../core/public-api.service';
import { TPipe } from '../core/i18n';
import { PlanService } from '../core/plan.service';
import { AlertsService } from '../core/alerts.service';
import { SessionRowComponent } from '../ui/session-bits';

/**
 * My plan tab (PH5): the sessions starred on this phone, in time order, with
 * "time / place / status changed" marks. The marks clear when the person
 * leaves the tab (they've seen them). Also where alerts are turned on / off.
 */
@Component({
  selector: 'pub-plan-view',
  standalone: true,
  imports: [NgIf, NgFor, TPipe, SessionRowComponent],
  template: `
    <section>
      <div class="sec-head"><h2>{{ 'plan.title' | t }}</h2><span class="hand">{{ 'plan.hand' | t }}</span></div>
      <div class="alerts-line" *ngIf="alerts.state === 'on'">
        <span class="ms fill">notifications_active</span>{{ 'alerts.isOn' | t }}
        <button type="button" (click)="alerts.turnOff()">{{ 'alerts.off' | t }}</button>
      </div>
      <div class="alerts-line" *ngIf="alerts.state === 'off'">
        <span class="ms">notifications</span>{{ 'alerts.title' | t }}
        <button type="button" (click)="alerts.turnOn()" [disabled]="alerts.busy">{{ 'alerts.on' | t }}</button>
      </div>
      <p class="map-note" *ngIf="alerts.state === 'blocked'">{{ 'alerts.blocked' | t }}</p>
      <p class="map-note" *ngIf="alerts.state === 'ios-install'">{{ 'alerts.ios' | t }}</p>

      <div class="timeline" *ngIf="mine.length">
        <pub-session-row *ngFor="let s of mine; trackBy: track" [session]="s" [now]="now" (open)="open.emit($event)"></pub-session-row>
      </div>
      <div class="empty" *ngIf="!mine.length"><span class="ms">star</span>{{ 'plan.empty' | t }}</div>
    </section>`,
})
export class PlanViewComponent implements OnInit, OnChanges, OnDestroy {
  @Input() sessions: PublicSession[] = [];
  @Input() now = Date.now();
  @Output() open = new EventEmitter<PublicSession>();
  mine: PublicSession[] = [];
  private sub?: Subscription;

  constructor(public alerts: AlertsService, private plan: PlanService) {}

  track = (_: number, s: PublicSession) => s.id;

  ngOnInit(): void { this.sub = this.plan.starred$.subscribe(() => this.build()); }
  ngOnChanges(): void { this.build(); }

  /** Leaving the tab = the changes were seen. */
  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.plan.markSeen(this.mine);
  }

  private build(): void {
    this.mine = this.sessions.filter(s => this.plan.has(s.id)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
}
