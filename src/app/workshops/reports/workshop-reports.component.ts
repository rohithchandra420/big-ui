import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { EventItem } from '../../models/event.model';
import { WorkshopService } from '../workshop.service';
import { ReportPerson, SessionReport, WorkshopReport, WorkshopReports } from '../workshops.model';
import { localDate, localTime } from '../planner.utils';

type View = 'session' | 'workshop';

/**
 * Workshops › Reports (Workshops epic, W7): per session and per workshop —
 * on the list, waitlist, walk-ins, attended, no-shows — with who came, and an
 * Excel export. The Workshop team and workshop:read (WorkshopReadGuard; the
 * server checks too).
 */
@Component({
  selector: 'app-workshop-reports',
  templateUrl: './workshop-reports.component.html',
  styleUrls: ['./workshop-reports.component.css']
})
export class WorkshopReportsComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  data: WorkshopReports | null = null;
  loading = false;
  loadError = '';
  view: View = 'session';
  search = '';

  // Filtered, stored lists (not built in a getter) for the *ngFor.
  sessions: SessionReport[] = [];
  workshops: WorkshopReport[] = [];

  panelOpen = false;
  panelTitle = '';
  panelSub = '';
  people: ReportPerson[] = [];
  peopleLoading = false;
  private panelId = '';
  exporting = false;

  private sub = new Subscription();

  constructor(private events: EventService, private workshopService: WorkshopService, private notify: NotificationService) {}

  ngOnInit() {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.closePanel(); this.load(); }
    }));
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  async load() {
    if (!this.event) { this.data = null; this.applySearch(); return; }
    this.loading = true;
    this.loadError = '';
    try {
      this.data = await this.workshopService.getReports(this.event._id);
      this.applySearch();
    } catch {
      this.loadError = 'Could not load the reports.';
    } finally {
      this.loading = false;
    }
  }

  setView(v: View) {
    this.view = v;
    this.closePanel();
  }

  applySearch() {
    const q = this.search.trim().toLowerCase();
    const has = (...parts: (string | undefined | null)[]) => !q || parts.some(p => (p || '').toLowerCase().includes(q));
    this.sessions = (this.data?.sessions || []).filter(s => has(s.workshop?.title, s.venue?.name, this.day(s.start)));
    this.workshops = (this.data?.workshops || []).filter(w => has(w.title, w.category?.name));
  }

  day(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  time(iso: string | null): string { return iso ? localTime(new Date(iso)) : ''; }

  /** Share of the list that came, for the bar in each row. */
  turnout(r: { pre: number; attendedFromList: number }): number {
    return r.pre ? Math.round(r.attendedFromList / r.pre * 100) : 0;
  }

  // ── people panel ───────────────────────────────────────────

  async openSession(s: SessionReport) {
    this.panelTitle = s.workshop?.title || 'Session';
    this.panelSub = `${this.day(s.start)} · ${this.time(s.start)}–${this.time(s.end)} · ${s.venue?.name || ''}`;
    await this.openPeople(s._id, p => true, s._id);
  }

  async openWorkshop(w: WorkshopReport) {
    this.panelTitle = w.title;
    this.panelSub = `${w.sessions} session${w.sessions === 1 ? '' : 's'}`;
    await this.openPeople(w._id, p => p.session?.workshop?._id === w._id);
  }

  private async openPeople(id: string, keep: (p: ReportPerson) => boolean, sessionId?: string) {
    if (!this.event) return;
    this.panelId = id;
    this.panelOpen = true;
    this.people = [];
    this.peopleLoading = true;
    try {
      const res = await this.workshopService.getReportPeople(this.event._id, sessionId);
      if (this.panelId === id) this.people = res.people.filter(keep);
    } catch {
      this.notify.openErrorSnackBar('Could not load the people');
    } finally {
      this.peopleLoading = false;
    }
  }

  isOpen(id: string): boolean { return this.panelOpen && this.panelId === id; }

  closePanel() {
    this.panelOpen = false;
    this.panelId = '';
    this.people = [];
  }

  @HostListener('document:keydown.escape')
  onEscape() { if (this.panelOpen) this.closePanel(); }

  listLabel(p: ReportPerson): string {
    return p.list === 'pre' ? 'List' : p.list === 'wait' ? 'Waitlist' : p.late ? 'Walk-in (late)' : 'Walk-in';
  }

  // ── export ─────────────────────────────────────────────────

  /** Excel: a Sessions sheet, a Workshops sheet and a People sheet (who was on which list, and when they came). */
  async exportExcel() {
    if (!this.event || !this.data || this.exporting) return;
    this.exporting = true;
    try {
      const [{ people }, XLSX] = await Promise.all([this.workshopService.getReportPeople(this.event._id), import('xlsx')]);
      const sessions = this.data.sessions.map(s => ({
        Workshop: s.workshop?.title || '', Category: s.workshop?.category?.name || '', Venue: s.venue?.name || '',
        Day: localDate(new Date(s.start)), Start: this.time(s.start), End: this.time(s.end),
        Status: s.status === 'cancelled' ? 'Cancelled' : s.over ? 'Ended' : 'Upcoming',
        'List limit': s.limit, 'On the list': s.pre, Waitlist: s.wait, 'Walk-ins': s.walkin,
        Attended: s.attended, 'From the list': s.attendedFromList, 'From the waitlist': s.attendedFromWait,
        'Walk-ins attended': s.walkinAttended, 'Late arrivals': s.late, 'No-shows': s.noShows, 'Venue capacity': s.venue?.capacity ?? ''
      }));
      const workshops = this.data.workshops.map(w => ({
        Workshop: w.title, Category: w.category?.name || '', Sessions: w.sessions, 'On the list': w.pre, Waitlist: w.wait,
        'Walk-ins': w.walkin, Attended: w.attended, 'No-shows': w.noShows
      }));
      const rows = people.map(p => ({
        Workshop: p.session?.workshop?.title || '', Venue: p.session?.venue?.name || '',
        Day: p.session ? localDate(new Date(p.session.start)) : '', Start: p.session ? this.time(p.session.start) : '',
        Name: p.pass?.name || '', Email: p.pass?.email || '', Phone: p.pass?.phone_no || '', 'Order ID': p.pass?.order_id ?? '',
        List: this.listLabel(p), Position: p.position, Attended: p.attendedAt ? 'Yes' : 'No', 'Came at': this.time(p.attendedAt)
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sessions), 'Sessions');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workshops), 'Workshops');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'People');
      const name = (this.event.name || 'event').replace(/[^\w-]+/g, '-');
      XLSX.writeFile(wb, `workshops-${name}-${localDate(new Date())}.xlsx`);
    } catch {
      this.notify.openErrorSnackBar('Could not export');
    } finally {
      this.exporting = false;
    }
  }

  trackId(_: number, x: { _id: string }) { return x._id; }
}
