import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { AdminService, BulkUserResult, BulkUserRow, BulkUsersResponse, BulkUserStatus } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';
import { EventService } from '../../../core/event.service';

/** Columns of the template, in order. The first five are required. */
export const BULK_USER_COLUMNS = [
  'name', 'email', 'password', 'role', 'home_department',
  'food_preference', 'gender', 'date_of_joining', 'phone'
] as const;

export const BULK_USER_MAX_ROWS = 500;

type Phase = 'pick' | 'checking' | 'preview' | 'adding' | 'done';

const STATUS_LABEL: { [s in BulkUserStatus]: string } = {
  ready: 'Ready', created: 'Added', problem: 'Problem', duplicate: 'Duplicate'
};
const STATUS_BADGE: { [s in BulkUserStatus]: string } = {
  ready: 'bb', created: 'bg', problem: 'br', duplicate: 'ba'
};

/** "Home Department" / "home-department" → "home_department". */
export function headerKey(h: string): string {
  return String(h || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** A spreadsheet cell as plain text; dates become yyyy-mm-dd (local day). */
export function cellText(v: any): string {
  if (v === undefined || v === null) return '';
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).trim();
}

/** Spreadsheet rows (objects keyed by header) → rows for the server. Fully empty rows are dropped. */
export function toBulkRows(sheetRows: any[]): BulkUserRow[] {
  const out: BulkUserRow[] = [];
  sheetRows.forEach((raw, i) => {
    const r: any = {};
    Object.keys(raw || {}).forEach(k => { r[headerKey(k)] = raw[k]; });
    const row: any = { row: i + 2 };
    BULK_USER_COLUMNS.forEach(c => { row[c] = c === 'password' ? (r[c] === undefined || r[c] === null ? '' : String(r[c])) : cellText(r[c]); });
    if (BULK_USER_COLUMNS.some(c => row[c] !== '')) out.push(row as BulkUserRow);
  });
  return out;
}

/**
 * Admin › Users › Bulk Add (v1.42.0). Drop an .xlsx with one user per row →
 * the server checks every row (dry run) → preview with Ready / Problem /
 * Duplicate → "Add N users" creates only the ready ones → result with a
 * download (never containing passwords). Same access as creating one user.
 */
@Component({
  selector: 'app-bulk-users',
  templateUrl: './bulk-users.component.html',
  styleUrls: ['./bulk-users.component.css']
})
export class BulkUsersComponent {

  readonly columns = BULK_USER_COLUMNS;
  readonly maxRows = BULK_USER_MAX_ROWS;

  phase: Phase = 'pick';
  fileName = '';
  dragOver = false;
  sheetNames: string[] = [];
  selectedSheetName: string | null = null;
  private workbook: any = null;

  private rows: BulkUserRow[] = [];
  results: BulkUserResult[] = [];
  counts: BulkUsersResponse['counts'] = {};
  error = '';
  added = 0;
  /** Staff list: also put the new users on the sidebar event (on by default). */
  addToEvent = true;

  constructor(
    private dialogRef: MatDialogRef<BulkUsersComponent>,
    private adminService: AdminService,
    private notificationService: NotificationService,
    private eventService: EventService
  ) { }

  get event() { return this.eventService.currentActiveEvent; }

  get readyCount(): number { return this.counts.ready || 0; }
  get busy(): boolean { return this.phase === 'checking' || this.phase === 'adding'; }

  statusLabel(s: BulkUserStatus): string { return STATUS_LABEL[s]; }
  statusBadge(s: BulkUserStatus): string { return STATUS_BADGE[s]; }
  trackRow(_: number, r: BulkUserResult): number { return r.row; }
  trackName(_: number, n: string): string { return n; }

  // ── Template ────────────────────────────────────────────────
  downloadTemplate(): void {
    import('xlsx').then(XLSX => {
      const users = XLSX.utils.aoa_to_sheet([[...BULK_USER_COLUMNS]]);
      const help = XLSX.utils.aoa_to_sheet([
        ['Column', 'Required', 'What to put'],
        ['name', 'Yes', 'Full name'],
        ['email', 'Yes', 'Used to sign in. Must be new — existing emails are skipped'],
        ['password', 'Yes', '8+ characters with upper and lower case, a number and a symbol'],
        ['role', 'Yes', 'VOL, TL, ADMIN, DIR (DEV only when a Developer uploads)'],
        ['home_department', 'For VOL and TL', 'Department name exactly as in Admin › Departments'],
        ['food_preference', 'No', 'veg or non-veg'],
        ['gender', 'No', 'Male, Female or Prefer not to say'],
        ['date_of_joining', 'No', 'A date, e.g. 2026-11-07. Leave empty if not known'],
        ['phone', 'No', '7 to 15 digits; a leading + is allowed. Format the column as Text so the + and leading zeros stay']
      ]);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, users, 'Users');
      XLSX.utils.book_append_sheet(book, help, 'How to fill');
      XLSX.writeFile(book, 'bulk-users-template.xlsx');
    });
  }

  // ── File ────────────────────────────────────────────────────
  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file) this.handleFile(file);
    input.value = '';
  }

  onDragOver(event: DragEvent): void { event.preventDefault(); if (!this.busy) this.dragOver = true; }
  onDragLeave(event: DragEvent): void { event.preventDefault(); this.dragOver = false; }
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver = false;
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file && !this.busy) this.handleFile(file);
  }

  handleFile(file: File): void {
    this.reset();
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      this.error = 'Only .xlsx files are supported.';
      return;
    }
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      import('xlsx').then(XLSX => {
        try {
          this.workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        } catch {
          this.error = 'This file could not be read.';
          return;
        }
        this.sheetNames = this.workbook.SheetNames.filter((n: string) => n !== 'How to fill');
        if (!this.sheetNames.length) this.sheetNames = this.workbook.SheetNames;
        this.selectSheet(this.sheetNames[0]);
      });
    };
    reader.readAsArrayBuffer(file);
  }

  selectSheet(name: string): void {
    if (!this.workbook || this.busy) return;
    this.selectedSheetName = name;
    import('xlsx').then(XLSX => {
      const sheetRows = XLSX.utils.sheet_to_json(this.workbook.Sheets[name], { defval: '' }) as any[];
      this.check(toBulkRows(sheetRows));
    });
  }

  private check(rows: BulkUserRow[]): void {
    this.results = [];
    this.counts = {};
    this.error = '';
    this.rows = rows;
    if (!rows.length) { this.error = 'No users found in this sheet.'; this.phase = 'pick'; return; }
    if (rows.length > BULK_USER_MAX_ROWS) {
      this.error = `This sheet has ${rows.length} rows. Up to ${BULK_USER_MAX_ROWS} per file — split it into smaller files.`;
      this.phase = 'pick';
      return;
    }
    this.phase = 'checking';
    this.adminService.bulkUsers(rows, true).subscribe({
      next: (res) => { this.results = res.results; this.counts = res.counts; this.phase = 'preview'; },
      error: (err) => { this.error = err?.error?.msg || 'The rows could not be checked. Try again.'; this.phase = 'pick'; }
    });
  }

  // ── Add ─────────────────────────────────────────────────────
  add(): void {
    if (this.phase !== 'preview' || !this.readyCount) return;
    this.phase = 'adding';
    const eventId = this.addToEvent && this.event ? this.event._id : '';
    this.adminService.bulkUsers(this.rows, false, eventId).subscribe({
      next: (res) => {
        this.results = res.results;
        this.counts = res.counts;
        this.added = res.counts.created || 0;
        this.rows = []; // passwords no longer kept in memory
        this.phase = 'done';
        if (this.added) this.notificationService.openSucessSnackBar(`${this.added} user${this.added === 1 ? '' : 's'} added`);
      },
      error: (err) => {
        this.error = err?.error?.msg || 'Adding users failed. Nothing was added — try again.';
        this.phase = 'preview';
      }
    });
  }

  downloadResult(): void {
    import('xlsx').then(XLSX => {
      const sheet = XLSX.utils.json_to_sheet(this.results.map(r => ({
        row: r.row, name: r.name, email: r.email, role: r.role,
        home_department: r.home_department, result: STATUS_LABEL[r.status], reason: r.reason || ''
      })));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Result');
      XLSX.writeFile(book, `bulk-users-result-${new Date().toISOString().substring(0, 10)}.xlsx`);
    });
  }

  close(): void {
    this.rows = [];
    this.dialogRef.close(this.added > 0);
  }

  private reset(): void {
    this.phase = 'pick';
    this.fileName = '';
    this.sheetNames = [];
    this.selectedSheetName = null;
    this.workbook = null;
    this.rows = [];
    this.results = [];
    this.counts = {};
    this.error = '';
  }
}
