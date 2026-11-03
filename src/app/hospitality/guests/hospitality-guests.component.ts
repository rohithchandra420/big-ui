import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { EventItem } from '../../models/event.model';
import { HospitalityService } from '../hospitality.service';
import { Guest, GuestPass, MEALS, MealKey, PASS_KINDS, PassKind } from '../hospitality.model';

type Filter = 'all' | 'today' | 'nopass';
interface PassForm { kind: PassKind; meal: MealKey; from: string; to: string; veg: number; nonVeg: number }

/**
 * Hospitality › Guests (H3): people who eat at the Mess Hall without a BiG
 * account, and their Meal Passes — issue, share (QR card: download, share,
 * print) and revoke. Per event. HospitalityGuard; the server checks too.
 */
@Component({
  selector: 'app-hospitality-guests',
  templateUrl: './hospitality-guests.component.html',
  styleUrls: ['./hospitality-guests.component.css']
})
export class HospitalityGuestsComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  today = '';
  guests: Guest[] = [];
  /** Filtered, stored list for the *ngFor (never built in a getter). */
  shown: Guest[] = [];
  loading = false;
  loadError = '';
  busy = false;

  search = '';
  filter: Filter = 'all';
  counts = { all: 0, today: 0, nopass: 0 };

  selected: Guest | null = null;
  /** 'new' = Add guest form; 'edit' = editing the selected guest. */
  mode: 'view' | 'new' | 'edit' = 'view';
  form = { name: '', phone: '', note: '' };
  formError = '';

  issuing = false;
  pass: PassForm = this.blankPass();
  passError = '';

  readonly kinds = PASS_KINDS;
  readonly meals = MEALS;

  private sub = new Subscription();

  constructor(
    private events: EventService,
    private hospitality: HospitalityService,
    private notify: NotificationService,
    private confirm: ConfirmationService
  ) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.selected = null; this.mode = 'view'; this.load(); }
    }));
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  async load() {
    if (!this.event) { this.guests = []; this.apply(); return; }
    this.loading = !this.guests.length;
    this.loadError = '';
    try {
      const res = await this.hospitality.getGuests(this.event._id);
      this.today = res.today;
      this.guests = res.guests;
      if (this.selected) this.selected = this.guests.find(g => g._id === this.selected!._id) || null;
      this.apply();
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the guests.';
    } finally {
      this.loading = false;
    }
  }

  private validToday = (g: Guest) => g.passes.some(p => p.validToday);
  private hasLivePass = (g: Guest) => g.passes.some(p => !p.revoked && !p.ended);

  apply() {
    const q = this.search.trim().toLowerCase();
    this.counts = {
      all: this.guests.length,
      today: this.guests.filter(this.validToday).length,
      nopass: this.guests.filter(g => !this.hasLivePass(g)).length
    };
    this.shown = this.guests.filter(g =>
      (!q || g.name.toLowerCase().includes(q) || g.note.toLowerCase().includes(q) || g.phone.includes(q)) &&
      (this.filter === 'all' || (this.filter === 'today' ? this.validToday(g) : !this.hasLivePass(g))));
  }

  setFilter(f: Filter) { this.filter = f; this.apply(); }
  trackGuest = (_: number, g: Guest) => g._id;
  trackPass = (_: number, p: GuestPass) => p._id;
  platesText(p: { vegPlates: number; nonVegPlates: number }): string {
    return [p.vegPlates ? `${p.vegPlates} Veg` : '', p.nonVegPlates ? `${p.nonVegPlates} Non-veg` : ''].filter(Boolean).join(' · ');
  }
  passState(p: GuestPass): string { return p.revoked ? 'Revoked' : p.validToday ? 'Valid today' : p.ended ? 'Ended' : 'Upcoming'; }

  // ── guest form ──
  open(g: Guest) {
    this.selected = g;
    this.mode = 'view';
    this.issuing = false;
  }
  newGuest() {
    this.selected = null;
    this.mode = 'new';
    this.form = { name: '', phone: '', note: '' };
    this.formError = '';
  }
  editGuest() {
    if (!this.selected) return;
    this.mode = 'edit';
    this.form = { name: this.selected.name, phone: this.selected.phone, note: this.selected.note };
    this.formError = '';
  }
  closePanel() { this.selected = null; this.mode = 'view'; this.issuing = false; }

  async saveGuest() {
    if (!this.event || this.busy) return;
    const data = { name: this.form.name.trim(), phone: this.form.phone.trim(), note: this.form.note.trim() };
    if (!data.name) { this.formError = 'Name is required.'; return; }
    this.busy = true;
    try {
      if (this.mode === 'new') {
        const g = await this.hospitality.addGuest(this.event._id, data);
        await this.load();
        this.selected = this.guests.find(x => x._id === g._id) || null;
        this.mode = 'view';
        this.startPass();          // a new guest usually needs a pass next
      } else if (this.selected) {
        await this.hospitality.updateGuest(this.selected._id, data);
        await this.load();
        this.mode = 'view';
      }
    } catch (err: any) {
      this.formError = err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save the guest.';
    } finally {
      this.busy = false;
    }
  }

  deleteGuest() {
    const g = this.selected;
    if (!g) return;
    this.confirm.confirm({ title: 'Delete Guest', message: `Delete ${g.name} and their passes?`, confirmText: 'Delete', danger: true })
      .subscribe(async ok => {
        if (!ok) return;
        try {
          await this.hospitality.deleteGuest(g._id);
          this.closePanel();
          await this.load();
          this.notify.openSucessSnackBar('Guest deleted');
        } catch (err: any) {
          this.notify.openErrorSnackBar(err?.error?.message || 'Could not delete the guest.');
        }
      });
  }

  // ── passes ──
  private blankPass(): PassForm {
    return { kind: 'one_day', meal: 'lunch', from: this.today, to: this.today, veg: 1, nonVeg: 0 };
  }
  startPass() {
    this.pass = this.blankPass();
    this.passError = '';
    this.issuing = true;
  }
  step(field: 'veg' | 'nonVeg', by: number) {
    this.pass[field] = Math.max(0, Math.min(50, this.pass[field] + by));
  }

  async issuePass() {
    const g = this.selected;
    if (!g || this.busy) return;
    const p = this.pass;
    if (p.veg + p.nonVeg < 1) { this.passError = 'A pass needs at least one plate.'; return; }
    this.busy = true;
    this.passError = '';
    try {
      const issued = await this.hospitality.issuePass(g._id, {
        kind: p.kind, meal: p.kind === 'one_meal' ? p.meal : null, from: p.from,
        to: p.kind === 'range' ? p.to : null, vegPlates: p.veg, nonVegPlates: p.nonVeg
      });
      this.issuing = false;
      await this.load();
      this.notify.openSucessSnackBar('Meal Pass issued');
      this.share(issued, 'download');
    } catch (err: any) {
      this.passError = err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not issue the pass.';
    } finally {
      this.busy = false;
    }
  }

  revoke(p: GuestPass) {
    this.confirm.confirm({ title: 'Revoke Pass', message: `Revoke "${p.label}"? Its QR stops working at the Serving desk.`, confirmText: 'Revoke', danger: true })
      .subscribe(async ok => {
        if (!ok) return;
        try {
          await this.hospitality.revokePass(p._id);
          await this.load();
          this.notify.openSucessSnackBar('Pass revoked');
        } catch (err: any) {
          this.notify.openErrorSnackBar(err?.error?.message || 'Could not revoke the pass.');
        }
      });
  }

  /** The shareable pass card: download the PNG, share it (phone share sheet) or print it. */
  async share(p: GuestPass, how: 'download' | 'share' | 'print') {
    try {
      const card = await this.hospitality.passCard(p._id);
      const blob = await this.drawCard(card);
      const file = `meal-pass-${card.guest.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'guest'}.png`;
      const url = URL.createObjectURL(blob);
      if (how === 'share') {
        const f = new File([blob], file, { type: 'image/png' });
        const nav = navigator as any;
        if (nav.canShare?.({ files: [f] })) {
          await nav.share({ files: [f], title: 'Meal Pass', text: `${card.guest} · ${card.label}` });
          return;
        }
        how = 'download';   // no share sheet here (desktop): save the file instead
      }
      if (how === 'print') {
        const w = window.open('', '_blank');
        if (!w) { this.notify.openErrorSnackBar('Allow pop-ups to print the pass.'); return; }
        w.document.write(`<title>Meal Pass</title><img src="${url}" style="max-width:100%" onload="setTimeout(function(){print()},200)">`);
        w.document.close();
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = file;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err: any) {
      if (err?.name === 'AbortError') return;   // share sheet closed
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not make the pass card.');
    }
  }

  /** Draws the card in the browser (no extra package): event, guest, pass, plates, QR. */
  private drawCard(card: { image: string; guest: string; note: string; label: string; vegPlates: number; nonVegPlates: number }): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const qr = new Image();
      qr.onload = () => {
        const W = 600, H = 820, c = document.createElement('canvas');
        c.width = W; c.height = H;
        const g = c.getContext('2d')!;
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#1E4638'; g.fillRect(0, 0, W, 96);
        g.fillStyle = '#ffffff'; g.font = '700 30px Inter, system-ui, sans-serif'; g.textAlign = 'center';
        g.fillText('Meal Pass', W / 2, 46);
        g.font = '400 18px Inter, system-ui, sans-serif';
        g.fillText(this.event?.name || '', W / 2, 76);
        g.fillStyle = '#1f2a24'; g.font = '700 32px Inter, system-ui, sans-serif';
        g.fillText(card.guest, W / 2, 150, W - 60);
        g.fillStyle = '#6b7a72'; g.font = '400 18px Inter, system-ui, sans-serif';
        if (card.note) g.fillText(card.note, W / 2, 180, W - 60);
        g.fillStyle = '#1f2a24'; g.font = '600 22px Inter, system-ui, sans-serif';
        g.fillText(card.label, W / 2, 226, W - 60);
        g.fillStyle = '#b45309'; g.font = '700 20px Inter, system-ui, sans-serif';
        g.fillText(this.platesText(card) + ' per meal', W / 2, 260, W - 60);
        g.drawImage(qr, (W - 420) / 2, 290, 420, 420);
        g.fillStyle = '#6b7a72'; g.font = '400 16px Inter, system-ui, sans-serif';
        g.fillText('Show this QR at the Mess Hall Serving desk.', W / 2, 760);
        c.toBlob(b => b ? resolve(b) : reject(new Error('canvas')), 'image/png');
      };
      qr.onerror = reject;
      qr.src = card.image;
    });
  }
}
