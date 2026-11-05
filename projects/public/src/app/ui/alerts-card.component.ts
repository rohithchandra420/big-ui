import { Component, EventEmitter, Input, Output } from '@angular/core';
import { NgIf } from '@angular/common';
import { TPipe } from '../core/i18n';
import { AlertsService } from '../core/alerts.service';

/**
 * "Get festival alerts" (PH5): the Home card (closable), and the one-time
 * offer right after the first star (`offer` = true shows it as a sheet).
 */
@Component({
  selector: 'pub-alerts-card',
  standalone: true,
  imports: [NgIf, TPipe],
  template: `
    <div class="alerts-card" *ngIf="!offer && alerts.showCard">
      <div class="ic"><span class="ms fill">notifications_active</span></div>
      <div class="tx"><b>{{ 'alerts.title' | t }}</b><small>{{ 'alerts.text' | t }}</small></div>
      <button type="button" class="go" (click)="alerts.turnOn()" [disabled]="alerts.busy">{{ 'alerts.on' | t }}</button>
      <button type="button" class="x" (click)="alerts.dismissCard()" [attr.aria-label]="'alerts.notNow' | t"><span class="ms">close</span></button>
    </div>
    <ng-container *ngIf="offer">
      <div class="scrim" (click)="closed.emit()"></div>
      <div class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="'alerts.offerTitle' | t">
        <div class="grab"></div>
        <h3>{{ 'alerts.offerTitle' | t }}</h3>
        <p class="desc">{{ 'alerts.offerText' | t }}</p>
        <div class="offer-row">
          <button type="button" (click)="closed.emit()">{{ 'alerts.notNow' | t }}</button>
          <button type="button" class="go" [disabled]="alerts.busy" (click)="turnOn()">{{ 'alerts.on' | t }}</button>
        </div>
      </div>
    </ng-container>`,
})
export class AlertsCardComponent {
  @Input() offer = false;
  @Output() closed = new EventEmitter<void>();
  constructor(public alerts: AlertsService) {}
  async turnOn(): Promise<void> {
    await this.alerts.turnOn();
    this.closed.emit();
  }
}
