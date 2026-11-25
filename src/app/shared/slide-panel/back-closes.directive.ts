import { Directive, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { Router } from '@angular/router';

import { BackClosable, panelHistory } from './panel-history';

/**
 * Back button closes a page's own drawer (B-086), like `app-slide-panel`.
 * Put it on an element that is always rendered (the drawer's overlay):
 *
 *   <div class="panel-overlay" [class.open]="panelOpen" (click)="closePanel()"
 *        [appBackCloses]="panelOpen" (backClose)="closePanel()"></div>
 */
@Directive({ selector: '[appBackCloses]' })
export class BackClosesDirective implements BackClosable, OnChanges, OnDestroy {
  /** True while the drawer is open. */
  @Input('appBackCloses') active = false;
  /** Back was pressed while open: close the drawer. */
  @Output() backClose = new EventEmitter<void>();

  readonly panelId = panelHistory.newId();

  constructor() {
    panelHistory.useRouter(inject(Router, { optional: true }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['active']) return;
    if (this.active) panelHistory.add(this);
    else panelHistory.remove(this);
  }

  ngOnDestroy(): void {
    panelHistory.remove(this);
  }

  closedByBack(): void {
    if (this.active) this.backClose.emit();
  }
}
