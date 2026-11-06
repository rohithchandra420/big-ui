import { Component, Input, OnChanges } from '@angular/core';
import { localTime } from '../../workshops/planner.utils';
import { DeskExpected, ExpectedGuest, ExpectedPerson } from '../hospitality.model';

/** Expected list filters (1.47.0). */
export type ExpectedFilter = 'all' | 'not_yet' | 'served' | 'not_marked' | 'guests';
const SERVED = new Set(['served', 'served_flagged', 'extra']);
const WHY_LABELS: Record<string, string> = { marked: 'Marked', always: 'Always counted', not_marked: 'Not marked', not_expected: 'Not expected' };

/**
 * Who is behind a meal's expected number (big-ui 1.47.0): counted staff, guest
 * Meal Passes and — greyed — staff not counted, with why and desk status.
 * Used on the Serving desk and on Today's Kitchen count. Styles are global
 * (.hx-e* in styles.css).
 */
@Component({
  selector: 'app-expected-list',
  templateUrl: './expected-list.component.html'
})
export class ExpectedListComponent implements OnChanges {
  @Input() data: DeskExpected | null = null;

  filter: ExpectedFilter = 'all';
  search = '';
  counted: ExpectedPerson[] = [];
  others: ExpectedPerson[] = [];
  guests: ExpectedGuest[] = [];
  chips: { key: ExpectedFilter; label: string; count: number }[] = [];

  ngOnChanges(): void { this.apply(); }

  setFilter(f: ExpectedFilter) { this.filter = f; this.apply(); }

  /** Rebuilds the shown rows and chip counts (stored lists, not getters). */
  apply() {
    const e = this.data;
    const counted = e?.counted || [], others = e?.others || [], guests = e?.guests || [];
    const q = this.search.trim().toLowerCase();
    const hit = (name: string) => !q || name.toLowerCase().includes(q);
    const served = (p: ExpectedPerson) => SERVED.has(p.status);
    const all = [...counted, ...others];
    this.chips = [
      { key: 'all', label: 'All', count: all.length + guests.length },
      { key: 'not_yet', label: 'Not yet', count: counted.filter(p => !served(p)).length },
      { key: 'served', label: 'Served', count: all.filter(served).length },
      { key: 'not_marked', label: 'Not marked', count: others.length },
      { key: 'guests', label: 'Guests', count: guests.length }
    ];
    const f = this.filter;
    this.counted = f === 'guests' || f === 'not_marked' ? [] : counted.filter(p => hit(p.name) && (f === 'all' || (f === 'served') === served(p)));
    this.others = f === 'guests' || f === 'not_yet' ? [] : others.filter(p => hit(p.name) && (f !== 'served' || served(p)));
    this.guests = f === 'all' || f === 'guests' ? guests.filter(g => hit(g.name) || hit(g.note)) : [];
  }

  time(iso: string): string { return localTime(new Date(iso)); }

  whyLabel(p: ExpectedPerson): string {
    const slot = this.data?.meal?.basis;
    const base = WHY_LABELS[p.why];
    return (p.why === 'marked' || p.why === 'not_marked') && slot ? `${base} · ${slot.label}${slot.previousDay ? ' (day before)' : ''}` : base;
  }
  statusLabel(p: ExpectedPerson): string {
    if (p.status === 'none') return 'Not yet';
    if (p.status === 'served_flagged') return 'Served with reason';
    const t = p.at ? ' ' + this.time(p.at) : '';
    return (p.status === 'served' || p.status === 'extra' ? 'Served' : p.status === 'refused' ? 'Refused' : 'Blocked') + t;
  }
  statusClass(p: ExpectedPerson): string {
    return p.status === 'none' ? 'yet' : p.status === 'served_flagged' ? 'flag' : SERVED.has(p.status) ? 'srv' : 'no';
  }
  trackRow = (_: number, r: { _id: string }) => r._id;
  trackChip = (_: number, c: { key: string }) => c.key;
}
