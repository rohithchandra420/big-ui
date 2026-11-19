/**
 * B-003: column sort for list tables, app-wide.
 *
 * A page keeps one `TableSort` per table and puts `<th appSort="key" [sort]="sort">`
 * on each sortable header (SortThComponent). A header tap sorts by that column;
 * tapping it again flips the order. `key: null` = the table's own order until
 * someone taps a header.
 *
 * Sorting returns a NEW array of the SAME row objects (stable identities for
 * *ngFor). Pages store the result and rebuild it when the rows or the sort change
 * (the `changed` callback) — never sort inside a getter the template reads.
 */
export type SortDir = 'asc' | 'desc';

/** Reads one column's value from a row. */
export type SortGetter<T> = (row: T) => unknown;

export class TableSort<K extends string = string> {
  constructor(public key: K | null = null, public dir: SortDir = 'asc', private changed?: () => void) {}

  /** Header tap: sort by `key`, or flip the order when it is already the sorted column. */
  toggle(key: K) {
    this.dir = this.key === key && this.dir === 'asc' ? 'desc' : 'asc';
    this.key = key;
    this.changed?.();
  }

  /** Material Symbols name for the header's arrow. */
  icon(key: K): string {
    return this.key !== key ? 'unfold_more' : this.dir === 'asc' ? 'arrow_upward' : 'arrow_downward';
  }

  /** Value for the header's `aria-sort`. */
  aria(key: K): 'none' | 'ascending' | 'descending' {
    return this.key !== key ? 'none' : this.dir === 'asc' ? 'ascending' : 'descending';
  }

  /** `rows` sorted by the current column (a copy; the rows themselves are not copied). */
  apply<T>(rows: T[], getters: Partial<Record<K, SortGetter<T>>>): T[] {
    const get = this.key ? getters[this.key] : undefined;
    return get ? sortRowsBy(rows, get, this.dir) : [...rows];
  }

  private memo: { rows: unknown[]; key: K | null; dir: SortDir; out: unknown[] } | null = null;

  /**
   * Like `apply`, but sorts again only when the `rows` array (same instance),
   * the column or the order changed — safe to call from a getter the template
   * reads. Sort the page's STORED list with it, then filter the result (a
   * filter keeps the order).
   */
  sorted<T>(rows: T[], getters: Partial<Record<K, SortGetter<T>>>): T[] {
    const m = this.memo;
    if (m && m.rows === rows && m.key === this.key && m.dir === this.dir) return m.out as T[];
    const out = this.key ? this.apply(rows, getters) : rows;
    this.memo = { rows, key: this.key, dir: this.dir, out };
    return out;
  }
}

/** True for a value that has nothing to sort on — it stays at the bottom either way. */
export function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))
    || (v instanceof Date && isNaN(v.getTime()));
}

/** Natural compare: numbers / dates / booleans by value, text A–Z ignoring case ("Tent 2" before "Tent 10"). */
export function compareValues(a: unknown, b: unknown): number {
  const n = (v: unknown) => v instanceof Date ? v.getTime() : typeof v === 'boolean' ? Number(v) : v;
  const x = n(a), y = n(b);
  if (typeof x === 'number' && typeof y === 'number') return x - y;
  return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
}

/** Sorted copy of `rows`; empty values go last in both orders, ties keep their incoming order. */
export function sortRowsBy<T>(rows: T[], get: SortGetter<T>, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      const ea = isEmptyValue(a.v), eb = isEmptyValue(b.v);
      if (ea !== eb) return ea ? 1 : -1;
      return (ea ? 0 : sign * compareValues(a.v, b.v)) || a.i - b.i;
    })
    .map(x => x.row);
}
