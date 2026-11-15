import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { EventItem } from '../../models/event.model';
import { WashService } from '../wash.service';
import { StockItem, StockLogEntry, StockMoveKind } from '../wash.model';
import { clockText } from '../wash.utils';

type Mode = 'closed' | 'view' | 'move' | 'new' | 'edit';
/** One row, built in apply() — never in a getter. `pct`: how full the bar is. */
interface Row { item: StockItem; pct: number }

/**
 * WASH › Stock (WA3): the event's central store. Everyone with WASH access
 * sees it; Received / Used and the items themselves are for the WASH Team Lead
 * and above (user decision 2026-11-13). Using more than the store holds is
 * allowed with a warning — the item just goes to 0.
 */
@Component({
  selector: 'app-wash-stock',
  templateUrl: './wash-stock.component.html',
  styleUrls: ['./wash-stock.component.css']
})
export class WashStockComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  items: StockItem[] = [];
  rows: Row[] = [];
  lowCount = 0;
  canManage = false;
  loading = false;
  loadError = '';
  busy = false;
  search = '';

  mode: Mode = 'closed';
  selected: StockItem | null = null;
  history: StockLogEntry[] = [];
  historyLoading = false;

  moveKind: StockMoveKind = 'used';
  moveQty: number | null = null;
  moveNote = '';
  form = { name: '', unit: '', lowLimit: 0 as number | null, quantity: 0 as number | null };
  formError = '';

  private sub = new Subscription();

  constructor(
    private events: EventService,
    private wash: WashService,
    private notify: NotificationService,
    private confirm: ConfirmationService
  ) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.close(); this.items = []; this.load(); }
    }));
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  async load() {
    if (!this.event) { this.items = []; this.apply(); return; }
    this.loading = !this.items.length;
    this.loadError = '';
    try {
      const res = await this.wash.stock(this.event._id);
      this.items = res.items;
      this.canManage = res.canManage;
      if (this.selected) this.selected = this.items.find(i => i._id === this.selected!._id) || null;
      this.apply();
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the stock.';
    } finally {
      this.loading = false;
    }
  }

  apply() {
    const q = this.search.trim().toLowerCase();
    this.lowCount = this.items.filter(i => i.low).length;
    this.rows = this.items
      .filter(i => !q || i.name.toLowerCase().includes(q))
      // Low items first, then by name
      .sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name))
      .map(item => ({ item, pct: this.fill(item) }));
  }

  /** Bar: full at 3× the low limit (or at any stock when no limit is set). */
  private fill(i: StockItem): number {
    if (!i.lowLimit) return i.quantity > 0 ? 100 : 0;
    return Math.max(0, Math.min(100, Math.round(i.quantity / (i.lowLimit * 3) * 100)));
  }

  trackRow = (_: number, r: Row) => r.item._id;
  trackLog = (_: number, l: StockLogEntry) => l._id;
  clock = clockText;

  // ── panel ──

  open(i: StockItem) {
    this.selected = i;
    this.mode = 'view';
    this.loadHistory();
  }

  startMove(i: StockItem, kind: StockMoveKind) {
    this.selected = i;
    this.mode = 'move';
    this.moveKind = kind;
    this.moveQty = null;
    this.moveNote = '';
    this.formError = '';
  }

  startNew() {
    this.selected = null;
    this.mode = 'new';
    this.form = { name: '', unit: '', lowLimit: 0, quantity: 0 };
    this.formError = '';
  }

  startEdit(i: StockItem) {
    this.selected = i;
    this.mode = 'edit';
    this.form = { name: i.name, unit: i.unit, lowLimit: i.lowLimit, quantity: i.quantity };
    this.formError = '';
  }

  /** ✕ on a form of an item goes back to the item; otherwise closes. */
  panelClosed() {
    if ((this.mode === 'move' || this.mode === 'edit') && this.selected) { this.mode = 'view'; this.loadHistory(); return; }
    this.close();
  }

  close() { this.mode = 'closed'; this.selected = null; this.history = []; }

  get panelTitle(): string {
    if (this.mode === 'new') return 'Add item';
    if (this.mode === 'move') return `${this.moveKind === 'received' ? 'Received' : 'Used'} · ${this.selected?.name || ''}`;
    return this.selected?.name || '';
  }
  get panelSubtitle(): string {
    const i = this.selected;
    if (this.mode === 'new' || !i) return 'Central store';
    return `${i.quantity} ${i.unit} in store`.replace(/\s+/g, ' ').trim();
  }
  /** Soft validation: shown while typing a Used larger than the store. */
  get overBy(): number {
    const q = Number(this.moveQty) || 0;
    return this.mode === 'move' && this.moveKind === 'used' && this.selected ? Math.max(0, q - this.selected.quantity) : 0;
  }

  async loadHistory() {
    if (!this.selected) return;
    const id = this.selected._id;
    this.historyLoading = !this.history.length;
    try {
      const h = await this.wash.stockHistory(id);
      if (this.selected?._id === id) this.history = h;
    } catch {
      this.history = [];
    } finally {
      this.historyLoading = false;
    }
  }

  private whole(v: any, min: number): number | null {
    const n = Number(v);
    return v !== null && v !== '' && Number.isInteger(n) && n >= min ? n : null;
  }

  async saveMove() {
    const i = this.selected;
    if (!i || this.busy) return;
    const qty = this.whole(this.moveQty, 1);
    if (!qty) { this.formError = 'Quantity: a whole number, 1 or more.'; return; }
    this.busy = true;
    this.formError = '';
    try {
      const res = await this.wash.moveStock(i._id, this.moveKind, qty, this.moveNote.trim());
      this.items = this.items.map(x => x._id === i._id ? res.item : x);
      this.selected = res.item;
      this.apply();
      const unit = res.item.unit ? ' ' + res.item.unit : '';
      if (res.short) this.notify.openErrorSnackBar(`Only ${qty - res.short}${unit} were in store — ${res.item.name} is now at 0.`);
      else this.notify.openSucessSnackBar(`${res.item.name}: ${res.item.quantity}${unit} in store${res.becameLow ? ' — running low' : ''}`);
      this.mode = 'view';
      this.loadHistory();
    } catch (err: any) {
      this.formError = err?.error?.message || 'Could not save that.';
    } finally {
      this.busy = false;
    }
  }

  async saveItem() {
    if (!this.event || this.busy) return;
    const name = this.form.name.trim();
    const lowLimit = this.whole(this.form.lowLimit ?? 0, 0);
    if (!name) { this.formError = 'Give the item a name.'; return; }
    if (lowLimit === null) { this.formError = 'Low at: a whole number (0 = no warning).'; return; }
    const unit = this.form.unit.trim();
    this.busy = true;
    this.formError = '';
    try {
      if (this.mode === 'new') {
        const quantity = this.whole(this.form.quantity ?? 0, 0);
        if (quantity === null) { this.formError = 'In store: a whole number.'; return; }
        await this.wash.addItem(this.event._id, { name, unit, lowLimit, quantity });
        this.notify.openSucessSnackBar('Item added');
        this.close();
      } else if (this.selected) {
        this.selected = await this.wash.updateItem(this.selected._id, { name, unit, lowLimit });
        this.notify.openSucessSnackBar('Saved');
        this.mode = 'view';
      }
      await this.load();
    } catch (err: any) {
      this.formError = err?.error?.message || 'Could not save.';
    } finally {
      this.busy = false;
    }
  }

  remove(i: StockItem) {
    this.confirm.confirm({
      title: 'Delete Item', message: `Delete ${i.name} and its history from the store?`, confirmText: 'Delete', danger: true
    }).subscribe(async ok => {
      if (!ok) return;
      try {
        await this.wash.deleteItem(i._id);
        this.notify.openSucessSnackBar('Item deleted');
        this.close();
        await this.load();
      } catch (err: any) {
        this.notify.openErrorSnackBar(err?.error?.message || 'Could not delete the item.');
      }
    });
  }
}
