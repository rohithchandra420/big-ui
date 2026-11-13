import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

/**
 * Slide panel: details that used to expand inline now slide in — from the
 * right on desktop, up from the bottom on phones (≤ 768px). Hand-built
 * overlay (like the Billboard note) so it does not pick up the global green
 * MatDialog title bar. Close with ✕, Esc or a tap outside.
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
export class SlidePanelComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() subtitle = '';
  /** Material Symbols name shown before the title (optional). */
  @Input() icon = '';
  @Output() closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.open) this.close();
  }

  close(): void {
    this.closed.emit();
  }
}
