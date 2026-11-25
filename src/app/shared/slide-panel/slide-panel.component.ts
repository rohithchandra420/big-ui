import {
  Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject
} from '@angular/core';
import { Router } from '@angular/router';

import { BackClosable, panelHistory } from './panel-history';

/**
 * Slide panel: details that used to expand inline now slide in — from the
 * right on desktop, up from the bottom on phones (≤ 768px). Hand-built
 * overlay (like the Billboard note) so it does not pick up the global green
 * MatDialog title bar. Close with ✕, Esc, a tap outside or the Back button
 * (B-086, see `panel-history.ts`).
 *
 * Usage:
 *   <app-slide-panel [open]="!!sel" [title]="sel?.name" [subtitle]="…" (closed)="sel = null">
 *     …content…
 *   </app-slide-panel>
 */
@Component({
  selector: 'app-slide-panel',
  templateUrl: './slide-panel.component.html',
  styleUrls: ['./slide-panel.component.css']
})
export class SlidePanelComponent implements BackClosable, OnChanges, OnDestroy {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle = '';
  /** Material Symbols name shown before the title (optional). */
  @Input() icon = '';
  @Output() closed = new EventEmitter<void>();

  /** Tags this panel's history entry. */
  readonly panelId = panelHistory.newId();

  constructor() {
    panelHistory.useRouter(inject(Router, { optional: true }));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['open']) return;
    if (this.open) panelHistory.add(this);
    else panelHistory.remove(this);
  }

  ngOnDestroy(): void {
    panelHistory.remove(this);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open) this.close();
  }

  close(): void {
    this.closed.emit();
  }

  closedByBack(): void {
    if (this.open) this.closed.emit();
  }
}
