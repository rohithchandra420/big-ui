import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';
import { localDate } from '../../workshops/planner.utils';
import { HospitalityService } from '../hospitality.service';
import { MEALS, MessReport, ReportMeal } from '../hospitality.model';

interface Bar { date: string; label: string; pct: number | null; height: number; over: boolean }
interface FigForm { veg: number | null; nonVeg: number | null; kg: number | null; note: string }

const DECISION_LABELS: Record<string, string> = {
  served: 'Served', served_flagged: 'Served without attendance', refused: 'Refused', blocked: 'Blocked', extra: 'Extra plate'
};

/**
 * Hospitality › Report (H4, layout as the Report tab of mocks/mock-hospitality.html):
 * one day or a date range, optionally one department; per meal asked for /
 * prepared / served / left over, a total per day and a grand total, the
 * left-over trend, kitchen figures, and an Excel export. HospitalityGuard.
 */
@Component({
  selector: 'app-hospitality-report',
  templateUrl: './hospitality-report.component.html',
  styleUrls: ['./hospitality-report.component.css']
})
export class HospitalityReportComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  report: MessReport | null = null;
  loading = false;
  loadError = '';
  busy = false;
  exporting = false;

  mode: 'day' | 'range' = 'day';
  from = '';
  to = '';
  department = '';
  /** Stored for the *ngFor (never built in a getter). */
  departments: { _id: string; name: string }[] = [];
  bars: Bar[] = [];
  /** The meal open in the slide panel, "date|meal" ('' = closed). */
  openKey = '';
  /** The meal whose figures are being entered, "date|meal". */
  editing = '';
  fig: FigForm = { veg: null, nonVeg: null, kg: null, note: '' };

  private sub = new Subscription();

  constructor(
    private events: EventService,
    private hospitality: HospitalityService,
    private notify: NotificationService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    const q = this.route.snapshot?.queryParamMap;
    this.from = q?.get('date') || localDate(new Date());
    this.to = this.from;
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.department = ''; this.load(); }
    }));
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  async load() {
    if (!this.event) { this.report = null; return; }
    this.loading = !this.report;
    this.loadError = '';
    try {
      this.report = await this.hospitality.getReport(this.event._id, this.query());
      this.from = this.report.from;
      this.to = this.report.to;
      this.departments = this.report.departments;
      this.buildBars();
    } catch (err: any) {
      this.loadError = err?.status === 404 ? "The mess isn't set up for this event yet." : (err?.error?.message || 'Could not load the report.');
      this.report = null;
    } finally {
      this.loading = false;
    }
  }

  private query() {
    return { from: this.from, to: this.mode === 'range' ? this.to : this.from, department: this.department || null };
  }

  setMode(m: 'day' | 'range') {
    this.mode = m;
    if (m === 'day') this.to = this.from;
    this.load();
  }
  shiftDay(n: number) {
    const d = new Date(this.from + 'T00:00:00');
    d.setDate(d.getDate() + n);
    this.from = this.to = localDate(d);
    this.load();
  }
  toToday() {
    if (!this.report) return;
    this.from = this.to = this.report.today;
    this.load();
  }
  wholeMess() {
    if (!this.report) return;
    this.mode = 'range';
    this.from = this.report.messDates.opensOn;
    this.to = this.report.today < this.report.messDates.closesOn ? this.report.today : this.report.messDates.closesOn;
    this.load();
  }
  setDepartment(id: string) { this.department = id; this.load(); }

  dayLabel(d: string): string {
    return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  colour(meal: string): string { return MEALS.find(m => m.key === meal)?.colour || '#888'; }
  key(date: string, meal: string) { return `${date}|${meal}`; }
  open(date: string, meal: string) { this.openKey = this.key(date, meal); }
  /** The meal in the slide panel (looked up by key, so a reload shows fresh numbers). */
  get openMeal(): { date: string; meal: ReportMeal } | null {
    if (!this.openKey || !this.report) return null;
    const [date, meal] = this.openKey.split('|');
    const m = this.report.days.find(d => d.date === date)?.meals.find(x => x.meal === meal);
    return m ? { date, meal: m } : null;
  }
  /** Close the panel and open the kitchen-figures form for that meal. */
  editFromPanel(date: string, m: ReportMeal) {
    this.openKey = '';
    this.startFigures(date, m);
  }
  trackDay = (_: number, d: { date: string }) => d.date;
  trackMeal = (_: number, m: ReportMeal) => m.meal;
  trackDept = (_: number, d: { department: { _id: string } | null }) => d.department?._id || 'none';
  trackBar = (_: number, b: Bar) => b.date;
  trackOpt = (_: number, d: { _id: string }) => d._id;
  get filtered(): boolean { return !!this.department; }

  /** Left-over % per day (single series), on a 0..max scale with the goal line. */
  private buildBars() {
    const t = this.report?.trend || [];
    const goal = this.report?.goalPct ?? 5;
    const max = Math.max(goal * 2, ...t.map(x => x.leftoverPct || 0), 1);
    this.chartMax = max;
    this.bars = t.map(x => ({
      date: x.date, label: x.date.slice(8), pct: x.leftoverPct,
      height: x.leftoverPct === null ? 0 : Math.max(2, x.leftoverPct / max * 100), over: x.leftoverPct !== null && x.leftoverPct > goal
    }));
  }
  chartMax = 10;
  get goalBottom(): number { return (this.report?.goalPct ?? 5) / this.chartMax * 100; }

  // ── kitchen figures ──
  startFigures(date: string, m: ReportMeal) {
    this.editing = this.key(date, m.meal);
    this.fig = { veg: m.vegPrepared, nonVeg: m.nonVegPrepared, kg: m.leftoverKg, note: m.note };
  }
  async saveFigures(date: string, m: ReportMeal) {
    if (!this.event || this.busy) return;
    const f = this.fig;
    if (f.veg === null || f.nonVeg === null || f.veg < 0 || f.nonVeg < 0) { this.notify.openErrorSnackBar('Enter how many Veg and Non-veg plates were prepared.'); return; }
    this.busy = true;
    try {
      await this.hospitality.saveFigures({ event: this.event._id, date, meal: m.meal }, {
        vegPrepared: Math.round(f.veg), nonVegPrepared: Math.round(f.nonVeg), leftoverKg: f.kg === null || (f.kg as any) === '' ? null : f.kg, note: f.note.trim()
      });
      this.editing = '';
      this.notify.openSucessSnackBar('Kitchen figures saved');
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save the kitchen figures.');
    } finally {
      this.busy = false;
    }
  }

  // ── Excel: Meals (by day, a total per day, grand total), Served, Flagged ──
  async exportExcel() {
    const r = this.report;
    if (!r || !this.event || this.exporting) return;
    this.exporting = true;
    try {
      const [{ rows }, XLSX] = await Promise.all([this.hospitality.getServedList(this.event._id, this.query()), import('xlsx')]);
      const line = (date: string, meal: string, x: any) => ({
        Date: date, Meal: meal,
        'Asked for': x.asked ?? '', Prepared: x.prepared ?? '', 'Served (all)': x.served,
        'Served staff': x.staff, 'Served guest plates': x.guests, Veg: x.veg, 'Non-veg': x.nonVeg,
        'Without attendance': x.flagged, Refused: x.refused, Blocked: x.blocked, 'Extra plates': x.extra,
        'Left over (plates)': x.leftover ?? '', 'Left over %': x.leftoverPct ?? '', 'Left over kg': x.leftoverKg ?? '', Note: x.note || ''
      });
      const meals: any[] = [];
      for (const d of r.days) {
        for (const m of d.meals) meals.push(line(d.date, m.label, m));
        meals.push(line(d.date, 'Day total', d.total));
      }
      meals.push(line(`${r.from} – ${r.to}`, 'Grand total', r.total));
      const served = rows.map(x => ({
        Date: x.date, Meal: x.meal, Time: new Date(x.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        Name: x.name, Type: x.kind, Department: x.department, Food: x.food, Plates: x.plates,
        Decision: DECISION_LABELS[x.decision] || x.decision, Reason: x.reason, 'Served by': x.by
      }));
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(meals), 'Meals');
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(served), 'Served');
      XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(served.filter(x => x.Decision === DECISION_LABELS['served_flagged'])), 'Flagged');
      XLSX.writeFile(book, `mess-report-${r.from}${r.to !== r.from ? '-to-' + r.to : ''}.xlsx`);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not export the report.');
    } finally {
      this.exporting = false;
    }
  }
}
