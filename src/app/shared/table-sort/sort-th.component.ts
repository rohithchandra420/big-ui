import { Component, HostBinding, Input } from '@angular/core';
import { TableSort } from './table-sort';

/**
 * B-003: a sortable table header. Usage:
 *   <th appSort="name" [sort]="sort">Name</th>
 * The whole label is the button; the arrow lights up on the sorted column.
 * Styles: `.th-sort` in styles.css.
 */
@Component({
  selector: 'th[appSort]',
  template: `<button type="button" class="th-sort" (click)="sort.toggle(key)"><ng-content></ng-content><mat-icon aria-hidden="true">{{ sort.icon(key) }}</mat-icon></button>`
})
export class SortThComponent {
  @Input('appSort') key = '';
  @Input() sort!: TableSort<any>;

  @HostBinding('attr.aria-sort') get ariaSort(): string | null {
    return this.sort ? this.sort.aria(this.key) : null;
  }
}
