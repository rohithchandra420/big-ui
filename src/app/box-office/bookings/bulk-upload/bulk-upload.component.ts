import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { forkJoin, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';

import { BoxOfficeService } from '../../box-office.service';
import { NotificationService } from '../../../core/notification.service';
import { EventService } from '../../../core/event.service';
import { PassTypeCategory } from '../../../models/event.model';

interface FilePreview {
  rowCount: number;
  orderIds: number[];
  itemNames: string[];
}

const CATEGORIES: PassTypeCategory[] = ['festival', 'tent', 'addon'];

/**
 * Bulk-imports pre-existing external orders (e.g. from a partner/agent) via
 * Excel — row-per-shopcart-item, grouped into one Ticket per order_id. Same
 * column format and grouping logic as the old BoxOfficeComponent's importer
 * (see excelUpload.js), but posts to the Box Office duplicate endpoint
 * (/box-office/uploadExcel) which validates rows and checks for order_id
 * collisions server-side, rather than the old client-side, position-based
 * pre-check. Presented as a dialog (drag-and-drop or click-to-select) rather
 * than the inline-swap pattern used elsewhere in Box Office — a quick,
 * self-contained action doesn't need to take over the page the way the
 * multi-step Counter Form/Allocate Tent flows do.
 *
 * Workbooks with more than one sheet show a sheet picker (defaulting to the
 * first sheet) — only the selected sheet is parsed for the preview and sent
 * to the backend; single-sheet files skip the picker entirely.
 *
 * Introducing Events: item names in the file are matched against the active
 * event's real PassTypes server-side — an unrecognized name blocks the
 * upload. Rather than send staff away to Admin > Events and back, this
 * cross-checks item names against the event's PassTypes as soon as the file
 * is parsed (before Upload is even clicked), and lets staff confirm +
 * categorize any unrecognized ones right here — "Create N Pass Types &
 * Upload" creates them (via the same endpoint Admin > Events uses), then
 * proceeds with the upload. PassTypes are still never created silently —
 * a human always sees the exact list and picks each category explicitly
 * (pre-guessed from the name, always overridable), matching the same
 * "no side-effect creation" principle, just moved earlier in the flow.
 */
@Component({
  selector: 'app-bulk-upload',
  templateUrl: './bulk-upload.component.html',
  styleUrls: ['./bulk-upload.component.css']
})
export class BulkUploadComponent implements OnInit {

  selectedFile: File | null = null;
  preview: FilePreview | null = null;
  uploading = false;
  dragOver = false;

  sheetNames: string[] = [];
  selectedSheetName: string | null = null;
  private workbook: any = null;

  validationErrors: string[] = [];
  duplicateOrderIds: number[] = [];

  readonly categories = CATEGORIES;
  private existingPassTypeNames: Set<string> | null = null;
  unknownPassNames: string[] = [];
  newPassTypeCategories: { [name: string]: PassTypeCategory } = {};

  constructor(
    private dialogRef: MatDialogRef<BulkUploadComponent>,
    private boxOfficeService: BoxOfficeService,
    private notificationService: NotificationService,
    private eventService: EventService
  ) { }

  ngOnInit() {
    const activeEvent = this.eventService.currentActiveEvent;
    if (!activeEvent) return;
    this.eventService.getEventDetail(activeEvent._id).subscribe({
      next: (detail) => {
        this.existingPassTypeNames = new Set(detail.passTypes.map(pt => pt.name));
        this.recomputeUnknownPassNames();
      },
      error: () => this.notificationService.openErrorSnackBar('Error loading pass types for this event')
    });
  }

  private recomputeUnknownPassNames() {
    if (!this.preview || !this.existingPassTypeNames) {
      this.unknownPassNames = [];
      return;
    }
    const existing = this.existingPassTypeNames;
    this.unknownPassNames = this.preview.itemNames.filter(name => !existing.has(name));
    this.newPassTypeCategories = {};
    this.unknownPassNames.forEach(name => {
      this.newPassTypeCategories[name] = /tent/i.test(name) ? 'tent' : 'festival';
    });
  }

  onFileInputChange(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (file) {
      this.handleFile(file);
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.dragOver = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.dragOver = false;
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) {
      this.handleFile(file);
    }
  }

  private handleFile(file: File) {
    this.selectedFile = file;
    this.preview = null;
    this.sheetNames = [];
    this.selectedSheetName = null;
    this.workbook = null;
    this.validationErrors = [];
    this.duplicateOrderIds = [];
    this.unknownPassNames = [];
    this.newPassTypeCategories = {};

    if (!file.name.endsWith('.xlsx')) {
      this.notificationService.openErrorSnackBar('Only .xlsx files are supported');
      this.selectedFile = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: any) => {
      import('xlsx').then(XLSX => {
        const data = new Uint8Array(e.target.result);
        this.workbook = XLSX.read(data, { type: 'array' });
        this.sheetNames = this.workbook.SheetNames;
        this.selectSheet(this.sheetNames[0]);
      });
    };
    reader.readAsArrayBuffer(file);
  }

  onSheetSelectChange(event: Event) {
    this.selectSheet((event.target as HTMLSelectElement).value);
  }

  private selectSheet(sheetName: string) {
    if (!this.workbook) {
      return;
    }
    this.selectedSheetName = sheetName;
    import('xlsx').then(XLSX => {
      const sheet = this.workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet) as any[];

      this.preview = {
        rowCount: rows.length,
        orderIds: [...new Set(rows.map(r => Number(r.order_id)).filter(id => !isNaN(id)))],
        itemNames: [...new Set(rows.map(r => r.item_name).filter(Boolean))],
      };
      this.recomputeUnknownPassNames();
    });
  }

  get uploadLabel(): string {
    if (this.uploading) return this.unknownPassNames.length ? 'Creating pass types…' : 'Uploading…';
    return this.unknownPassNames.length
      ? `Create ${this.unknownPassNames.length} Pass Type${this.unknownPassNames.length > 1 ? 's' : ''} & Upload`
      : 'Upload';
  }

  upload() {
    const activeEvent = this.eventService.currentActiveEvent;
    if (!this.selectedFile || this.uploading) {
      return;
    }
    if (!activeEvent) {
      this.notificationService.openErrorSnackBar('No event selected');
      return;
    }
    this.uploading = true;
    this.validationErrors = [];
    this.duplicateOrderIds = [];

    if (this.unknownPassNames.length) {
      forkJoin(
        this.unknownPassNames.map(name =>
          this.eventService.createPassType(activeEvent._id, { name, category: this.newPassTypeCategories[name] })
        )
      ).pipe(
        catchError((err) => {
          this.uploading = false;
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Error creating pass types');
          return of(null);
        }),
        switchMap((created) => created ? this.doUpload(activeEvent._id) : of(null))
      ).subscribe();
    } else {
      this.doUpload(activeEvent._id).subscribe();
    }
  }

  private doUpload(eventId: string) {
    const formData = new FormData();
    formData.append('file', this.selectedFile!);
    formData.append('eventId', eventId);
    if (this.selectedSheetName) {
      formData.append('sheetName', this.selectedSheetName);
    }

    return this.boxOfficeService.uploadBoxOfficeExcel(formData).pipe(
      catchError((err) => {
        this.uploading = false;
        if (err?.error?.errors) {
          this.validationErrors = err.error.errors;
        } else if (err?.error?.existingOrderIds) {
          this.duplicateOrderIds = err.error.existingOrderIds;
        } else {
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Upload failed');
        }
        return of(null);
      }),
      switchMap((res) => {
        if (res) {
          this.uploading = false;
          this.notificationService.openSucessSnackBar(res.message + (res.ticketCount ? ` (${res.ticketCount} tickets)` : ''));
          this.dialogRef.close(res.ticketCount ?? 0);
        }
        return of(res);
      })
    );
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
