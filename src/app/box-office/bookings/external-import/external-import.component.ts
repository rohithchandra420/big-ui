import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import {
  BoxOfficeService, ExternalImportError, ExternalImportResult, ExternalImportUnknownPassType
} from '../../box-office.service';
import { EventService } from '../../../core/event.service';
import { NotificationService } from '../../../core/notification.service';
import { PassCategory } from '../../../models/ticket.model';
import { MAX_BEDS } from '../bulk-upload/bulk-upload.component';

/** A missing pass type, as the person will create it (editable). */
interface PassTypeDraft {
  key: string;
  externalCode: string | null;
  name: string;
  category: PassCategory;
  beds: number;
  rows: number[];
}

interface CategoryOption { value: PassCategory; label: string; }

/** Stored list (stable identities for app-option). */
const CATEGORY_OPTIONS: CategoryOption[] = [
  { value: 'festival', label: 'Festival Pass' },
  { value: 'tent', label: 'Tent / stay' },
  { value: 'addon', label: 'Add-on' }
];

type Step = 'pick' | 'checking' | 'preview' | 'importing' | 'done';

/**
 * External Booking Import (I2, BOOKING_INGESTION_CONTEXT.md): bookings from
 * the sales system as a .csv / .xlsx file, in a slide panel (side on desktop,
 * bottom sheet on phones). Pick a file → the server checks it (saves nothing)
 * → Import → report. Pass types the event doesn't have block the import; top
 * roles can create them here (pre-filled from the file, editable), anyone
 * else is told to ask an admin. Same people as Bulk Upload.
 */
@Component({
  selector: 'app-external-import',
  templateUrl: './external-import.component.html',
  styleUrls: ['./external-import.component.css']
})
export class ExternalImportComponent implements OnChanges {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  /** Bookings were created (the page reloads its list). */
  @Output() imported = new EventEmitter<number>();

  readonly categoryOptions = CATEGORY_OPTIONS;
  readonly maxBeds = MAX_BEDS;

  step: Step = 'pick';
  file: File | null = null;
  dragOver = false;
  preview: ExternalImportResult | null = null;
  report: ExternalImportResult | null = null;
  drafts: PassTypeDraft[] = [];
  creatingPassTypes = false;

  constructor(
    private boxOffice: BoxOfficeService,
    private eventService: EventService,
    private notify: NotificationService
  ) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) this.reset();
  }

  reset(): void {
    this.step = 'pick';
    this.file = null;
    this.preview = null;
    this.report = null;
    this.drafts = [];
    this.creatingPassTypes = false;
  }

  close(): void {
    this.closed.emit();
  }

  get canCreatePassTypes(): boolean {
    return !!this.preview?.canCreatePassTypes;
  }

  /** Missing pass types this person can't create: the import stays blocked. */
  get blocked(): boolean {
    return this.drafts.length > 0 && !this.canCreatePassTypes;
  }

  get draftsValid(): boolean {
    return this.drafts.every(d => d.name.trim() && (d.category !== 'tent' || (d.beds >= 1 && d.beds <= MAX_BEDS)));
  }

  get canImport(): boolean {
    return this.step === 'preview' && !!this.preview && !this.blocked && this.draftsValid
      && (this.preview.toCreate > 0 || this.drafts.length > 0);
  }

  get importLabel(): string {
    if (this.step === 'importing') return this.creatingPassTypes ? 'Creating pass types…' : 'Importing…';
    const n = this.drafts.length;
    return n ? `Create ${n} pass type${n === 1 ? '' : 's'} & import` : 'Import';
  }

  trackDraft(_: number, d: PassTypeDraft): string { return d.key; }
  trackCategory(_: number, o: CategoryOption): string { return o.value; }
  trackError(i: number, e: ExternalImportError): string { return (e.reference || '') + ':' + i; }

  rowsText(rows: number[]): string {
    if (!rows?.length) return '';
    return (rows.length === 1 ? 'Row ' : 'Rows ') + rows.join(', ');
  }

  setBeds(d: PassTypeDraft, value: unknown): void {
    const n = Math.round(Number(value));
    d.beds = Math.min(MAX_BEDS, Math.max(1, Number.isFinite(n) && n > 0 ? n : 1));
  }

  // ── File pick ──

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = ''; // picking the same file again re-checks it
    if (file) this.pick(file);
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); this.dragOver = true; }
  onDragLeave(event: DragEvent): void { event.preventDefault(); this.dragOver = false; }
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) this.pick(file);
  }

  pick(file: File): void {
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      this.notify.openErrorSnackBar('Pick a .csv or .xlsx file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.notify.openErrorSnackBar('The file is larger than 5 MB');
      return;
    }
    this.file = file;
    this.check();
  }

  private form(): FormData | null {
    const event = this.eventService.currentActiveEvent;
    if (!event || !this.file) {
      this.notify.openErrorSnackBar('No event selected');
      return null;
    }
    const form = new FormData();
    form.append('eventId', event._id);
    form.append('file', this.file);
    return form;
  }

  /** Asks the server what the import would do (saves nothing). */
  check(): void {
    const form = this.form();
    if (!form) return;
    this.step = 'checking';
    this.report = null;
    this.preview = null;
    this.drafts = [];
    this.boxOffice.previewExternalImport(form).subscribe({
      next: (res) => this.showPreview(res),
      error: (err) => {
        this.step = 'pick';
        this.notify.openErrorSnackBar(err?.error?.message || 'The file could not be checked');
      }
    });
  }

  private showPreview(res: ExternalImportResult): void {
    this.preview = res;
    this.drafts = (res.unknownPassTypes || []).map((u: ExternalImportUnknownPassType, i) => ({
      key: (u.externalCode || u.name) + ':' + i,
      externalCode: u.externalCode,
      name: u.name,
      category: u.category,
      beds: u.beds || 1,
      rows: u.rows || []
    }));
    this.step = 'preview';
  }

  // ── Import ──

  runImport(): void {
    if (!this.canImport) return;
    const event = this.eventService.currentActiveEvent;
    if (!event) return;
    this.step = 'importing';

    const create$ = this.drafts.length
      ? forkJoin(this.drafts.map(d => this.eventService.createPassType(event._id, {
          name: d.name.trim(),
          category: d.category,
          ...(d.externalCode ? { externalCode: d.externalCode } : {}),
          ...(d.category === 'tent' ? { beds: d.beds } : {})
        }))).pipe(map(() => true))
      : of(true);
    this.creatingPassTypes = this.drafts.length > 0;

    create$.pipe(catchError((err) => {
      this.step = 'preview';
      this.creatingPassTypes = false;
      this.notify.openErrorSnackBar(err?.error?.message || 'Error creating pass types');
      // Some may have been created: check again so the list is current.
      this.check();
      return of(false);
    })).subscribe(ok => {
      if (!ok) return;
      this.creatingPassTypes = false;
      const form = this.form();
      if (!form) { this.step = 'preview'; return; }
      this.boxOffice.runExternalImport(form).subscribe({
        next: (res) => {
          this.report = res;
          this.step = 'done';
          if (res.created) {
            this.notify.openSucessSnackBar(`${res.created} booking${res.created === 1 ? '' : 's'} imported`);
            this.imported.emit(res.created);
          }
        },
        error: (err) => {
          // 409: a pass type is still missing — show the fresh preview.
          if (err?.status === 409 && err.error?.unknownPassTypes) {
            this.showPreview(err.error);
            this.notify.openErrorSnackBar('Some pass types are not on this event yet');
            return;
          }
          this.step = 'preview';
          this.notify.openErrorSnackBar(err?.error?.message || 'Import failed');
        }
      });
    });
  }
}
