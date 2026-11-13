import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';
import { WashService } from '../wash.service';
import {
  ACTION_INFO, KIND_INFO, STATE_INFO, STATE_ORDER, StateInfo, WashAction, WashFacility, WashKind, WashLogEntry, WashState
} from '../wash.model';
import { agoText, clockText, dueAtOf, parseWashQr, stateOf, usedPercent } from '../wash.utils';

/** One card, built in apply() — never in a getter (stable identities for *ngFor). */
interface Card {
  f: WashFacility;
  state: WashState;
  info: StateInfo;
  pct: number;
  last: string;
  sub: string;
  doneLabel: string;
  doneIcon: string;
}

const REFRESH_MS = 60 * 1000;

/**
 * WASH › Monitor (WA1): every facility of the sidebar event with its state;
 * Refilled / Cleaned any time (on demand — that time becomes the last one),
 * Empty (water), Out of order with a note, Back in service. History in the
 * slide panel. WashGuard; the server checks every call too.
 */
@Component({
  selector: 'app-wash-monitor',
  templateUrl: './wash-monitor.component.html',
  styleUrls: ['./wash-monitor.component.css']
})
export class WashMonitorComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  facilities: WashFacility[] = [];
  cards: Card[] = [];
  counts: Record<WashState, number> = this.zeroCounts();
  canLog = false;
  canManage = false;
  /** WA2: Refilled / Cleaned need a scan of the facility's QR sticker. */
  requireQr = false;
  /** The sticker that was just scanned (or opened by its link): its code goes with this facility's logs. */
  scanned: { id: string; token: string } | null = null;
  /** A sticker link (/wash?f=…&k=…) waiting for the list to load. */
  private pendingLink: { id: string; token: string } | null = null;
  loading = false;
  loadError = '';
  busyId: string | null = null;

  kind: 'all' | WashKind = 'all';
  stateFilter: WashState | null = null;
  search = '';

  readonly stateOrder = STATE_ORDER;
  readonly stateInfo = STATE_INFO;
  readonly kindInfo = KIND_INFO;
  readonly actionInfo = ACTION_INFO;
  readonly kinds: { key: 'all' | WashKind; label: string; icon: string }[] = [
    { key: 'all', label: 'All', icon: 'apps' },
    { key: 'water', label: 'Water', icon: 'water_drop' },
    { key: 'toilets', label: 'Toilets', icon: 'wc' },
  ];

  /** Slide panel: the open facility, and the note form for Empty / Out of order. */
  selected: WashFacility | null = null;
  history: WashLogEntry[] = [];
  historyLoading = false;
  noteFor: 'empty' | 'out_of_order' | null = null;
  note = '';
  noteError = '';

  private sub = new Subscription();
  private timer: any = null;
  private onVisible = () => { if (!document.hidden) this.load(); };

  constructor(
    private events: EventService,
    private wash: WashService,
    private notify: NotificationService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    // A sticker scanned with the phone's camera opens /wash?f=<id>&k=<code>.
    this.sub.add(this.route.queryParamMap.subscribe(q => {
      // An alert's link has only f (no sticker code): it opens the facility, but is not a scan.
      const f = q.get('f') || '';
      const link = parseWashQr(`/wash?f=${f}&k=${q.get('k') || ''}`)
        || (/^[0-9a-f]{24}$/i.test(f) ? { id: f.toLowerCase(), token: '' } : null);
      if (!link) return;
      this.pendingLink = link;
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      this.openPending();
    }));
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.closePanel(); this.facilities = []; this.load(); }
    }));
    this.timer = setInterval(() => { if (!document.hidden) this.load(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  async load() {
    if (!this.event) { this.facilities = []; this.apply(); return; }
    this.loading = !this.facilities.length;
    this.loadError = '';
    try {
      const res = await this.wash.facilities(this.event._id);
      this.facilities = res.facilities;
      this.canLog = res.canLog;
      this.canManage = res.canManage;
      this.requireQr = !!res.requireQr;
      if (this.selected) this.selected = this.facilities.find(f => f._id === this.selected!._id) || null;
      this.apply();
      this.openPending();
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the facilities.';
    } finally {
      this.loading = false;
    }
  }

  private zeroCounts(): Record<WashState, number> {
    return { not_started: 0, ok: 0, due_soon: 0, overdue: 0, empty: 0, out_of_order: 0 };
  }

  apply() {
    const now = new Date();
    const q = this.search.trim().toLowerCase();
    this.counts = this.zeroCounts();
    const all = this.facilities.map(f => this.toCard(f, now));
    all.forEach(c => this.counts[c.state]++);
    this.cards = all
      .filter(c => (this.kind === 'all' || c.f.kind === this.kind) &&
        (!this.stateFilter || c.state === this.stateFilter) &&
        (!q || c.f.name.toLowerCase().includes(q)))
      .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || a.f.name.localeCompare(b.f.name));
  }

  private toCard(f: WashFacility, now: Date): Card {
    const state = stateOf(f, now);
    const k = KIND_INFO[f.kind];
    const due = dueAtOf(f);
    let sub = '';
    if (state === 'empty' || state === 'out_of_order') sub = f.statusNote;
    else if (state === 'overdue') sub = `Was due ${clockText(due)}`;
    else if (state === 'not_started') sub = `Every ${f.intervalHours} h, from the first one`;
    else sub = `Next due ${clockText(due)}`;
    const back = state === 'out_of_order';
    return {
      f, state, info: STATE_INFO[state], pct: usedPercent(f, now),
      last: f.lastDoneAt ? `${k.doneLabel} ${agoText(f.lastDoneAt, now)} · every ${f.intervalHours} h` : `Never ${k.doneLabel.toLowerCase()} yet · every ${f.intervalHours} h`,
      sub,
      doneLabel: back ? 'Back in service' : k.doneLabel,
      doneIcon: back ? ACTION_INFO.back_in_service.icon : ACTION_INFO[k.done].icon,
    };
  }

  setKind(k: 'all' | WashKind) { this.kind = k; this.apply(); }
  toggleState(s: WashState) { this.stateFilter = this.stateFilter === s ? null : s; this.apply(); }
  trackCard = (_: number, c: Card) => c.f._id;
  trackState = (_: number, s: WashState) => s;
  trackLog = (_: number, l: WashLogEntry) => l._id;
  clock = clockText;

  // ── actions ──

  /** The card's main button: Refilled / Cleaned, or Back in service when out of order. */
  async mainAction(f: WashFacility) {
    const back = f.status === 'out_of_order';
    const action: WashAction = back ? 'back_in_service' : KIND_INFO[f.kind].done;
    // "Require QR": Refilled / Cleaned first need this facility's sticker.
    if (!back && this.requireQr && this.scanned?.id !== f._id && !await this.scanFor(f)) return;
    this.send(f, action);
  }

  /** Header button: scan any facility's sticker and open that facility. */
  async scanAny() {
    const res = await this.wash.scan();
    if (!res) return;
    const f = res === 'other' ? null : this.facilities.find(x => x._id === res.id);
    if (res === 'other' || !f) { this.notify.openErrorSnackBar('That is not a WASH sticker of this event.'); return; }
    this.scanned = res;
    this.open(f);
  }

  /** Scans for one facility; false when closed or it is another facility's sticker. */
  private async scanFor(f: WashFacility): Promise<boolean> {
    const res = await this.wash.scan(`Scan the sticker at ${f.name}`);
    if (!res) return false;
    if (res === 'other' || res.id !== f._id) { this.notify.openErrorSnackBar(`That is not the sticker of ${f.name}.`); return false; }
    this.scanned = res;
    return true;
  }

  /** Opens the facility of a sticker link once the list is there. */
  private openPending() {
    const link = this.pendingLink;
    if (!link || !this.facilities.length) return;
    this.pendingLink = null;
    const f = this.facilities.find(x => x._id === link.id);
    if (!f) { this.notify.openErrorSnackBar('That is not a WASH facility of this event.'); return; }
    this.scanned = link.token ? link : null;
    this.open(f);
  }

  async send(f: WashFacility, action: WashAction, note = ''): Promise<boolean> {
    if (this.busyId) return false;
    this.busyId = f._id;
    try {
      const updated = await this.wash.log(f._id, action, note, this.scanned?.id === f._id ? this.scanned.token : null);
      this.facilities = this.facilities.map(x => x._id === updated._id ? { ...x, ...updated } : x);
      if (this.selected?._id === f._id) { this.selected = this.facilities.find(x => x._id === f._id) || null; this.loadHistory(); }
      this.apply();
      const at = action === 'refilled' || action === 'cleaned' ? ` at ${clockText(updated.lastDoneAt)}` : '';
      this.notify.openSucessSnackBar(`${f.name}: ${ACTION_INFO[action].label}${at}`);
      return true;
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not save that.');
      return false;
    } finally {
      this.busyId = null;
    }
  }

  // ── panel ──

  open(f: WashFacility, noteFor: 'empty' | 'out_of_order' | null = null) {
    if (this.scanned && this.scanned.id !== f._id) this.scanned = null;
    this.selected = f;
    this.noteFor = noteFor;
    this.note = '';
    this.noteError = '';
    this.loadHistory();
  }

  async loadHistory() {
    if (!this.selected) return;
    const id = this.selected._id;
    this.historyLoading = !this.history.length;
    try {
      const h = await this.wash.history(id);
      if (this.selected?._id === id) this.history = h;
    } catch {
      this.history = [];
    } finally {
      this.historyLoading = false;
    }
  }

  async saveNote() {
    if (!this.selected || !this.noteFor) return;
    const note = this.note.trim();
    if (this.noteFor === 'out_of_order' && !note) { this.noteError = 'Say what is wrong.'; return; }
    if (await this.send(this.selected, this.noteFor, note)) { this.noteFor = null; this.note = ''; }
  }

  closePanel() {
    this.selected = null;
    this.history = [];
    this.noteFor = null;
    this.scanned = null; // a scan counts while its facility is open
  }

  /** The panel's main button label / icon for the open facility. */
  get selectedDone(): { label: string; icon: string } {
    const f = this.selected;
    if (!f) return { label: '', icon: '' };
    if (f.status === 'out_of_order') return ACTION_INFO.back_in_service;
    return ACTION_INFO[KIND_INFO[f.kind].done];
  }
  get selectedScanned(): boolean { return !!this.selected && this.scanned?.id === this.selected._id; }

  get panelTitle(): string { return this.selected?.name || ''; }
  get panelSubtitle(): string {
    return this.selected ? `${KIND_INFO[this.selected.kind].label} · ${STATE_INFO[stateOf(this.selected)].label}` : '';
  }
  get panelIcon(): string { return this.selected ? KIND_INFO[this.selected.kind].icon : 'water_drop'; }
  get selectedState(): WashState | null { return this.selected ? stateOf(this.selected) : null; }
  get publicText(): string {
    const f = this.selected;
    if (!f) return '';
    // Shown on the public map from WA4 (decision 2026-11-13).
    if (f.kind === 'toilets') return f.status === 'out_of_order' ? 'Closed' : 'Open';
    return f.status === 'ok' ? 'Refilled' : 'Empty';
  }
}
