import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';
import { localDate, localTime } from '../../workshops/planner.utils';
import { HospitalityService } from '../hospitality.service';
import { MEALS, MealDay, MealKey, MealRef, MessDay, NotMarkedRow, SLOT_LABELS } from '../hospitality.model';

interface RailItem { meal: MealDay; icon: string; colour: string; statusText: string; countText: string; countSent: boolean }

const REFRESH_MS = 60 * 1000;

/**
 * Hospitality › Today (H1, layout as mocks/mock-hospitality.html): the day's
 * four meals, the kitchen's expected Veg / Non-veg count, who isn't marked yet
 * (Remind TLs), Mess Hall open / close and meal alerts.
 * HospitalityGuard; the server checks too.
 */
@Component({
  selector: 'app-hospitality-today',
  templateUrl: './hospitality-today.component.html',
  styleUrls: ['./hospitality-today.component.css']
})
export class HospitalityTodayComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  day: MessDay | null = null;
  loading = false;
  loadError = '';
  busy = '';
  /** null = today (follows the clock). */
  date: string | null = null;
  selectedKey: MealKey = 'lunch';

  // Stored for the *ngFor (stable identities, never built in a getter).
  rail: RailItem[] = [];
  selected: MealDay | null = null;
  notMarked: NotMarkedRow[] = [];

  editingTime = false;
  newTime = '';
  whatsapp = '';
  alertText = '';

  private sub = new Subscription();
  private timer: any;

  constructor(private events: EventService, private hospitality: HospitalityService, private notify: NotificationService) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.date = null; this.load(true); }
    }));
    this.timer = setInterval(() => { if (!this.busy && !this.editingTime) this.load(); }, REFRESH_MS);
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    clearInterval(this.timer);
  }

  async load(pickMeal = false) {
    if (!this.event) { this.day = null; this.apply(); return; }
    this.loading = !this.day;
    this.loadError = '';
    try {
      this.day = await this.hospitality.getDay(this.event._id, this.date || undefined);
      if (pickMeal) this.selectedKey = this.defaultMeal();
      this.apply();
    } catch {
      this.loadError = 'Could not load the mess day.';
    } finally {
      this.loading = false;
    }
  }

  /** The open meal, else the next one whose count isn't sent, else the last. */
  private defaultMeal(): MealKey {
    const meals = this.day?.meals || [];
    return (meals.find(m => m.status === 'open') || meals.find(m => m.status === 'upcoming' && !m.count) || meals[meals.length - 1])?.meal || 'lunch';
  }

  private apply() {
    const meals = this.day?.meals || [];
    this.rail = meals.map(m => {
      const info = MEALS.find(x => x.key === m.meal)!;
      return {
        meal: m, icon: info.icon, colour: info.colour,
        statusText: this.statusText(m),
        countSent: !!m.count,
        countText: m.count ? 'Count sent' : (m.status === 'upcoming' ? `Count due ${this.time(m.countDueAt)}` : '')
      };
    });
    this.selected = meals.find(m => m.meal === this.selectedKey) || null;
    this.notMarked = this.selected?.notMarked || [];
  }

  private statusText(m: MealDay): string {
    if (m.status === 'open') return `Open until ${this.time(m.end)}`;
    if (m.status === 'upcoming') return `Opens ${this.time(m.start)}`;
    return m.closedEarly ? 'Closed early' : 'Closed';
  }

  select(key: MealKey) {
    this.selectedKey = key;
    this.editingTime = false;
    this.whatsapp = '';
    this.apply();
  }

  trackRail = (_: number, r: RailItem) => r.meal.meal;
  trackDept = (_: number, r: NotMarkedRow) => r.department?._id || 'none';

  time(iso: string): string { return localTime(new Date(iso)); }
  get isToday(): boolean { return !!this.day && this.day.date === this.day.today; }
  get dayLabel(): string {
    if (!this.day?.date) return '';
    const d = new Date(this.day.date + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  /** "Mess day 24 of 31". */
  get messDayText(): string {
    const p = this.day?.plan, d = this.day?.date;
    if (!p?.opensOn || !p?.closesOn || !d) return '';
    const dayMs = 86400000;
    const n = Math.round((Date.parse(d) - Date.parse(p.opensOn.slice(0, 10))) / dayMs) + 1;
    const of = Math.round((Date.parse(p.closesOn.slice(0, 10)) - Date.parse(p.opensOn.slice(0, 10))) / dayMs) + 1;
    return n >= 1 && n <= of ? `Mess day ${n} of ${of}` : '';
  }
  /** "closes in 1 h 48 min" for the open meal. */
  get closesIn(): string {
    if (!this.selected || this.selected.status !== 'open') return '';
    const min = Math.max(0, Math.round((new Date(this.selected.end).getTime() - Date.now()) / 60000));
    return min >= 60 ? `closes in ${Math.floor(min / 60)} h ${min % 60} min` : `closes in ${min} min`;
  }
  get basisIcon(): string {
    const slot = this.selected?.basis.slot;
    return slot === 'night' ? 'bedtime' : slot === 'afternoon' ? 'light_mode' : 'wb_sunny';
  }
  get basisText(): string {
    const s = this.selected;
    return s ? `${SLOT_LABELS[s.basis.slot]} attendance` : '';
  }
  /** % of a department already marked. */
  meterOf(r: NotMarkedRow): number { return r.total ? Math.round((r.total - r.missing) / r.total * 100) : 100; }

  /** Minutes until the kitchen needs the selected meal's count (negative = late). */
  get minutesToDue(): number {
    return this.selected ? Math.round((new Date(this.selected.countDueAt).getTime() - Date.now()) / 60000) : 0;
  }

  shiftDay(n: number) {
    const base = new Date((this.day?.date || localDate(new Date())) + 'T00:00:00');
    base.setDate(base.getDate() + n);
    const next = localDate(base);
    this.date = next === this.day?.today ? null : next;
    this.load(true);
  }

  private ref(): MealRef | null {
    if (!this.event || !this.day?.date || !this.selected) return null;
    return { event: this.event._id, date: this.day.date, meal: this.selected.meal };
  }

  /** Runs one action on the selected meal and puts the fresh meal back in place. */
  private async run(name: string, fn: (ref: MealRef) => Promise<MealDay>, ok: string) {
    const ref = this.ref();
    if (!ref || this.busy) return;
    this.busy = name;
    try {
      const fresh = await fn(ref);
      if (this.day?.meals) this.day.meals = this.day.meals.map(m => m.meal === fresh.meal ? fresh : m);
      this.apply();
      this.notify.openSucessSnackBar(ok);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'That did not work. Please try again.');
    } finally {
      this.busy = '';
    }
  }

  sendCount() { this.run('count', r => this.hospitality.sendCount(r), 'Count saved for the kitchen'); }
  closeMess() { this.run('close', r => this.hospitality.close(r), 'Mess Hall closed — staff notified'); }
  reopenMess() { this.run('reopen', r => this.hospitality.reopen(r), 'Mess Hall open again — staff notified'); }

  startEditTime() {
    if (!this.selected) return;
    this.newTime = this.time(this.selected.start);
    this.editingTime = true;
  }
  saveTime() {
    const t = this.newTime;
    this.editingTime = false;
    this.run('time', r => this.hospitality.setMealTime(r, t), `${this.selected?.label} now opens at ${t} on this day`);
  }
  resetTime() {
    this.editingTime = false;
    this.run('time', r => this.hospitality.resetMealTime(r), 'Back to the usual time');
  }

  async remindTls() {
    const ref = this.ref();
    if (!ref || this.busy) return;
    this.busy = 'remind';
    try {
      const r = await this.hospitality.remindTls(ref);
      this.notify.openSucessSnackBar(r.tls
        ? `Task sent to ${r.tls} Team Lead${r.tls === 1 ? '' : 's'} (on their Billboard; ${r.delivered} phone notification${r.delivered === 1 ? '' : 's'})`
        : 'Nobody to remind — everyone is marked');
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not send the reminders.');
    } finally {
      this.busy = '';
    }
  }

  /** "Copy for WhatsApp": the count as a message for the kitchen group. */
  async copyWhatsapp() {
    const s = this.selected;
    if (!s || !this.event) return;
    const n = s.count || s.expected;
    this.whatsapp = [
      `*${this.event.name} · ${s.label} · ${this.dayLabel}*`,
      `🟢 Veg: ${n.veg}`,
      `🔴 Non-veg: ${n.nonVeg}`,
      `*Total: ${n.veg + n.nonVeg}*`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(this.whatsapp);
      this.notify.openSucessSnackBar('Copied — paste it into the kitchen WhatsApp group');
    } catch {
      this.notify.openErrorSnackBar('Could not copy — select the text below and copy it.');
    }
  }

  async sendAlert() {
    const text = this.alertText.trim();
    if (!text || !this.event || this.busy) return;
    this.busy = 'alert';
    try {
      const r = await this.hospitality.sendAlert(this.event._id, text);
      this.alertText = '';
      this.notify.openSucessSnackBar(`Alert sent to ${r.recipients} ${r.recipients === 1 ? 'person' : 'people'}`);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not send the alert.');
    } finally {
      this.busy = '';
    }
  }
}
