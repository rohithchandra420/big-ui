import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { BoxOfficeService } from '../../box-office.service';
import { NotificationService } from '../../../core/notification.service';

interface FilePreview {
  rowCount: number;
  orderIds: number[];
  itemNames: string[];
}

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
 */
@Component({
  selector: 'app-bulk-upload',
  templateUrl: './bulk-upload.component.html',
  styleUrls: ['./bulk-upload.component.css']
})
export class BulkUploadComponent {

  selectedFile: File | null = null;
  preview: FilePreview | null = null;
  uploading = false;
  dragOver = false;

  sheetNames: string[] = [];
  selectedSheetName: string | null = null;
  private workbook: any = null;

  validationErrors: string[] = [];
  duplicateOrderIds: number[] = [];

  constructor(
    private dialogRef: MatDialogRef<BulkUploadComponent>,
    private boxOfficeService: BoxOfficeService,
    private notificationService: NotificationService
  ) { }

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
    });
  }

  upload() {
    if (!this.selectedFile || this.uploading) {
      return;
    }
    this.uploading = true;
    this.validationErrors = [];
    this.duplicateOrderIds = [];

    const formData = new FormData();
    formData.append('file', this.selectedFile);
    if (this.selectedSheetName) {
      formData.append('sheetName', this.selectedSheetName);
    }

    this.boxOfficeService.uploadBoxOfficeExcel(formData).subscribe({
      next: (res) => {
        this.uploading = false;
        this.notificationService.openSucessSnackBar(res.message + (res.ticketCount ? ` (${res.ticketCount} tickets)` : ''));
        this.dialogRef.close(res.ticketCount ?? 0);
      },
      error: (err) => {
        this.uploading = false;
        if (err?.error?.errors) {
          this.validationErrors = err.error.errors;
        } else if (err?.error?.existingOrderIds) {
          this.duplicateOrderIds = err.error.existingOrderIds;
        } else {
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Upload failed');
        }
      }
    });
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
