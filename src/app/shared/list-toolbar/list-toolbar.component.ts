import { Component, EventEmitter, Input, Output } from '@angular/core';

import { SortDir, TableSort } from '../table-sort/table-sort';
import { ViewMode, ViewModeService } from '../../core/view-mode.service';

/** One sortable column, as the Sort & filter sheet lists it. Pages keep a STORED list. */
export interface SortOption {
  key: string;
  label: string;
}

/** One applied filter (or the sort) shown as a removable chip. Pages keep a STORED list. */
export interface AppliedChip {
  id: string;
  label: string;
  /** Material Symbols name after the label (e.g. the sort arrow). */
  icon?: string;
}

/**
 * Phone cards (2026-11-25, mock v2): the phone-only list toolbar. One block
 * that pins under the page header (`top: var(--ph-bottom)`, set by
 * SectionHeaderComponent):
 *   - search + "Sort & filter" (with the number of applied filters);
 *   - applied filters as removable chips + Clear all;
 *   - the selection line: select all shown, the count, the page's own actions.
 * "Sort & filter" opens a bottom sheet (app-slide-panel): sort column + order,
 * the page's own filters (projected `[ltFilters]`), the Cards / Table switch and
 * a "Show N" button. Renders nothing on tablets / desktops.
 *
 * Usage: see box-office/bookings. Styles: `.lt-*` in styles.css.
 */
@Component({
  selector: 'app-list-toolbar',
  templateUrl: './list-toolbar.component.html'
})
export class ListToolbarComponent {
  /** View mode key of the page (localStorage). */
  @Input() page = '';

  @Input() search = '';
  @Output() searchChange = new EventEmitter<string>();
  @Input() searchPlaceholder = 'Search…';

  @Input() sort!: TableSort<any>;
  /** STORED list (stable identities) — never a getter that builds objects. */
  @Input() sortOptions: SortOption[] = [];

  /** STORED list of applied filters / sort. */
  @Input() chips: AppliedChip[] = [];
  @Output() chipRemoved = new EventEmitter<string>();
  @Output() clearAll = new EventEmitter<void>();

  /** Rows matching now (the sheet's "Show N …" button). */
  @Input() resultCount = 0;
  /** Plural word for the rows, e.g. "bookings". */
  @Input() noun = 'results';

  /** Selection line (pages with tick boxes). */
  @Input() selectable = false;
  @Input() shown = 0;
  @Input() selectedCount = 0;
  @Input() allSelected = false;
  @Input() someSelected = false;
  /** Select-all wording when it ticks more than the cards shown (e.g. "Select all 40"); default "Select all N shown". */
  @Input() selectAllText = '';
  @Output() toggleAll = new EventEmitter<void>();

  sheetOpen = false;

  constructor(public viewMode: ViewModeService) {}

  get mode(): ViewMode {
    return this.viewMode.modeOf(this.page);
  }

  onSearch(value: string) {
    this.search = value;
    this.searchChange.emit(value);
  }

  pickSort(key: string | null) {
    this.sort.set(key || null, this.sort.dir);
  }

  setDir(dir: SortDir) {
    if (!this.sort.key || this.sort.dir === dir) return;
    this.sort.set(this.sort.key, dir);
  }

  setMode(mode: ViewMode) {
    this.viewMode.setMode(this.page, mode);
  }

  trackKey(_: number, o: SortOption) {
    return o.key;
  }

  trackChip(_: number, c: AppliedChip) {
    return c.id;
  }
}
