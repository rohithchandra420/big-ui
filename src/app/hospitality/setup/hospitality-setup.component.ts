import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';
import { HospitalityService } from '../hospitality.service';
import { MEALS, MealKey, MessSetup } from '../hospitality.model';

interface MealRow { key: MealKey; label: string; colour: string; basis: string }
interface StripDay { key: string; fest: boolean; today: boolean; title: string }

/**
 * Hospitality › Setup (H1): the mess dates, the usual meal times, how long the
 * Mess Hall stays open, the Snacks count basis, when the kitchen count is due,
 * and which Venue Map pin is the Mess Hall. Layout as
 * mocks/mock-hospitality.html. HospitalityGuard; the server checks too.
 */
@Component({
  selector: 'app-hospitality-setup',
  templateUrl: './hospitality-setup.component.html',
  styleUrls: ['./hospitality-setup.component.css']
})
export class HospitalitySetupComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  setup: MessSetup | null = null;
  loading = false;
  loadError = '';
  saving = false;
  error = '';

  opensOn = '';
  closesOn = '';
  times: Record<MealKey, string> = { breakfast: '07:30', lunch: '12:30', snacks: '16:30', dinner: '20:00' };
  openHours = 2.5;
  snacksBasis: 'morning' | 'afternoon' = 'morning';
  countDueAfterMin = 45;
  remindBeforeMin = 30;
  messHall = '';
  /** One block per mess day for the calendar strip (stored, rebuilt on date change). */
  strip: StripDay[] = [];

  readonly rows: MealRow[] = MEALS.map(m => ({
    key: m.key, label: m.label, colour: m.colour,
    basis: m.key === 'breakfast' ? 'Previous night' : m.key === 'lunch' ? 'Morning' : m.key === 'dinner' ? 'Noon' : ''
  }));
  readonly dueOptions = [15, 30, 45, 60, 90];
  readonly remindOptions = [15, 30, 45, 60];
  readonly openOptions = [1.5, 2, 2.5, 3];

  private sub = new Subscription();

  constructor(private events: EventService, private hospitality: HospitalityService, private notify: NotificationService) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) this.load();
    }));
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  trackRow = (_: number, r: MealRow) => r.key;
  trackDay = (_: number, d: StripDay) => d.key;

  async load() {
    if (!this.event) { this.setup = null; return; }
    this.loading = true;
    this.loadError = '';
    try {
      this.setup = await this.hospitality.getSetup(this.event._id);
      const p = this.setup.plan;
      const d = this.setup.defaults;
      this.opensOn = p ? p.opensOn.slice(0, 10) : '';
      this.closesOn = p ? p.closesOn.slice(0, 10) : '';
      this.times = { ...(p?.times || d.times) };
      this.openHours = (p?.openMinutes ?? d.openMinutes) / 60;
      this.snacksBasis = p?.snacksBasis || d.snacksBasis;
      this.countDueAfterMin = p?.countDueAfterMin ?? d.countDueAfterMin;
      this.remindBeforeMin = p?.remindBeforeMin ?? d.remindBeforeMin ?? 30;
      this.messHall = p?.messHall || '';
      this.buildStrip();
    } catch {
      this.loadError = 'Could not load the mess setup.';
    } finally {
      this.loading = false;
    }
  }

  /** Length of the mess in days (0 when the dates aren't set or are the wrong way round). */
  get messDays(): number {
    if (!this.opensOn || !this.closesOn) return 0;
    const n = Math.round((Date.parse(this.closesOn) - Date.parse(this.opensOn)) / 86400000) + 1;
    return n > 0 ? n : 0;
  }

  /** "16–18 Nov (from the event)". */
  get festDays(): string {
    const s = this.event?.startDate, e = this.event?.endDate;
    if (!s) return 'Not set on the event';
    const fmt = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    return `${fmt(s)}${e ? ' – ' + fmt(e) : ''} (from the event)`;
  }

  get openText(): string {
    const h = Math.floor(this.openHours), m = Math.round((this.openHours - h) * 60);
    return m ? `${h} h ${m}` : `${h} h`;
  }

  buildStrip() {
    this.strip = [];
    const n = this.messDays;
    if (!n || n > 120) return;
    const fs = this.event?.startDate?.slice(0, 10) || '', fe = (this.event?.endDate || this.event?.startDate || '').slice(0, 10);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const d = new Date(this.opensOn + 'T00:00:00Z');
    for (let i = 0; i < n; i++, d.setUTCDate(d.getUTCDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      this.strip.push({ key, fest: !!fs && key >= fs && key <= fe, today: key === todayKey, title: key });
    }
  }

  async save() {
    if (!this.event || this.saving) return;
    this.error = '';
    if (!this.opensOn || !this.closesOn) { this.error = 'Pick the days the mess opens and closes.'; return; }
    if (!this.messDays) { this.error = 'The mess must close on or after the day it opens.'; return; }
    this.saving = true;
    try {
      await this.hospitality.saveSetup({
        event: this.event._id, opensOn: this.opensOn, closesOn: this.closesOn, times: { ...this.times },
        openMinutes: Math.round(this.openHours * 60), snacksBasis: this.snacksBasis,
        countDueAfterMin: this.countDueAfterMin, remindBeforeMin: this.remindBeforeMin, messHall: this.messHall || null
      });
      this.notify.openSucessSnackBar('Mess setup saved');
      await this.load();
    } catch (err: any) {
      this.error = err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save the mess setup.';
    } finally {
      this.saving = false;
    }
  }
}
