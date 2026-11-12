import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { TentField, TentFieldService } from '../tent-field.service';

/**
 * Accommodation › Fields (Tent Fields, Epic B): the camping fields of the
 * event in the sidebar, each with how full it is. Editors (DEV/DIR/ADMIN)
 * can add a field; opening one shows its layout.
 */
@Component({
  selector: 'app-tent-fields',
  templateUrl: './tent-fields.component.html',
  styleUrls: ['./tent-fields.component.css']
})
export class TentFieldsComponent implements OnInit, OnDestroy {
  readonly MAX = 60;

  eventId = '';
  eventName = '';
  fields: TentField[] = [];
  unplaced = 0;
  canEdit = false;
  loading = false;
  loadError = '';

  adding = false;
  saving = false;
  form = { name: '', rows: 10, cols: 10 };
  formError = '';

  private sub?: Subscription;

  constructor(
    private fieldService: TentFieldService,
    private eventService: EventService,
    private notify: NotificationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.sub = this.eventService.activeEvent.subscribe(ev => {
      this.eventId = ev?._id || '';
      this.eventName = ev?.name || '';
      this.adding = false;
      this.load();
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  trackById = (_: number, f: TentField) => f._id;

  load(): void {
    this.fields = [];
    this.loadError = '';
    if (!this.eventId) return;
    this.loading = true;
    this.fieldService.list(this.eventId).subscribe({
      next: r => { this.fields = r.fields; this.unplaced = r.unplaced; this.canEdit = r.canEdit; this.loading = false; },
      error: e => { this.loading = false; this.loadError = e?.error?.message || 'Could not load the fields.'; }
    });
  }

  /** Bar widths in % (empty / partly / full) — a field with no tents shows an empty bar. */
  share(f: TentField, part: 'empty' | 'partly' | 'full'): number {
    const c = f.counts;
    return c && c.placed ? Math.round((c[part] / c.placed) * 100) : 0;
  }

  open(f: TentField): void {
    this.router.navigate(['/accommodation/fields', f._id]);
  }

  startAdd(): void {
    this.form = { name: '', rows: 10, cols: 10 };
    this.formError = '';
    this.adding = true;
  }

  private sizeOk(n: number): boolean { return Number.isInteger(n) && n >= 1 && n <= this.MAX; }

  create(): void {
    const name = this.form.name.trim();
    const rows = Number(this.form.rows), cols = Number(this.form.cols);
    if (!name) { this.formError = 'Give the field a name.'; return; }
    if (!this.sizeOk(rows) || !this.sizeOk(cols)) { this.formError = `Rows and columns go from 1 to ${this.MAX}.`; return; }
    this.saving = true;
    this.formError = '';
    this.fieldService.create({ event: this.eventId, name, rows, cols }).subscribe({
      next: f => {
        this.saving = false;
        this.adding = false;
        this.notify.openSucessSnackBar(`${f.name} created`);
        this.router.navigate(['/accommodation/fields', f._id], { queryParams: { edit: 1 } });
      },
      error: e => { this.saving = false; this.formError = e?.error?.message || 'Could not create the field.'; }
    });
  }
}
