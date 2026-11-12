import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription, firstValueFrom } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { MedicalService } from '../medical.service';
import { DayReport, KIND_LABEL, OUTCOMES, OUTCOME_LABEL, PatientKind, SEVERITIES, SEVERITY_BADGE, SEVERITY_LABEL, Tally } from '../medical.model';

interface Bar { label: string; n: number; pct: number; }

/** Bars scaled to the biggest value (0–100%). */
export function bars(rows: Tally[]): Bar[] {
  const max = Math.max(1, ...rows.map(r => r.n));
  return rows.map(r => ({ label: r.label, n: r.n, pct: Math.round((r.n / max) * 100) }));
}

/** Medical Desk › Report: one festival day's figures and the full-list Excel export (MEDICAL_CONTEXT.md, M3). */
@Component({
  selector: 'app-medical-report',
  templateUrl: './medical-report.component.html'
})
export class MedicalReportComponent implements OnInit, OnDestroy {
  readonly sevBadge = SEVERITY_BADGE;
  readonly sevLabel = SEVERITY_LABEL;
  readonly outLabel = OUTCOME_LABEL;

  eventId: string | null = null;
  eventName = '';
  date = '';
  report: DayReport | null = null;
  canExport = false;
  exporting = false;

  // Built once per load (stable identities for *ngFor).
  severityBars: Bar[] = [];
  outcomeBars: Bar[] = [];
  typeBars: Bar[] = [];
  complaintBars: Bar[] = [];
  medicineBars: Bar[] = [];
  hours: { h: number; n: number; pct: number }[] = [];

  private sub?: Subscription;

  constructor(
    private medical: MedicalService,
    private events: EventService,
    private notify: NotificationService,
    private confirmation: ConfirmationService
  ) {}

  ngOnInit(): void {
    this.sub = this.events.activeEvent.subscribe(e => {
      this.eventId = e?._id || null;
      this.eventName = e?.name || '';
      this.date = '';
      this.load();
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  async load(): Promise<void> {
    if (!this.eventId) return;
    try {
      const access = await this.medical.access();
      this.canExport = access.canExport;
      const r = await this.medical.dayReport(this.eventId, this.date || undefined);
      this.report = r;
      this.date = r.date;
      this.severityBars = bars(SEVERITIES.map(s => ({ label: s.label, n: r.bySeverity[s.value] || 0 })));
      this.outcomeBars = bars(OUTCOMES.map(o => ({ label: o.label, n: r.byOutcome[o.value] || 0 })));
      this.typeBars = bars((Object.keys(KIND_LABEL) as PatientKind[]).map(k => ({ label: KIND_LABEL[k], n: r.byType[k] || 0 })));
      this.complaintBars = bars(r.complaints);
      this.medicineBars = bars(r.medicines);
      const max = Math.max(1, ...r.byHour);
      // Only the hours from the first to the last visit (or 08–20 on a quiet day).
      const used = r.byHour.map((n, h) => (n ? h : -1)).filter(h => h >= 0);
      const from = used.length ? Math.min(8, used[0]) : 8;
      const to = used.length ? Math.max(20, used[used.length - 1]) : 20;
      this.hours = r.byHour.map((n, h) => ({ h, n, pct: Math.round((n / max) * 100) })).filter(x => x.h >= from && x.h <= to);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not load the report');
    }
  }

  pick(date: string): void {
    this.date = date;
    this.load();
  }

  /** "this day" or "whole event" → Excel file, after a health-data warning. */
  async export(scope: 'day' | 'event'): Promise<void> {
    if (!this.eventId || this.exporting) return;
    const ok = await firstValueFrom(this.confirmation.confirm({
      title: 'Download medical records?',
      message: 'The file holds names, diagnoses and medicines — health data. Keep it on a safe device, don\'t forward it, and delete it when you no longer need it.',
      confirmText: 'Download'
    }));
    if (!ok) return;
    this.exporting = true;
    try {
      const res = scope === 'day'
        ? await this.medical.exportVisits(this.eventId, this.date, this.date)
        : await this.medical.exportVisits(this.eventId);
      if (!res.rows.length) { this.notify.openErrorSnackBar('No visits to export'); return; }
      const XLSX = await import('xlsx');
      const sheet = XLSX.utils.json_to_sheet(res.rows);
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, 'Visits');
      const name = `medical-${(res.event || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${scope === 'day' ? this.date : 'all'}.xlsx`;
      XLSX.writeFile(book, name);
      if (res.truncated) this.notify.openErrorSnackBar('Only the first 5000 visits were exported');
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not export');
    } finally {
      this.exporting = false;
    }
  }

  trackBar = (_: number, b: Bar) => b.label;
  trackHour = (_: number, h: { h: number }) => h.h;
  trackDay = (_: number, d: string) => d;
}
