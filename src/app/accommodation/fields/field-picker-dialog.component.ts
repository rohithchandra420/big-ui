import { Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { FieldTent, TentField, TentFieldService } from '../tent-field.service';
import { CELL, PathView, TentView, clampZoom, gridPathOf, pathViewsOf, tentViewsOf, typeColors } from './field-draw';
import { fromServer, tentAt } from './field-layout';
import { GridCell } from './field-grid.component';

export interface FieldPickerData {
  eventId: string;
  /** The Tent Pass's tent type: only tents of this type with a free place can be picked. */
  passTypeId: string;
  passTypeName: string;
  /** Gender of the person being allocated, to flag tents with someone of another gender inside. */
  gender?: string | null;
}

/**
 * Tent Fields (B4): Box Office's "Pick on field". Shows the camping fields that
 * have a free tent of this pass's type; tap a tent, check who's in it, choose
 * it. Returns the chosen tent id — the Allocate Tent form then allocates as
 * before (same server checks, same gender confirmation).
 */
@Component({
  selector: 'app-field-picker-dialog',
  templateUrl: './field-picker-dialog.component.html',
  styleUrls: ['./field-picker-dialog.component.css']
})
export class FieldPickerDialogComponent implements OnInit {
  fields: TentField[] = [];
  fieldId = '';
  field: TentField | null = null;
  loadingList = true;
  loadingField = false;
  error = '';

  private tents = new Map<string, FieldTent>();
  private cells: Record<string, string> = {};
  tentViews: TentView[] = [];
  pathViews: PathView[] = [];
  gridPath = '';
  allowed = new Set<string>();
  warn = new Set<string>();
  zoom = 1;
  selected: FieldTent | null = null;

  @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;

  constructor(
    private fieldService: TentFieldService,
    private ref: MatDialogRef<FieldPickerDialogComponent, string>,
    @Inject(MAT_DIALOG_DATA) public data: FieldPickerData
  ) {}

  ngOnInit(): void {
    this.fieldService.list(this.data.eventId).subscribe({
      next: r => {
        this.loadingList = false;
        // Only fields holding this tent type
        this.fields = r.fields.filter(f => (f.types || []).some(t => t.passType === this.data.passTypeId));
        if (this.fields.length) this.pick(this.fields[0]._id);
      },
      error: e => { this.loadingList = false; this.error = e?.error?.message || 'Could not load the fields.'; }
    });
  }

  trackField = (_: number, f: TentField) => f._id;

  pick(id: string): void {
    this.fieldId = id;
    this.selected = null;
    this.loadingField = true;
    this.fieldService.get(id).subscribe({
      next: d => {
        this.loadingField = false;
        this.field = d.field;
        this.tents = new Map(d.tents.map(t => [t._id, t]));
        const layout = fromServer(d.tents, d.field.paths);
        this.cells = layout.cells;
        this.tentViews = tentViewsOf(layout.cells, this.tents, typeColors(this.tents.values()));
        this.pathViews = pathViewsOf(layout.paths);
        this.gridPath = gridPathOf(d.field.rows, d.field.cols);
        this.allowed = new Set(d.tents.filter(t => t.passType?._id === this.data.passTypeId && t.state !== 'full').map(t => t._id));
        const g = this.data.gender;
        this.warn = new Set(g ? [...this.allowed].filter(id => (this.tents.get(id)?.occupants || []).some(o => o.gender && o.gender !== g)) : []);
        setTimeout(() => this.fit());
      },
      error: e => { this.loadingField = false; this.error = e?.error?.message || 'Could not load the field.'; }
    });
  }

  get freeHere(): number { return this.allowed.size; }

  fit(): void {
    const el = this.scroller?.nativeElement;
    if (!el || !this.field) return;
    const w = Math.max(200, el.clientWidth - 16), h = Math.max(200, el.clientHeight - 16);
    this.zoom = clampZoom(Math.min(w / (this.field.cols * CELL), h / (this.field.rows * CELL)));
  }

  zoomBy(f: number): void { this.zoom = clampZoom(this.zoom * f); }

  onDown(g: GridCell): void {
    const id = tentAt({ cells: this.cells, paths: {} }, g.r, g.c);
    this.selected = id && this.allowed.has(id) ? this.tents.get(id) || null : null;
  }

  freeOf(t: FieldTent): number { return Math.max(0, (t.capacity || 1) - (t.occupants || []).length); }
  isWarn(t: FieldTent): boolean { return this.warn.has(t._id); }

  choose(): void {
    if (this.selected) this.ref.close(this.selected._id);
  }

  cancel(): void { this.ref.close(); }
}
