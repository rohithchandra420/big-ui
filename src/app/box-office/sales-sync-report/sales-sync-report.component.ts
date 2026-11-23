import { Component, OnDestroy, OnInit } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { Subscription } from 'rxjs';
import { skip } from 'rxjs/operators';

import { BoxOfficeService, SalesSyncLogEntry, SalesSyncLogQuery } from '../box-office.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { TableSort } from '../../shared/table-sort/table-sort';
import {
  syncAlertText, syncCountsText, syncKindLabel, syncSourceLabel
} from '../bookings/sales-sync/sales-sync.utils';

type SortKey = NonNullable<SalesSyncLogQuery['sort']>;
type Source = NonNullable<SalesSyncLogQuery['source']>;

interface SourceOption { value: Source; label: string; }

/** Stored list (stable identities for app-option). */
const SOURCE_OPTIONS: SourceOption[] = [
  { value: '', label: 'All sources' },
  { value: 'webhook', label: 'Live updates' },
  { value: 'pull', label: 'Pulls' },
  { value: 'check', label: 'Check all bookings' },
  { value: 'fetch', label: 'Fetch one booking' }
];

/**
 * Box Office › Sales Sync Report (user 2026-11-23): every live update, pull,
 * check and fetch for the selected event in one table — what came in, what
 * was not stored and why, and the phone alert it caused (sent to how many;
 * whether it was read is not known). Paged and sorted by the server; kept 90
 * days. Same people as the pull: top roles, the Box Office TL, box-office:manage.
 */
@Component({
  selector: 'app-sales-sync-report',
  templateUrl: './sales-sync-report.component.html',
  styleUrls: ['./sales-sync-report.component.css']
})
export class SalesSyncReportComponent implements OnInit, OnDestroy {
  readonly sourceOptions = SOURCE_OPTIONS;
  readonly pageSizeOptions = [25, 50, 100];

  entries: SalesSyncLogEntry[] = [];
  total = 0;
  loading = false;
  pageIndex = 0;
  pageSize = 25;

  source: Source = '';
  problemsOnly = false;
  from = '';
  to = '';

  /** Server-side sort: a header tap reloads page 1. */
  sort = new TableSort<SortKey>('at', 'desc', () => { this.pageIndex = 0; this.load(); });

  selected: SalesSyncLogEntry | null = null;

  private subs: Subscription[] = [];

  constructor(
    private boxOffice: BoxOfficeService,
    private eventService: EventService,
    private notify: NotificationService
  ) { }

  ngOnInit(): void {
    this.load();
    // Another event picked in the sidebar → its report.
    this.subs.push(this.eventService.activeEvent.pipe(skip(1)).subscribe(() => { this.pageIndex = 0; this.load(); }));
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  get eventName(): string { return this.eventService.currentActiveEvent?.name || ''; }

  load(): void {
    const id = this.eventService.currentActiveEvent?._id;
    if (!id) { this.entries = []; this.total = 0; return; }
    if (this.from && this.to && this.from > this.to) {
      this.notify.openErrorSnackBar('The "from" date is after the "to" date');
      return;
    }
    this.loading = true;
    this.boxOffice.getSalesSyncLog(id, {
      page: this.pageIndex, limit: this.pageSize,
      source: this.source, problems: this.problemsOnly,
      from: this.from || undefined, to: this.to || undefined,
      sort: this.sort.key || 'at', dir: this.sort.dir === 'asc' ? 'asc' : 'desc'
    }).subscribe({
      next: (p) => { this.entries = p.entries; this.total = p.total; this.loading = false; },
      error: (err) => {
        this.loading = false;
        this.notify.openErrorSnackBar(err?.error?.message || 'Failed to load the report');
      }
    });
  }

  /** Any filter changed → page 1. */
  applyFilters(): void { this.pageIndex = 0; this.load(); }

  toggleProblems(): void { this.problemsOnly = !this.problemsOnly; this.applyFilters(); }

  clearFilters(): void {
    this.source = '';
    this.problemsOnly = false;
    this.from = '';
    this.to = '';
    this.applyFilters();
  }

  get hasFilters(): boolean { return !!(this.source || this.problemsOnly || this.from || this.to); }

  onPage(e: PageEvent): void {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.load();
  }

  open(e: SalesSyncLogEntry): void { this.selected = e; }
  closePanel(): void { this.selected = null; }

  kindLabel(e: SalesSyncLogEntry): string { return syncKindLabel(e); }
  sourceLabel(e: SalesSyncLogEntry): string { return syncSourceLabel(e); }
  countsText(e: SalesSyncLogEntry): string { return syncCountsText(e.counts); }
  alertText(e: SalesSyncLogEntry): string { return syncAlertText(e.alert); }

  /** Alert in a few words for the table; the full text is on hover and in the panel. */
  alertShort(e: SalesSyncLogEntry): string {
    const a = e.alert;
    if (!a) return '';
    if (a.held) return 'Held';
    if (!a.devices) return 'No phones';
    return `Sent · ${a.users} ${a.users === 1 ? 'person' : 'people'}`;
  }

  /**
   * The table's Problem cell: the reason, the first Booking ID and how many
   * more (every one is in the row's panel). null = nothing wrong.
   */
  problemOf(e: SalesSyncLogEntry): { reason: string; first: string | null; more: number; flag: boolean } | null {
    const notStored = e.counts.errors || 0;
    if (notStored || e.problems.length || e.unknownCodes.length) {
      const reason = e.unknownCodes.length
        ? `Pass type${e.unknownCodes.length === 1 ? '' : 's'} missing: ${e.unknownCodes.slice(0, 2).join(', ')}${e.unknownCodes.length > 2 ? '…' : ''}`
        : (e.problems[0]?.messages[0] || 'Not stored');
      const first = e.problems.find(p => p.reference)?.reference || null;
      return { reason, first, more: first ? Math.max(0, notStored - 1) : 0, flag: false };
    }
    if (e.flagged.length) {
      return { reason: `${e.flagged.length} to check`, first: e.flagged[0], more: e.flagged.length - 1, flag: true };
    }
    return null;
  }

  trackEntry = (i: number, e: SalesSyncLogEntry) => e._id || i;
  trackSource = (_: number, o: SourceOption) => o.value;
  trackRef = (_: number, r: string) => r;
}

