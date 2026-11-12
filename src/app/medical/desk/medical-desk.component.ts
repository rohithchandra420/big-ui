import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import { BoxOfficeQrscannerPopupComponent, QrScannerData } from '../../box-office/registration/qrscanner-popup/qrscanner-popup.component';
import { MedicalService } from '../medical.service';
import { MedicalLockService } from '../medical-lock.service';
import { ADULT_AGE, FoundPerson, GENDERS, Gender, KIND_LABEL, MedicalPatient, RecordCounts, SEVERITY_BADGE, SEVERITY_LABEL } from '../medical.model';

interface WalkIn { name: string; phone: string; age: number | null; gender: Gender | null; guardianName: string; guardianPhone: string; }
const emptyWalkIn = (): WalkIn => ({ name: '', phone: '', age: null, gender: null, guardianName: '', guardianPhone: '' });

/** Medical Desk (release 1): find the patient — band, search or walk-in — then open their report. */
@Component({
  selector: 'app-medical-desk',
  templateUrl: './medical-desk.component.html'
})
export class MedicalDeskComponent implements OnInit, OnDestroy {
  readonly genders = GENDERS;
  readonly kindLabel = KIND_LABEL;
  readonly sevLabel = SEVERITY_LABEL;
  readonly sevBadge = SEVERITY_BADGE;
  readonly adultAge = ADULT_AGE;

  eventId: string | null = null;
  eventName = '';
  counts: RecordCounts | null = null;
  resting: MedicalPatient[] = [];
  followUps: MedicalPatient[] = [];

  q = '';
  results: FoundPerson[] | null = null;
  searching = false;
  scanMessage = '';
  opening = false;

  walkInOpen = false;
  walkIn: WalkIn = emptyWalkIn();

  private sub?: Subscription;
  private searchTimer: any = null;
  private searchSeq = 0;

  constructor(
    private medical: MedicalService,
    private lock: MedicalLockService,
    private events: EventService,
    private notify: NotificationService,
    private gate: GateFeedbackService,
    private dialog: MatDialog,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.sub = this.events.activeEvent.subscribe(e => {
      this.eventId = e?._id || null;
      this.eventName = e?.name || '';
      this.results = null;
      this.q = '';
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    clearTimeout(this.searchTimer);
  }

  async load(): Promise<void> {
    if (!this.eventId) return;
    try {
      await this.medical.access();
      const [all, resting, follow] = await Promise.all([
        this.medical.records(this.eventId, {}),
        this.medical.records(this.eventId, { resting: true }),
        this.medical.records(this.eventId, { followUp: true })
      ]);
      this.counts = all.counts;
      this.resting = resting.patients;
      this.followUps = follow.patients;
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not load the Medical Desk');
    }
  }

  onSearch(): void {
    clearTimeout(this.searchTimer);
    const q = this.q.trim();
    if (q.length < 2) { this.results = null; return; }
    this.searchTimer = setTimeout(() => this.search(q), 300);
  }

  private async search(q: string): Promise<void> {
    if (!this.eventId) return;
    const seq = ++this.searchSeq;
    this.searching = true;
    try {
      const res = await this.medical.find(this.eventId, q);
      if (seq === this.searchSeq) this.results = res.people;
    } catch (err: any) {
      if (seq === this.searchSeq) this.notify.openErrorSnackBar(err?.error?.message || 'Could not search');
    } finally {
      if (seq === this.searchSeq) this.searching = false;
    }
  }

  scan(): void {
    this.gate.unlock();
    this.scanMessage = '';
    const data: QrScannerData = { mode: 'raw', title: 'Scan the wrist band' };
    this.dialog.open(BoxOfficeQrscannerPopupComponent, { width: '90%', maxWidth: '480px', data })
      .afterClosed().subscribe(async (raw?: string) => {
        if (!raw || !this.eventId) return;
        try {
          const { person } = await this.medical.findBand(this.eventId, raw);
          this.gate.found();
          await this.open(person);
        } catch (err: any) {
          if (err?.status === 404 || err?.status === 409 || err?.status === 400) this.gate.notFound(); else this.gate.error();
          this.scanMessage = err?.error?.message || 'Could not check the band';
        }
      });
  }

  /** Opens the person's report (creating it the first time). */
  async open(person: FoundPerson): Promise<void> {
    if (person.reportId) { this.router.navigate(['/medical/patients', person.reportId]); return; }
    if (!this.eventId || this.opening) return;
    this.opening = true;
    try {
      const who = person.kind === 'participant' ? { pass: person.passId } : { user: person.userId };
      const { patient } = await this.medical.openReport(this.eventId, person.kind, who);
      this.router.navigate(['/medical/patients', patient._id]);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not open the report');
    } finally {
      this.opening = false;
    }
  }

  get walkInMinor(): boolean {
    return this.walkIn.age !== null && this.walkIn.age !== undefined && String(this.walkIn.age) !== '' && Number(this.walkIn.age) < ADULT_AGE;
  }

  startWalkIn(): void {
    this.walkIn = { ...emptyWalkIn(), name: this.q.trim() };
    this.walkInOpen = true;
  }

  async saveWalkIn(): Promise<void> {
    if (!this.eventId || !this.walkIn.name.trim() || this.opening) return;
    this.opening = true;
    try {
      const w = this.walkIn;
      const { patient } = await this.medical.openReport(this.eventId, 'walkin', {
        name: w.name.trim(), phone: w.phone.trim(), age: w.age === null || String(w.age) === '' ? null : Number(w.age), gender: w.gender,
        guardian: this.walkInMinor ? { name: w.guardianName.trim(), phone: w.guardianPhone.trim(), contacted: false } : undefined
      });
      this.walkInOpen = false;
      this.router.navigate(['/medical/patients', patient._id]);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save');
    } finally {
      this.opening = false;
    }
  }

  lockNow(): void {
    this.lock.lockNow();
  }

  trackPerson = (_: number, p: FoundPerson) => `${p.kind}:${p.passId || p.userId || p.reportId}`;
  trackPatient = (_: number, p: MedicalPatient) => p._id;
}
