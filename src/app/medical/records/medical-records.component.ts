import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { MedicalService } from '../medical.service';
import {
  KIND_LABEL, MedicalPatient, OUTCOME_LABEL, Outcome, OUTCOMES, PatientKind, RecordCounts, RecordFilters,
  SEVERITIES, SEVERITY_BADGE, SEVERITY_LABEL, Severity
} from '../medical.model';

type Quick = 'all' | 'today' | 'resting' | 'followUp' | 'serious';
interface Opt<T> { value: T; label: string; }

/** Medical Desk › Records: every patient report on the event, with search and filters (Bookings-style, full width). */
@Component({
  selector: 'app-medical-records',
  templateUrl: './medical-records.component.html'
})
export class MedicalRecordsComponent implements OnInit, OnDestroy {
  readonly kindLabel = KIND_LABEL;
  readonly sevLabel = SEVERITY_LABEL;
  readonly sevBadge = SEVERITY_BADGE;
  readonly outLabel = OUTCOME_LABEL;
  // Stored lists (stable identities) for the dropdowns — never build them in a getter.
  readonly typeOptions: Opt<PatientKind | ''>[] = [{ value: '', label: 'All patients' }, { value: 'participant', label: 'Participants' }, { value: 'staff', label: 'Staff' }, { value: 'walkin', label: 'Walk-ins' }];
  readonly severityOptions: Opt<Severity | ''>[] = [{ value: '', label: 'Any severity' }, ...SEVERITIES.map(s => ({ value: s.value, label: s.label }))];
  readonly outcomeOptions: Opt<Outcome | ''>[] = [{ value: '', label: 'Any outcome' }, ...OUTCOMES.map(o => ({ value: o.value, label: o.label }))];

  eventId: string | null = null;
  eventName = '';
  patients: MedicalPatient[] = [];
  counts: RecordCounts | null = null;
  total = 0;
  pageSize = 50;
  loading = false;

  quick: Quick = 'all';
  f: RecordFilters = { q: '', type: '', severity: '', outcome: '', from: '', to: '', page: 0 };

  private sub?: Subscription;
  private timer: any = null;

  constructor(private medical: MedicalService, private events: EventService, private notify: NotificationService, private router: Router) {}

  ngOnInit(): void {
    this.sub = this.events.activeEvent.subscribe(e => {
      this.eventId = e?._id || null;
      this.eventName = e?.name || '';
      this.f.page = 0;
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    clearTimeout(this.timer);
  }

  async load(): Promise<void> {
    if (!this.eventId) return;
    this.loading = true;
    try {
      await this.medical.access();
      const res = await this.medical.records(this.eventId, this.filters());
      this.patients = res.patients;
      this.counts = res.counts;
      this.total = res.total;
      this.pageSize = res.pageSize;
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not load the records');
    } finally {
      this.loading = false;
    }
  }

  private filters(): RecordFilters {
    const f: RecordFilters = { ...this.f };
    if (this.quick === 'resting') f.resting = true;
    if (this.quick === 'followUp') f.followUp = true;
    if (this.quick === 'serious') f.severity = 'serious';
    if (this.quick === 'today') {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      f.from = start.toISOString();
    } else {
      if (f.from) f.from = new Date(f.from + 'T00:00:00').toISOString();
      if (f.to) f.to = new Date(f.to + 'T23:59:59').toISOString();
    }
    return f;
  }

  setQuick(q: Quick): void {
    this.quick = this.quick === q ? 'all' : q;
    this.f.page = 0;
    this.load();
  }

  changed(): void {
    this.f.page = 0;
    this.load();
  }

  onSearch(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.changed(), 300);
  }

  clear(): void {
    this.f = { q: '', type: '', severity: '', outcome: '', from: '', to: '', page: 0 };
    this.quick = 'all';
    this.load();
  }

  get pages(): number { return Math.max(1, Math.ceil(this.total / this.pageSize)); }

  go(page: number): void {
    this.f.page = Math.min(Math.max(0, page), this.pages - 1);
    this.load();
  }

  openReport(p: MedicalPatient): void {
    this.router.navigate(['/medical/patients', p._id]);
  }

  trackPatient = (_: number, p: MedicalPatient) => p._id;
  trackOpt = (_: number, o: Opt<any>) => o.value;
}
