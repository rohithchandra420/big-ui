import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

import { CELL, PathView, TentView } from './field-draw';

export interface GridCell { r: number; c: number; ev: PointerEvent; }

/**
 * Tent Fields — the drawn field (SVG): faint squares, walkways, and tents as
 * small houses with their number. Reports which square was pressed; the page
 * using it decides what that means. Shared by the field page and Box Office's
 * "Pick on field" picker.
 */
@Component({
  selector: 'app-field-grid',
  templateUrl: './field-grid.component.html',
  styleUrls: ['./field-grid.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FieldGridComponent {
  readonly CELL = CELL;

  @Input() rows = 1;
  @Input() cols = 1;
  @Input() name = '';
  @Input() tents: TentView[] = [];
  @Input() paths: PathView[] = [];
  @Input() gridPath = '';
  @Input() zoom = 1;
  @Input() editing = false;
  @Input() selectedId = '';
  @Input() matchIds: string[] = [];
  /** When set, only these tents can be picked; the others are faded. */
  @Input() allowed: Set<string> | null = null;
  /** Tents to mark with an amber dot (e.g. someone of another gender inside). */
  @Input() warn: Set<string> | null = null;

  @Output() cellDown = new EventEmitter<GridCell>();
  @Output() cellMove = new EventEmitter<GridCell>();

  @ViewChild('svg') svg?: ElementRef<SVGSVGElement>;

  get width(): number { return this.cols * CELL; }
  get height(): number { return this.rows * CELL; }
  /** Numbers are drawn only when a square is big enough to read them. */
  get showLabels(): boolean { return CELL * this.zoom >= 26; }

  trackKey = (_: number, v: { key: string }) => v.key;

  isMatch(id: string): boolean { return this.matchIds.includes(id); }
  isFaded(id: string): boolean { return !!this.allowed && !this.allowed.has(id); }
  isWarn(id: string): boolean { return !!this.warn && this.warn.has(id); }

  private cellFrom(ev: PointerEvent): [number, number] | null {
    const svg = this.svg?.nativeElement;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const c = Math.floor((ev.clientX - box.left) / box.width * this.cols);
    const r = Math.floor((ev.clientY - box.top) / box.height * this.rows);
    return r >= 0 && c >= 0 && r < this.rows && c < this.cols ? [r, c] : null;
  }

  onDown(ev: PointerEvent): void {
    const cell = this.cellFrom(ev);
    if (!cell) return;
    if (this.editing) {
      ev.preventDefault();
      this.svg?.nativeElement.setPointerCapture?.(ev.pointerId);
    }
    this.cellDown.emit({ r: cell[0], c: cell[1], ev });
  }

  onMove(ev: PointerEvent): void {
    if (!this.editing) return;
    const cell = this.cellFrom(ev);
    if (cell) this.cellMove.emit({ r: cell[0], c: cell[1], ev });
  }
}
