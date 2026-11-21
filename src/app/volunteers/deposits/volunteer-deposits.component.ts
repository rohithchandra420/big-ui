import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { EventItem } from '../../models/event.model';
import { VolunteersService } from '../volunteers.service';
import { DepositList, DepositMode, DepositRow, DepositStatus } from '../volunteers.model';
import { DEPOSIT_LABEL, MODE_LABEL, money } from '../volunteers.utils';
import { SortGetter, TableSort } from '../../shared/table-sort/table-sort';

type DepositSortKey = 'name' | 'dept' | 'status' | 'amount' | 'mode' | 'collected';

type Mode = 'closed' | 'view' | 'record' | 'refund' | 'standard';
type Filter = 'all' | DepositStatus;

/**
 * Volunteers › Deposits (V2): the security deposit of each volunteer on the
 * event. Everyone who opens Volunteers sees the status; amounts, payment
 * modes and totals need Write; recording, correcting, refunding (in full) and
 * the standard amount need Manage. The server checks every rule again.
 */
@Component({
  selector: 'app-volunteer-deposits',
  templateUrl: './volunteer-deposits.component.html',
  styleUrls: ['./volunteer-deposits.component.css']
})
export class VolunteerDepositsComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  data: DepositList | null = null;
  /** Built in apply() — the template never iterates a getter. */
  rows: DepositRow[] = [];
  loading = false;
  loadError = '';
  busy = false;
  search = '';
  filter: Filter = 'all';

  mode: Mode = 'closed';
  selected: DepositRow | null = null;
  form = { amount: null as number | null, mode: 'cash' as DepositMode, collectedAt: '', note: '' };
  refundForm = { mode: 'cash' as DepositMode, note: '' };
  standard: number | null = null;
  formError = '';

  money = money;
  modeLabel = MODE_LABEL;
  statusLabel = DEPOSIT_LABEL;

  private sub = new Subscription();

  constructor(
    private events: EventService,
    private volunteers: VolunteersService,
    private notify: NotificationService,
    private confirm: ConfirmationService
  ) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.close(); this.data = null; this.load(); }
    }));
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  get canManage(): boolean { return !!this.data?.canManage; }
  get seeAmounts(): boolean { return !!this.data?.seeAmounts; }

  async load() {
    if (!this.event) { this.data = null; this.apply(); return; }
    this.loading = !this.data;
    this.loadError = '';
    try {
      this.data = await this.volunteers.deposits(this.event._id);
      if (this.selected) this.selected = this.data.rows.find(r => r._id === this.selected!._id) || null;
      if (!this.selected && this.mode !== 'standard') this.mode = 'closed';
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the deposits.';
    } finally {
      this.loading = false;
      this.apply();
    }
  }

  apply() {
    const q = this.search.trim().toLowerCase();
    this.rows = (this.data?.rows || [])
      .filter(r => (this.filter === 'all' || r.status === this.filter) && (!q || r.name.toLowerCase().includes(q) || r.phone.includes(q)))
      // People who left with a deposit still held come first, then by name
      .sort((a, b) => Number(!!b.flag) - Number(!!a.flag) || a.name.localeCompare(b.name));
    // B-003: a header tap sorts by that column instead
    if (this.sort.key) this.rows = this.sort.apply(this.rows, this.sortGetters);
  }

  /** B-003: column sort (none = the default order above). */
  sort = new TableSort<DepositSortKey>(null, 'asc', () => this.apply());
  readonly sortGetters: Record<DepositSortKey, SortGetter<DepositRow>> = {
    name: r => r.name,
    dept: r => r.department || (r.flag ? '' : 'Unassigned'),
    status: r => this.statusLabel[r.status],
    amount: r => r.amount ?? null,
    mode: r => r.mode ? this.modeLabel[r.mode] : '',
    collected: r => r.collectedAt ? Date.parse(r.collectedAt) : null
  };

  setFilter(f: Filter) {
    this.filter = this.filter === f ? 'all' : f;
    this.apply();
  }

  trackRow = (_: number, r: DepositRow) => r._id;
  trackMode = (_: number, m: string) => m;

  private today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  readonly maxDate = this.today();

  // ── panel ──

  open(r: DepositRow) {
    this.selected = r;
    this.formError = '';
    // Nothing recorded yet: people who may record go straight to the form
    if (r.status === 'none' && this.canManage) this.startRecord(r);
    else this.mode = 'view';
  }

  startRecord(r: DepositRow) {
    this.selected = r;
    this.mode = 'record';
    this.formError = '';
    this.form = {
      amount: r.amount ?? (this.data?.defaultAmount || null),
      mode: r.mode || 'cash',
      collectedAt: (r.collectedAt || '').substring(0, 10) || this.today(),
      note: r.note || ''
    };
  }

  startRefund(r: DepositRow) {
    this.selected = r;
    this.mode = 'refund';
    this.formError = '';
    this.refundForm = { mode: r.mode || 'cash', note: '' };
  }

  startStandard() {
    this.selected = null;
    this.mode = 'standard';
    this.formError = '';
    this.standard = this.data?.defaultAmount || null;
  }

  /** ✕ on a form of someone who has a deposit goes back to it; otherwise closes. */
  panelClosed() {
    if ((this.mode === 'record' || this.mode === 'refund') && this.selected && this.selected.status !== 'none') { this.mode = 'view'; return; }
    this.close();
  }

  close() { this.mode = 'closed'; this.selected = null; }

  get panelTitle(): string {
    if (this.mode === 'standard') return 'Standard deposit';
    if (this.mode === 'refund') return `Refund · ${this.selected?.name || ''}`;
    return this.selected?.name || '';
  }
  get panelSubtitle(): string {
    if (this.mode === 'standard') return this.event?.name || '';
    const r = this.selected;
    if (!r) return '';
    return [this.statusLabel[r.status], this.seeAmounts && r.amount ? money(r.amount) : ''].filter(Boolean).join(' · ');
  }

  private whole(v: any, min: number): number | null {
    const n = Number(v);
    return v !== null && v !== '' && Number.isInteger(n) && n >= min && n <= 1000000 ? n : null;
  }

  async saveRecord() {
    const r = this.selected;
    if (!this.event || !r || this.busy) return;
    const amount = this.whole(this.form.amount, 1);
    if (!amount) { this.formError = 'Amount: a whole number, 1 or more.'; return; }
    if (this.form.collectedAt && this.form.collectedAt > this.maxDate) { this.formError = 'Collected on cannot be in the future.'; return; }
    this.busy = true;
    this.formError = '';
    try {
      await this.volunteers.saveDeposit(this.event._id, r._id, {
        amount, mode: this.form.mode, note: this.form.note.trim(),
        // Today keeps the exact time; another day is sent as that date
        ...(this.form.collectedAt && this.form.collectedAt !== this.maxDate ? { collectedAt: this.form.collectedAt } : {})
      });
      this.notify.openSucessSnackBar(`${r.status === 'none' ? 'Deposit recorded' : 'Deposit corrected'}: ${r.name}, ${money(amount)}`);
      this.mode = 'view';
      await this.load();
    } catch (err: any) {
      this.formError = err?.error?.message || 'Could not save the deposit.';
    } finally {
      this.busy = false;
    }
  }

  async saveRefund() {
    const r = this.selected;
    if (!this.event || !r || this.busy) return;
    this.busy = true;
    this.formError = '';
    try {
      await this.volunteers.refundDeposit(this.event._id, r._id, this.refundForm.mode, this.refundForm.note.trim());
      this.notify.openSucessSnackBar(`Refunded ${money(r.amount)} to ${r.name}`);
      this.mode = 'view';
      await this.load();
    } catch (err: any) {
      this.formError = err?.error?.message || 'Could not refund the deposit.';
    } finally {
      this.busy = false;
    }
  }

  async saveStandard() {
    if (!this.event || this.busy) return;
    const amount = this.standard === null || (this.standard as any) === '' ? 0 : this.whole(this.standard, 0);
    if (amount === null) { this.formError = 'A whole number (0 = none).'; return; }
    this.busy = true;
    this.formError = '';
    try {
      await this.volunteers.setDefaultDeposit(this.event._id, amount);
      this.notify.openSucessSnackBar(amount ? `Standard deposit: ${money(amount)}` : 'Standard deposit removed');
      this.close();
      await this.load();
    } catch (err: any) {
      this.formError = err?.error?.message || 'Could not save.';
    } finally {
      this.busy = false;
    }
  }

  remove(r: DepositRow) {
    this.confirm.confirm({
      title: 'Remove Deposit', message: `Remove the deposit recorded for ${r.name}? Use this only for an entry made by mistake.`, confirmText: 'Remove', danger: true
    }).subscribe(async ok => {
      if (!ok || !this.event) return;
      try {
        await this.volunteers.removeDeposit(this.event._id, r._id);
        this.notify.openSucessSnackBar('Deposit removed');
        this.close();
        await this.load();
      } catch (err: any) {
        this.notify.openErrorSnackBar(err?.error?.message || 'Could not remove the deposit.');
      }
    });
  }

  /** Excel of what is on screen (the current filter and search). Only for people who see amounts. */
  export() {
    if (!this.seeAmounts || !this.rows.length) return;
    const day = (v?: string | null) => (v ? v.substring(0, 10) : '');
    const sheetRows = this.rows.map(r => ({
      Volunteer: r.name,
      Phone: r.phone,
      Department: r.department || 'Unassigned',
      Status: this.statusLabel[r.status] + (r.flag ? (r.flag === 'left' ? ' (left the event)' : ' (deactivated)') : ''),
      Amount: r.amount ?? '',
      'Paid by': r.mode ? this.modeLabel[r.mode] : '',
      'Collected on': day(r.collectedAt),
      'Collected by': r.collectedBy || '',
      Note: r.note || '',
      'Refunded on': day(r.refundedAt),
      'Refunded by': r.refundedBy || '',
      'Refund paid by': r.refundMode ? this.modeLabel[r.refundMode] : '',
      'Refund note': r.refundNote || ''
    }));
    import('xlsx').then(XLSX => {
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sheetRows), 'Deposits');
      XLSX.writeFile(book, `volunteer-deposits-${this.today()}.xlsx`);
    });
  }
}
