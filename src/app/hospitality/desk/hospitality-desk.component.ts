import { Component, OnDestroy, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subscription, filter } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import { EventItem } from '../../models/event.model';
import { BoxOfficeQrscannerPopupComponent, QrScannerData } from '../../box-office/registration/qrscanner-popup/qrscanner-popup.component';
import { localTime } from '../../workshops/planner.utils';
import { HospitalityService } from '../hospitality.service';
import { DeskDecision, DeskPerson, DeskState, ScanOutcome, SLOT_LABELS } from '../hospitality.model';

const REFRESH_MS = 30 * 1000;
const REASONS = ['Arrived late', 'TL confirmed by phone', 'Off-site duty', 'New joiner'];
const DECISION_LABELS: Record<DeskDecision, string> = {
  served: 'Marked', served_flagged: 'Served', refused: 'Refused', blocked: 'Blocked', extra: 'Extra plate'
};

/**
 * Hospitality › Serving desk (H2, layout as mocks/mock-hospitality.html):
 * scan a staff meal QR or search, then serve. Marked → served at once; not
 * marked → serve with a reason or refuse; already ate → block or allow an extra
 * plate. Only while a meal is open. HospitalityGuard; the server checks too.
 */
@Component({
  selector: 'app-hospitality-desk',
  templateUrl: './hospitality-desk.component.html',
  styleUrls: ['./hospitality-desk.component.css']
})
export class HospitalityDeskComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  desk: DeskState | null = null;
  loading = false;
  loadError = '';
  busy = false;

  search = '';
  results: DeskPerson[] = [];
  searched = false;

  outcome: ScanOutcome | null = null;
  /** The last decision made on the current card (shown on it after Serve / Refuse / Block / Extra). */
  done: string = '';
  reason = '';
  otherReason = '';
  readonly reasons = REASONS;
  readonly decisionLabels = DECISION_LABELS;

  private sub = new Subscription();
  private timer: any;

  constructor(
    private events: EventService,
    private hospitality: HospitalityService,
    private notify: NotificationService,
    private gate: GateFeedbackService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.outcome = null; this.load(); }
    }));
    this.timer = setInterval(() => { if (!this.busy) this.load(); }, REFRESH_MS);
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    clearInterval(this.timer);
  }

  async load() {
    if (!this.event) { this.desk = null; return; }
    this.loading = !this.desk;
    this.loadError = '';
    try {
      this.desk = await this.hospitality.getDesk(this.event._id);
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the serving desk.';
    } finally {
      this.loading = false;
    }
  }

  time(iso: string): string { return localTime(new Date(iso)); }
  trackPerson = (_: number, p: DeskPerson) => p._id;
  trackLog = (_: number, r: { _id: string }) => r._id;

  get closesIn(): string {
    const o = this.desk?.open;
    if (!o) return '';
    const min = Math.max(0, Math.round((new Date(o.end).getTime() - Date.now()) / 60000));
    return min >= 60 ? `closes in ${Math.floor(min / 60)} h ${min % 60} min` : `closes in ${min} min`;
  }
  get slotText(): string {
    return this.outcome?.result === 'flag' ? SLOT_LABELS[this.outcome.slot].toLowerCase() : '';
  }
  get chosenReason(): string {
    return this.reason === 'Other' ? this.otherReason.trim() : this.reason;
  }

  scanQr() {
    if (!this.desk?.open) return;
    this.gate.unlock();
    const data: QrScannerData = { mode: 'raw', title: 'Serving desk: Scan staff QR' };
    this.dialog.open(BoxOfficeQrscannerPopupComponent, { width: '90%', maxWidth: '480px', data })
      .afterClosed().pipe(filter((raw): raw is string => typeof raw === 'string' && !!raw))
      .subscribe(raw => this.check({ qr: raw }));
  }

  async findStaff() {
    const q = this.search.trim();
    if (!this.event || q.length < 2) return;
    this.gate.unlock();
    try {
      this.results = (await this.hospitality.searchStaff(this.event._id, q)).people;
      this.searched = true;
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not search staff.');
    }
  }

  pick(p: DeskPerson) {
    this.results = [];
    this.search = '';
    this.searched = false;
    this.check({ user: p._id });
  }

  /** Scan or pick → the server says served / flag / duplicate. */
  async check(who: { qr?: string; user?: string }) {
    if (!this.event || this.busy) return;
    this.busy = true;
    this.done = '';
    this.reason = '';
    this.otherReason = '';
    try {
      this.outcome = await this.hospitality.scan(this.event._id, who);
      if (this.outcome.result === 'served') this.gate.found(); else this.gate.notFound();
      await this.load();
    } catch (err: any) {
      this.outcome = null;
      if (err?.status === 404 || err?.status === 409) this.gate.notFound(); else this.gate.error();
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not check this person.');
    } finally {
      this.busy = false;
    }
  }

  async decide(decision: 'serve' | 'refuse' | 'block' | 'extra') {
    const o = this.outcome;
    if (!o || !this.event || this.busy) return;
    if (decision === 'serve' && !this.chosenReason) return;
    this.busy = true;
    try {
      const r = await this.hospitality.decide(this.event._id, o.person._id, decision, decision === 'serve' || decision === 'refuse' ? this.chosenReason : undefined);
      this.done = DECISION_LABELS[r.decision];
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save that.');
    } finally {
      this.busy = false;
    }
  }

  clear() {
    this.outcome = null;
    this.done = '';
  }

  async closeMess() {
    const o = this.desk?.open;
    if (!o || !this.event || this.busy) return;
    this.busy = true;
    try {
      await this.hospitality.close({ event: this.event._id, date: o.date, meal: o.meal });
      this.outcome = null;
      this.notify.openSucessSnackBar('Mess Hall closed — staff notified');
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not close the Mess Hall.');
    } finally {
      this.busy = false;
    }
  }

  async notifyTls() {
    if (!this.event || this.busy) return;
    this.busy = true;
    try {
      const r = await this.hospitality.notifyFlaggedTls(this.event._id);
      this.notify.openSucessSnackBar(r.tls
        ? `${r.people} ${r.people === 1 ? 'person' : 'people'} reported to ${r.tls} Team Lead${r.tls === 1 ? '' : 's'} (a Task on their Billboard)`
        : 'Nobody new to report');
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not notify the Team Leads.');
    } finally {
      this.busy = false;
    }
  }
}
