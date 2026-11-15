import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';
import { WashService } from '../wash.service';
import { ACTION_INFO, KIND_INFO, ReportFacility, ReportLog, ReportStock, WashReport } from '../wash.model';
import { durationText } from '../wash.utils';

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * WASH › Report (WA5): one festival day (India time) — refills / cleanings per
 * facility, how long each stood overdue or down, the day's log, stock used and
 * received, and an Excel export. Everyone with WASH access.
 */
@Component({
  selector: 'app-wash-report',
  templateUrl: './wash-report.component.html',
  styleUrls: ['./wash-report.component.css']
})
export class WashReportComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  report: WashReport | null = null;
  /** The day shown, "YYYY-MM-DD"; '' = today (the server's festival day). */
  date = '';
  loading = false;
  loadError = '';
  exporting = false;
  /** The facility in the slide panel, by id (so a reload shows fresh numbers). */
  openId: string | null = null;

  readonly kindInfo = KIND_INFO;
  readonly actionInfo = ACTION_INFO;
  duration = durationText;

  private sub = new Subscription();

  constructor(private events: EventService, private wash: WashService, private notify: NotificationService) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.report = null; this.openId = null; this.date = ''; this.load(); }
    }));
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  async load() {
    if (!this.event) { this.report = null; return; }
    this.loading = !this.report;
    this.loadError = '';
    try {
      this.report = await this.wash.report(this.event._id, this.date);
      this.date = this.report.date;
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the report.';
    } finally {
      this.loading = false;
    }
  }

  shiftDay(n: number) {
    if (!this.report) return;
    const d = new Date(this.report.date + 'T00:00:00');
    d.setDate(d.getDate() + n);
    this.date = localDate(d);
    this.load();
  }
  toToday() { this.date = ''; this.load(); }
  get isToday(): boolean { return !!this.report && this.report.date === this.report.today; }
  get isFuture(): boolean { return !!this.report && this.report.date > this.report.today; }

  dayLabel(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  get opened(): ReportFacility | null { return this.report?.facilities.find(f => f._id === this.openId) || null; }
  trackFacility = (_: number, f: ReportFacility) => f._id;
  trackStock = (_: number, s: ReportStock) => s.name;
  trackLog = (i: number, l: ReportLog) => l.at + i;

  /** The day as an Excel file: Facilities, Log and Stock sheets. */
  async export() {
    const r = this.report;
    if (!r || this.exporting) return;
    this.exporting = true;
    try {
      const XLSX = await import('xlsx');
      const facilities = r.facilities.map(f => ({
        Facility: f.name, Type: KIND_INFO[f.kind].label, 'Every (h)': f.intervalHours,
        'Refills / cleanings': f.done, 'Via QR': f.viaQr, 'Problems reported': f.problems,
        'Overdue (min)': f.overdueMin, 'Empty / out of order (min)': f.downMin
      }));
      const log = r.facilities.flatMap(f => f.logs.map(l => ({
        Time: l.time, Facility: f.name, Action: ACTION_INFO[l.action].label, By: l.by || '', 'Via QR': l.viaQr ? 'Yes' : '', Note: l.note
      }))).sort((a, b) => a.Time.localeCompare(b.Time));
      const stock = r.stock.map(s => ({ Item: s.name, Unit: s.unit, Used: s.used, Received: s.received }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(facilities), 'Facilities');
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(log), 'Log');
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(stock), 'Stock');
      XLSX.writeFile(book, `wash-report-${r.date}.xlsx`);
    } catch {
      this.notify.openErrorSnackBar('Could not make the Excel file.');
    } finally {
      this.exporting = false;
    }
  }
}
