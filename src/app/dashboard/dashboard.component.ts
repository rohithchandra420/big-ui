import { Component, ElementRef, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

import { AuthService } from '../core/auth.service';
import { EventService } from '../core/event.service';
import { EventItem } from '../models/event.model';
import { DashboardMine, DashboardOverview, DashboardService, SessionRow } from './dashboard.service';

Chart.register(...registerables);

const TOP_ROLES = ['DEV', 'DIR', 'ADMIN'];
const REFRESH_MS = 60_000;
const IST_MIN = 330;
const COLOURS = { c1: '#1E4638', c2: '#4f9d7e', c3: '#e69b00', line: '#e5e5e5', bad: '#dc2626', muted: '#666' };
const SLOT_LABELS: Record<string, string> = { morning: 'Morning', afternoon: 'Noon', night: 'Night' };
const PILL: Record<string, string> = { urgent: 'bad', weather: 'ok', task: 'warn', schedule: 'warn', reminder: 'warn', email: 'ok', meal: 'ok', sos: 'bad' };

/** Hours (with fraction) of an instant in India time. */
export function istHours(iso: string | Date): number {
  const d = new Date(iso);
  const m = ((d.getUTCHours() * 60 + d.getUTCMinutes() + IST_MIN) % 1440 + 1440) % 1440;
  return m / 60;
}

/** ₹18.4L / ₹42k / ₹900 */
export function money(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${Math.round(n / 1e3)}k`;
  return `₹${Math.round(n)}`;
}

export interface Lane { venue: string; blocks: { left: number; width: number; title: string; colour: string; tip: string; over: boolean }[]; }

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit, OnDestroy {
  isAuthenticated = false;
  isTop = false;
  isDirector = false;
  event: EventItem | null = null;

  data: DashboardOverview | null = null;
  mine: DashboardMine | null = null;
  loading = false;
  error = '';

  // Derived once per load (stable lists for *ngFor)
  days: { label: string; sub: string; now: boolean }[] = [];
  heatRows: { slot: string; cells: { v: number; shade: string; dark: boolean }[] }[] = [];
  heatDays: string[] = [];
  lanes: Lane[] = [];
  axis: string[] = [];
  nowPct: number | null = null;
  updatedText = '';

  private subs = new Subscription();
  private timer: any = null;
  private seq = 0;
  private charts = new Map<string, Chart>();

  constructor(
    private auth: AuthService,
    private events: EventService,
    private api: DashboardService,
    private host: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    this.subs.add(this.auth.user.subscribe(user => {
      this.isAuthenticated = !!user;
      this.isTop = TOP_ROLES.includes(user?.role || '');
      this.isDirector = user?.role === 'DIR';
      if (!user) this.clear();
    }));
    this.subs.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.clear(); this.load(); }
    }));
    this.timer = setInterval(() => { if (!document.hidden) this.load(true); }, REFRESH_MS);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    clearInterval(this.timer);
    this.charts.forEach(c => c.destroy());
  }

  @HostListener('document:visibilitychange')
  onVisible(): void { if (!document.hidden) this.load(true); }

  load(quiet = false): void {
    if (!this.isAuthenticated || !this.event) return;
    const mySeq = ++this.seq;
    const eventId = this.event._id;
    if (!quiet) this.loading = true;
    const done = () => { if (mySeq === this.seq) this.loading = false; };
    if (this.isTop) {
      this.api.overview(eventId).subscribe({
        next: d => { if (mySeq !== this.seq) return; this.error = ''; this.data = d; this.derive(d); done(); setTimeout(() => this.drawCharts()); },
        error: () => { if (mySeq !== this.seq) return; this.error = 'Could not load the dashboard. It will try again in a minute.'; done(); }
      });
    } else {
      this.api.mine(eventId).subscribe({
        next: m => { if (mySeq !== this.seq) return; this.error = ''; this.mine = m; this.updatedText = 'Updated just now'; done(); },
        error: () => { if (mySeq !== this.seq) return; this.error = 'Could not load your day. It will try again in a minute.'; done(); }
      });
    }
  }

  private clear(): void {
    this.seq++;
    this.data = null; this.mine = null; this.error = '';
    this.charts.forEach(c => c.destroy());
    this.charts.clear();
  }

  // ── Display helpers ────────────────────────────────────────

  num(n: number | null | undefined): string { return (n ?? 0).toLocaleString('en-IN'); }
  money(n: number): string { return money(n); }
  pct(part: number, whole: number): number { return whole ? Math.round(part / whole * 100) : 0; }
  pill(type: string): string { return PILL[type] || ''; }
  typeLabel(type: string): string { return type.charAt(0).toUpperCase() + type.slice(1); }
  slotState(n: number, size: number): string { return !size ? '' : n >= size ? 'done' : n > 0 ? 'todo' : ''; }
  trackIdx(i: number): number { return i; }
  trackKind(_: number, a: { kind: string }): string { return a.kind; }
  trackName(_: number, r: { venue?: string; title?: string }): string { return r.venue || r.title || ''; }

  get slotKeys(): ('morning' | 'afternoon' | 'night')[] { return ['morning', 'afternoon', 'night']; }
  slotLabel(s: string): string { return SLOT_LABELS[s]; }

  // ── Derived lists ──────────────────────────────────────────

  private derive(d: DashboardOverview): void {
    this.updatedText = 'Updated just now';
    this.days = this.dayBand(d);
    this.heatDays = d.people.heat.map(r => this.weekday(r.date));
    this.heatRows = this.slotKeys.map(slot => ({
      slot: SLOT_LABELS[slot],
      cells: d.people.heat.map(r => {
        const v = r[slot];
        return { v, shade: v < 50 ? '#d6e8de' : v <= 80 ? '#6fae92' : '#1E4638', dark: v < 50 };
      })
    }));
    this.buildTimeline(d.workshops.today, d.today);
  }

  private weekday(dateKey: string): string {
    return new Date(dateKey + 'T00:00:00Z').toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
  }

  private dayBand(d: DashboardOverview): { label: string; sub: string; now: boolean }[] {
    const s = d.event.startDate?.slice(0, 10), e = d.event.endDate?.slice(0, 10);
    if (!s || !e) return [];
    const out = [];
    for (let t = Date.parse(s + 'T00:00:00Z'), i = 1; t <= Date.parse(e + 'T00:00:00Z') && i <= 7; t += 86400000, i++) {
      const key = new Date(t).toISOString().slice(0, 10);
      out.push({ label: this.weekday(key), sub: `Day ${i}`, now: key === d.today });
    }
    return out;
  }

  private buildTimeline(sessions: SessionRow[], today: string): void {
    if (!sessions.length) { this.lanes = []; this.axis = []; this.nowPct = null; return; }
    const from = Math.min(9, Math.floor(Math.min(...sessions.map(s => istHours(s.start)))));
    const to = Math.max(19, Math.ceil(Math.max(...sessions.map(s => istHours(s.end) || 24))));
    const span = to - from;
    const byVenue = new Map<string, Lane>();
    for (const s of sessions) {
      const a = istHours(s.start), b = istHours(s.end) || 24;
      const lane = byVenue.get(s.venue) || { venue: s.venue, blocks: [] };
      const over = !!s.capacity && s.attended > s.capacity;
      lane.blocks.push({
        left: (a - from) / span * 100, width: Math.max(2, (b - a) / span * 100), title: s.title, colour: s.colour, over,
        tip: `${s.title} · ${this.hhmm(a)}–${this.hhmm(b)} · ${s.attended}${s.capacity ? '/' + s.capacity : ''} in`
      });
      byVenue.set(s.venue, lane);
    }
    this.lanes = [...byVenue.values()];
    this.axis = [];
    const step = span > 12 ? 3 : 2;
    for (let h = from; h <= to; h += step) this.axis.push(String(h).padStart(2, '0'));
    const now = istHours(new Date());
    this.nowPct = now >= from && now <= to ? (now - from) / span * 100 : null;
  }

  private hhmm(h: number): string {
    const m = Math.round(h * 60);
    return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  // ── Charts ─────────────────────────────────────────────────

  private drawCharts(): void {
    const d = this.data;
    if (!d) return;
    const grid = { grid: { color: COLOURS.line }, border: { display: false }, ticks: { precision: 0 } };
    const nogrid = { grid: { display: false }, border: { display: false } };
    const legend = { legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 10 } } };

    const hours = d.gate.perHour;
    const busy = hours.filter(h => h.count > 0).map(h => h.hour);
    const nowH = Math.floor(istHours(new Date()));
    const first = Math.min(8, ...busy), last = Math.max(18, nowH, ...busy);
    const gateHours = hours.filter(h => h.hour >= first && h.hour <= last);
    this.chart('cGate', { type: 'line', data: { labels: gateHours.map(h => String(h.hour)),
      datasets: [{ label: 'Admitted', data: gateHours.map(h => h.count), borderColor: COLOURS.c1, backgroundColor: COLOURS.c1 + '22', fill: true, tension: .35, pointRadius: 0 }] },
      options: { scales: { x: nogrid, y: grid } } });

    this.chart('cAdm', { type: 'doughnut', data: { labels: ['Admitted', 'Not yet'],
      datasets: [{ data: [d.gate.admitted, d.gate.notAdmitted], backgroundColor: [COLOURS.c1, COLOURS.line], borderWidth: 0 }] }, options: { cutout: '72%' } as any });

    this.chart('cPass', { type: 'bar', data: { labels: d.gate.byType.map(t => t.name),
      datasets: [{ label: 'Sold', data: d.gate.byType.map(t => t.count), backgroundColor: COLOURS.c2, borderRadius: 5 }] },
      options: { indexAxis: 'y', scales: { x: grid, y: nogrid } } });

    const stacked = (rows: { name: string; beds: number; used: number }[], colour: string, horizontal: boolean): ChartConfiguration => ({
      type: 'bar', data: { labels: rows.map(r => r.name), datasets: [
        { label: 'Used', data: rows.map(r => r.used), backgroundColor: colour, borderRadius: 4 },
        { label: 'Free', data: rows.map(r => Math.max(0, r.beds - r.used)), backgroundColor: COLOURS.line, borderRadius: 4 }] },
      options: { indexAxis: horizontal ? 'y' : 'x', plugins: legend,
        scales: horizontal ? { x: { ...grid, stacked: true }, y: { ...nogrid, stacked: true } } : { x: { ...nogrid, stacked: true }, y: { ...grid, stacked: true } } }
    });
    this.chart('cTent', stacked(d.accommodation.tents, COLOURS.c1, true));
    this.chart('cBeds', stacked(d.accommodation.beds.byType, COLOURS.c2, false));

    this.chart('cDept', { type: 'bar', data: { labels: d.people.byDept.map(r => r.name),
      datasets: [{ label: 'Staff', data: d.people.byDept.map(r => r.count), backgroundColor: COLOURS.c1, borderRadius: 5 }] },
      options: { indexAxis: 'y', scales: { x: grid, y: nogrid } } });

    const meals = d.meals.today;
    this.chart('cMeals', { type: 'bar', data: { labels: meals.map(m => m.label), datasets: [
      { label: 'Expected', data: meals.map(m => m.expected), backgroundColor: COLOURS.line, borderRadius: 4 },
      { label: 'Served', data: meals.map(m => m.served), backgroundColor: COLOURS.c1, borderRadius: 4 },
      { label: 'Prepared', data: meals.map(m => m.prepared ?? 0), backgroundColor: COLOURS.c3, borderRadius: 4 }] },
      options: { plugins: legend, scales: { x: nogrid, y: grid } } });

    this.chart('cLeft', { type: 'line', data: { labels: d.meals.leftover.map(r => this.weekday(r.date)),
      datasets: [{ label: 'Left over %', data: d.meals.leftover.map(r => r.leftoverPct), borderColor: COLOURS.c3, backgroundColor: COLOURS.c3 + '22',
        fill: true, tension: .3, pointRadius: 4, pointBackgroundColor: COLOURS.c3, spanGaps: true }] },
      options: { scales: { x: nogrid, y: { ...grid, beginAtZero: true, title: { display: true, text: '% of prepared' } } } } });

    const cats = d.workshops.byCategory;
    this.chart('cCat', { type: 'doughnut', data: { labels: cats.map(c => c.name),
      datasets: [{ data: cats.map(c => c.visits), backgroundColor: cats.map(c => c.colour), borderWidth: 0 }] },
      options: { cutout: '62%', plugins: legend } as any });

    const e = d.comms.email;
    this.chart('cMail', { type: 'bar', data: { labels: ['Sent', 'Not sent', 'Failed', 'Bounced', 'No email'],
      datasets: [{ label: 'Bookings', data: [e.sent, e.notSent + e.sending, e.failed, e.bounced, e.noEmail],
        backgroundColor: [COLOURS.c1, COLOURS.line, COLOURS.c3, COLOURS.bad, '#9a9a9a'], borderRadius: 5 }] },
      options: { scales: { x: nogrid, y: grid } } });
  }

  /** Creates the chart once, then only swaps its data (no flicker on refresh). */
  private chart(id: string, config: ChartConfiguration): void {
    const canvas = this.host.nativeElement.querySelector<HTMLCanvasElement>(`#${id}`);
    const existing = this.charts.get(id);
    if (existing && existing.canvas === canvas) {
      existing.data = config.data;
      existing.update('none');
      return;
    }
    existing?.destroy();
    if (!canvas) { this.charts.delete(id); return; }
    const options: any = { maintainAspectRatio: false, responsive: true, animation: { duration: 300 }, ...config.options };
    options.plugins = { legend: { display: false }, ...(options.plugins || {}) };
    this.charts.set(id, new Chart(canvas, { ...config, options } as ChartConfiguration));
  }
}
