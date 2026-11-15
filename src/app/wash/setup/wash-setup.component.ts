import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { EventItem } from '../../models/event.model';
import { parseLatLng } from '../../venue-map/venue-map.utils';
import { WashService } from '../wash.service';
import { KIND_INFO, NewFacility, WashFacility, WashKind, WashPin, WashSticker } from '../wash.model';

const esc = (s: string) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** The printable sticker sheet (A4, 2 columns): QR, facility name, type, "Scan to log". Exported for the spec. */
export function stickerSheetHtml(stickers: WashSticker[], eventName: string): string {
  const cells = stickers.map(s => `
    <div class="st">
      <img src="${esc(s.qr)}" alt="">
      <div class="nm">${esc(s.name)}</div>
      <div class="kd">${esc(KIND_INFO[s.kind].label)} · ${esc(eventName)}</div>
      <div class="hint">WASH · Scan to log ${s.kind === 'water' ? 'a refill' : 'a cleaning'}</div>
    </div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>WASH QR stickers</title><style>
    @page { size: A4; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #111; }
    .bar { padding: 10px; display: flex; gap: 10px; align-items: center; }
    .bar button { font: inherit; padding: 8px 16px; border-radius: 8px; border: 0; background: #1E4638; color: #fff; cursor: pointer; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
    .st { border: 1.5px dashed #888; border-radius: 4mm; padding: 6mm; text-align: center; break-inside: avoid; }
    .st img { width: 62mm; height: 62mm; }
    .nm { font-size: 16pt; font-weight: 700; margin-top: 2mm; overflow-wrap: anywhere; }
    .kd { font-size: 10pt; color: #444; margin-top: 1mm; }
    .hint { font-size: 10pt; margin-top: 2mm; font-weight: 600; color: #1E4638; }
    @media print { .bar { display: none; } }
  </style></head><body>
    <div class="bar"><button onclick="window.print()">Print</button><span>${stickers.length} sticker${stickers.length === 1 ? '' : 's'} · cut along the dashed lines</span></div>
    <div class="grid">${cells || '<p>No facilities yet.</p>'}</div>
  </body></html>`;
}

type Mode = 'closed' | 'add' | 'edit';
type Source = 'pin' | 'new';

/**
 * WASH › Setup (WA1): which Venue Map places are WASH facilities, and how often
 * each is refilled / cleaned. A facility is picked from the event's Water /
 * Toilets pins and Washroom areas (washrooms exist both ways), or a new pin is
 * dropped here (it shows on the Venue Map).
 * WashGuard (washManage); the server checks every call too.
 */
@Component({
  selector: 'app-wash-setup',
  templateUrl: './wash-setup.component.html',
  styleUrls: ['./wash-setup.component.css']
})
export class WashSetupComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  facilities: WashFacility[] = [];
  pins: WashPin[] = [];
  loading = false;
  loadError = '';
  busy = false;
  /** WA2: Refilled / Cleaned need a scan of the facility's QR sticker (per event). */
  requireQr = false;
  savingQr = false;
  printing = false;

  mode: Mode = 'closed';
  source: Source = 'pin';
  editing: WashFacility | null = null;
  form = this.blank();
  formError = '';

  readonly kindInfo = KIND_INFO;
  readonly kinds: WashKind[] = ['water', 'toilets'];

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
      if (changed) { this.close(); this.facilities = []; this.load(); }
    }));
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  private blank() {
    return { pin: '', name: '', type: 'water' as WashKind, coords: '', intervalHours: 3 as number | null, capacityLitres: null as number | null };
  }

  async load() {
    if (!this.event) { this.facilities = []; this.pins = []; return; }
    this.loading = !this.facilities.length;
    this.loadError = '';
    try {
      const [list, pins] = await Promise.all([this.wash.facilities(this.event._id), this.wash.pins(this.event._id)]);
      this.facilities = list.facilities;
      this.requireQr = !!list.requireQr;
      this.pins = pins;
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the facilities.';
    } finally {
      this.loading = false;
    }
  }

  // ── QR stickers (WA2) ──

  /** Flips "Require a QR scan" for the event; puts the switch back if the save fails. */
  async toggleRequireQr() {
    if (!this.event || this.savingQr) return;
    const want = !this.requireQr;
    this.savingQr = true;
    this.requireQr = want;
    try {
      this.requireQr = (await this.wash.setRequireQr(this.event._id, want)).requireQr;
      this.notify.openSucessSnackBar(this.requireQr ? 'Refilled / Cleaned now need a QR scan' : 'QR scan no longer needed');
    } catch (err: any) {
      this.requireQr = !want;
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not save the option.');
    } finally {
      this.savingQr = false;
    }
  }

  /**
   * Opens a print sheet with one sticker per facility. The window is opened
   * straight from the click (so it isn't blocked), then filled when the
   * stickers arrive.
   */
  async printStickers() {
    if (!this.event || this.printing) return;
    const win = window.open('', '_blank');
    if (!win) { this.notify.openErrorSnackBar('Allow pop-ups for this site to print the stickers.'); return; }
    win.document.write('<p style="font-family:sans-serif">Making the stickers…</p>');
    this.printing = true;
    try {
      const stickers = await this.wash.stickers(this.event._id);
      win.document.open();
      win.document.write(stickerSheetHtml(stickers, this.event.name));
      win.document.close();
    } catch (err: any) {
      win.close();
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not make the stickers.');
    } finally {
      this.printing = false;
    }
  }

  trackFacility = (_: number, f: WashFacility) => f._id;
  trackPin = (_: number, p: WashPin) => p._id;
  pinLabel(p: WashPin): string { return `${p.name} · ${p.place === 'area' ? 'Washroom area' : KIND_INFO[p.type].label + ' pin'}`; }

  // ── panel ──

  startAdd() {
    this.mode = 'add';
    this.editing = null;
    this.source = this.pins.length ? 'pin' : 'new';
    this.form = this.blank();
    this.formError = '';
  }

  edit(f: WashFacility) {
    this.mode = 'edit';
    this.editing = f;
    this.form = { ...this.blank(), type: f.kind, intervalHours: f.intervalHours, capacityLitres: f.capacityLitres };
    this.formError = '';
  }

  close() { this.mode = 'closed'; this.editing = null; }

  /** The kind of the facility being added / edited (the picked pin's type for an existing pin). */
  get formKind(): WashKind {
    if (this.mode === 'edit' && this.editing) return this.editing.kind;
    if (this.source === 'pin') return this.pins.find(p => p._id === this.form.pin)?.type || 'water';
    return this.form.type;
  }

  get panelTitle(): string { return this.mode === 'edit' ? (this.editing?.name || '') : 'Add facility'; }
  get panelSubtitle(): string { return this.mode === 'edit' && this.editing ? KIND_INFO[this.editing.kind].label : 'Water station or toilets'; }

  useMyLocation() {
    if (!navigator.geolocation) { this.notify.openErrorSnackBar('This browser cannot share its location'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { this.form.coords = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`; },
      () => this.notify.openErrorSnackBar('Could not get your location'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  private validInterval(): number | null {
    const h = Number(this.form.intervalHours);
    return Number.isInteger(h) && h >= 1 && h <= 24 ? h : null;
  }

  private validCapacity(): number | null | undefined {
    const c = this.form.capacityLitres;
    if (c === null || c === undefined || (c as any) === '') return null;
    return Number.isInteger(Number(c)) && Number(c) >= 1 ? Number(c) : undefined;
  }

  async save() {
    if (!this.event || this.busy) return;
    const intervalHours = this.validInterval();
    if (!intervalHours) { this.formError = 'Every 1 to 24 hours (whole hours).'; return; }
    const capacity = this.formKind === 'water' ? this.validCapacity() : null;
    if (capacity === undefined) { this.formError = 'Capacity: a whole number of litres, or leave it empty.'; return; }

    let data: NewFacility | null = null;
    if (this.mode === 'add') {
      if (this.source === 'pin') {
        const picked = this.pins.find(p => p._id === this.form.pin);
        if (!picked) { this.formError = 'Pick a place from the map.'; return; }
        data = picked.place === 'area'
          ? { event: this.event._id, area: picked._id, intervalHours }
          : { event: this.event._id, location: picked._id, intervalHours, capacityLitres: capacity };
      } else {
        const name = this.form.name.trim();
        const ll = parseLatLng(this.form.coords);
        if (!name) { this.formError = 'Give it a name.'; return; }
        if (!ll) { this.formError = 'Use my location, or paste the coordinates (e.g. 20.98, 79.35).'; return; }
        data = { event: this.event._id, name, type: this.form.type, lat: ll[0], lng: ll[1], intervalHours, capacityLitres: capacity };
      }
    }

    this.busy = true;
    this.formError = '';
    try {
      if (data) {
        await this.wash.add(data);
        this.notify.openSucessSnackBar('Facility added');
      } else if (this.editing) {
        await this.wash.update(this.editing._id, { intervalHours, ...(this.editing.kind === 'water' ? { capacityLitres: capacity } : {}) });
        this.notify.openSucessSnackBar('Saved');
      }
      this.close();
      await this.load();
    } catch (err: any) {
      this.formError = err?.error?.message || 'Could not save.';
    } finally {
      this.busy = false;
    }
  }

  remove(f: WashFacility) {
    const n = f.logCount || 0;
    const what = n ? ` and its ${n} log ${n === 1 ? 'entry' : 'entries'}` : '';
    this.confirm.confirm({
      title: 'Remove Facility',
      message: `Remove ${f.name}${what} from WASH? The pin stays on the Venue Map.`,
      confirmText: 'Remove', danger: true
    }).subscribe(async ok => {
      if (!ok) return;
      try {
        await this.wash.remove(f._id);
        this.notify.openSucessSnackBar('Facility removed');
        this.close();
        await this.load();
      } catch (err: any) {
        this.notify.openErrorSnackBar(err?.error?.message || 'Could not remove the facility.');
      }
    });
  }
}
