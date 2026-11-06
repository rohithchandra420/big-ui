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
import { StaffBandService } from '../../core/staff-band.service';
import { DeskDecision, DeskExpected, DeskGuestHit, DeskPerson, DeskState, GuestOutcome, MealKey, MEALS, ScanOutcome, SLOT_LABELS } from '../hospitality.model';

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
  guestResults: DeskGuestHit[] = [];
  searched = false;

  outcome: ScanOutcome | null = null;
  /** The last decision made on the current card (shown on it after Serve / Refuse / Block / Extra). */
  done: string = '';
  reason = '';
  otherReason = '';
  /** Guest card (H3): plates to hand out now. */
  gVeg = 0;
  gNonVeg = 0;
  /** "Guest pass" for a walk-in. */
  walkOpen = false;
  walk = { name: '', note: '', veg: 1, nonVeg: 0 };
  /** H5: Replace band needs a reason first. */
  bandReasonOpen = false;
  bandReason = '';
  /** "Expected for <meal>" list (1.47.0). */
  expected: DeskExpected | null = null;
  expDate = '';
  expMeal: MealKey | null = null;
  readonly expMeals = MEALS.map(m => ({ key: m.key, label: m.label }));
  private expSeq = 0;
  readonly reasons = REASONS;
  readonly decisionLabels = DECISION_LABELS;

  private sub = new Subscription();
  private timer: any;

  constructor(
    private events: EventService,
    private hospitality: HospitalityService,
    private notify: NotificationService,
    private gate: GateFeedbackService,
    private dialog: MatDialog,
    private staffBands: StaffBandService
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
      const [desk] = await Promise.all([this.hospitality.getDesk(this.event._id), this.loadExpected()]);
      this.desk = desk;
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the serving desk.';
    } finally {
      this.loading = false;
    }
  }

  time(iso: string): string { return localTime(new Date(iso)); }

  // ── Expected list (1.47.0) ─────────────────────────────────
  /** A picked day + meal; null = the desk's own meal (open, else next today). */
  get expPicked(): boolean { return !!this.expMeal; }
  pickExpected() {
    if (!this.expMeal) this.expMeal = this.desk?.open?.meal || 'lunch';
    this.loadExpected();
  }
  resetExpected() { this.expMeal = null; this.expDate = ''; this.loadExpected(); }
  async loadExpected() {
    if (!this.event) return;
    const seq = ++this.expSeq;
    const r = await this.hospitality.getDeskExpected(this.event._id, this.expMeal ? (this.expDate || undefined) : undefined, this.expMeal || undefined).catch(() => null);
    if (seq === this.expSeq) this.expected = r;
  }
  trackMealChip = (_: number, m: { key: string }) => m.key;
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

  /** H5: link the scanned band to the staff member on the card (or replace theirs). */
  async linkBand(replace = false) {
    const o = this.staffOutcome;
    if (!o || !this.event || this.busy) return;
    if (replace && !this.bandReason.trim()) { this.bandReasonOpen = true; return; }
    this.gate.unlock();
    const raw = await this.staffBands.scan(replace ? `Replace band: ${o.person.name}` : `Link band: ${o.person.name}`);
    if (!raw) return;
    this.busy = true;
    try {
      const r = replace
        ? await this.staffBands.replace(o.person._id, this.event._id, raw, this.bandReason.trim())
        : await this.staffBands.link(o.person._id, this.event._id, raw);
      o.person.band = r.band.code;
      this.bandReasonOpen = false;
      this.bandReason = '';
      this.gate.found();
      this.notify.openSucessSnackBar(replace ? 'Band replaced' : 'Band linked — they can scan it at the desk now');
    } catch (err: any) {
      this.gate.notFound();
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save the band.');
    } finally {
      this.busy = false;
    }
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
      const found = await this.hospitality.searchStaff(this.event._id, q);
      this.results = found.people;
      this.guestResults = found.guests || [];
      this.searched = true;
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not search staff.');
    }
  }

  /** A guest from the search → their card, as if their pass was scanned. */
  pickGuest(g: DeskGuestHit) {
    this.results = [];
    this.guestResults = [];
    this.search = '';
    this.searched = false;
    this.check({ pass: g.passId });
  }
  trackGuestHit = (_: number, g: DeskGuestHit) => g.passId;

  pick(p: DeskPerson) {
    this.guestResults = [];
    this.results = [];
    this.search = '';
    this.searched = false;
    this.check({ user: p._id });
  }

  /** Scan or pick → the server says served / flag / duplicate. */
  async check(who: { qr?: string; user?: string; pass?: string }) {
    if (!this.event || this.busy) return;
    this.busy = true;
    this.done = '';
    this.reason = '';
    this.otherReason = '';
    this.notStaff = '';
    try {
      this.outcome = await this.hospitality.scan(this.event._id, who);
      if (this.outcome.result === 'guest') this.prepareGuest(this.outcome);
      if (this.outcome.result === 'served' || (this.outcome.result === 'guest' && this.guestHasPlates)) this.gate.found(); else this.gate.notFound();
      await this.load();
    } catch (err: any) {
      this.outcome = null;
      // Staff list (R2): someone not on the event's staff is refused — a clear card, not an error.
      if (err?.error?.state === 'not_staff') {
        this.notStaff = err.error.message;
        this.gate.notFound();
        return;
      }
      if (err?.status === 404 || err?.status === 409) this.gate.notFound(); else this.gate.error();
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not check this person.');
    } finally {
      this.busy = false;
    }
  }

  async decide(decision: 'serve' | 'refuse' | 'block' | 'extra') {
    const o = this.staffOutcome;
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

  /** Staff list (R2): "<name> is not on the staff list for <event>" — the desk refuses them. */
  notStaff = '';

  clear() {
    this.outcome = null;
    this.notStaff = '';
    this.done = '';
    this.bandReasonOpen = false;
    this.bandReason = '';
  }

  /** The staff result card (served / flag / duplicate), or null for a guest. */
  get staffOutcome(): Exclude<ScanOutcome, GuestOutcome> | null {
    return this.outcome && this.outcome.result !== 'guest' ? this.outcome : null;
  }

  // ── guests (H3) ──
  get guest(): GuestOutcome | null { return this.outcome?.result === 'guest' ? this.outcome : null; }
  get guestHasPlates(): boolean { const g = this.guest; return !!g && g.left.veg + g.left.nonVeg > 0; }

  /** Suggest all the plates left for this meal. */
  private prepareGuest(g: GuestOutcome) {
    this.gVeg = g.left.veg;
    this.gNonVeg = g.left.nonVeg;
  }
  stepGuest(field: 'gVeg' | 'gNonVeg', by: number) { this[field] = Math.max(0, Math.min(50, this[field] + by)); }

  /** Serve the chosen plates; past the pass's plates only with extra (the "Allow" answer). */
  async serveGuest(extra = false) {
    const g = this.guest;
    if (!g || !this.event || this.busy || this.gVeg + this.gNonVeg < 1) return;
    this.busy = true;
    try {
      const r = await this.hospitality.servePass(this.event._id, g.pass._id, { veg: this.gVeg, nonVeg: this.gNonVeg, extra });
      this.outcome = r;
      this.done = r.decision === 'extra' ? 'Extra plates' : `${this.gVeg + this.gNonVeg} plate${this.gVeg + this.gNonVeg === 1 ? '' : 's'} served`;
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not serve this guest.');
    } finally {
      this.busy = false;
    }
  }

  async blockGuest() {
    const g = this.guest;
    if (!g || !this.event || this.busy) return;
    this.busy = true;
    try {
      this.outcome = await this.hospitality.servePass(this.event._id, g.pass._id, { block: true });
      this.done = 'Blocked';
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not save that.');
    } finally {
      this.busy = false;
    }
  }

  openWalkIn() {
    this.walk = { name: '', note: '', veg: 1, nonVeg: 0 };
    this.walkOpen = true;
  }
  stepWalk(field: 'veg' | 'nonVeg', by: number) { this.walk[field] = Math.max(0, Math.min(50, this.walk[field] + by)); }

  /** A One Meal pass for the open meal, then straight to the guest card. */
  async submitWalkIn() {
    const w = this.walk;
    if (!this.event || this.busy || !w.name.trim() || w.veg + w.nonVeg < 1) return;
    this.busy = true;
    try {
      const g = await this.hospitality.walkIn(this.event._id, { name: w.name.trim(), note: w.note.trim(), vegPlates: w.veg, nonVegPlates: w.nonVeg });
      this.walkOpen = false;
      this.done = '';
      this.outcome = g;
      this.prepareGuest(g);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not issue the guest pass.');
    } finally {
      this.busy = false;
    }
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
