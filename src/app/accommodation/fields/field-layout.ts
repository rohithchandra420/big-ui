/**
 * Tent Fields — layout logic, kept free of Angular so it can be tested on its
 * own. A layout is which tent stands in which cell plus the path cells.
 * Every change returns a NEW layout (the old one stays for Undo).
 */
export interface Layout {
  /** "row:col" → tent id */
  cells: Record<string, string>;
  /** "row:col" of walkable cells */
  paths: Record<string, true>;
}

export const cellKey = (r: number, c: number) => `${r}:${c}`;

export function parseKey(k: string): [number, number] {
  const [r, c] = k.split(':').map(Number);
  return [r, c];
}

export function fromServer(tents: { _id: string; row?: number; col?: number }[], paths: [number, number][]): Layout {
  const cells: Record<string, string> = {};
  for (const t of tents) if (t.row != null && t.col != null) cells[cellKey(t.row, t.col)] = t._id;
  const p: Record<string, true> = {};
  for (const [r, c] of paths || []) p[cellKey(r, c)] = true;
  return { cells, paths: p };
}

export function tentAt(l: Layout, r: number, c: number): string | null {
  return l.cells[cellKey(r, c)] || null;
}

export function isPath(l: Layout, r: number, c: number): boolean {
  return !!l.paths[cellKey(r, c)];
}

export function cellOf(l: Layout, tentId: string): string | null {
  for (const k in l.cells) if (l.cells[k] === tentId) return k;
  return null;
}

/** Put a tent in a free cell (moves it if it already stands elsewhere). Taken or path cells: no change. */
export function place(l: Layout, r: number, c: number, tentId: string): Layout {
  const k = cellKey(r, c);
  if (l.cells[k] || l.paths[k]) return l;
  const cells = { ...l.cells };
  const from = cellOf(l, tentId);
  if (from) delete cells[from];
  cells[k] = tentId;
  return { cells, paths: l.paths };
}

/** Empty a cell: the tent goes back to "to place", a path is removed. */
export function erase(l: Layout, r: number, c: number): Layout {
  const k = cellKey(r, c);
  if (l.cells[k]) {
    const cells = { ...l.cells };
    delete cells[k];
    return { cells, paths: l.paths };
  }
  if (l.paths[k]) {
    const paths = { ...l.paths };
    delete paths[k];
    return { cells: l.cells, paths };
  }
  return l;
}

/** Mark or unmark a path cell. A cell with a tent is left alone. */
export function setPath(l: Layout, r: number, c: number, on: boolean): Layout {
  const k = cellKey(r, c);
  if (l.cells[k] || !!l.paths[k] === on) return l;
  const paths = { ...l.paths };
  if (on) paths[k] = true; else delete paths[k];
  return { cells: l.cells, paths };
}

/** Take every tent off the field (walkways stay). */
export function clearTents(l: Layout): Layout {
  return Object.keys(l.cells).length ? { cells: {}, paths: l.paths } : l;
}

export function placedIds(l: Layout): Set<string> {
  return new Set(Object.values(l.cells));
}

export function toSave(l: Layout): { paths: [number, number][]; placements: { tent: string; row: number; col: number }[] } {
  return {
    paths: Object.keys(l.paths).map(parseKey),
    placements: Object.entries(l.cells).map(([k, tent]) => { const [row, col] = parseKey(k); return { tent, row, col }; }),
  };
}

/** How many cells differ between two layouts (shown as "N changes not saved"). */
export function changesBetween(a: Layout, b: Layout): number {
  let n = 0;
  const keys = new Set([...Object.keys(a.cells), ...Object.keys(b.cells)]);
  keys.forEach(k => { if (a.cells[k] !== b.cells[k]) n++; });
  const pk = new Set([...Object.keys(a.paths), ...Object.keys(b.paths)]);
  pk.forEach(k => { if (!!a.paths[k] !== !!b.paths[k]) n++; });
  return n;
}

/** Cells on the straight line from a to b (both included), so a quick drag doesn't skip cells. */
export function cellsBetween(a: [number, number], b: [number, number]): [number, number][] {
  let [r0, c0] = a;
  const [r1, c1] = b;
  const out: [number, number][] = [];
  const dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
  let err = dc - dr;
  for (;;) {
    out.push([r0, c0]);
    if (r0 === r1 && c0 === c1) break;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c0 += sc; }
    if (e2 < dc) { err += dc; r0 += sr; }
  }
  return out;
}

/** "SH2" before "SH10". */
export function naturalCompare(a: string, b: string): number {
  return (a || '').localeCompare(b || '', undefined, { numeric: true, sensitivity: 'base' });
}

/** Lower case, letters and digits only, no leading zeros in numbers: "SH-014" → "sh14". */
export function normalizeNo(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(^|[a-z])0+(\d)/g, '$1$2');
}

/** Search by tent number ("SH14", "sh-014") or part of an occupant's name. */
export function matchesSearch(q: string, tent: { tent_no: string; occupants?: { name: string }[] }): boolean {
  const query = (q || '').trim().toLowerCase();
  if (!query) return false;
  const no = normalizeNo(query);
  if (no && normalizeNo(tent.tent_no) === no) return true;
  return (tent.occupants || []).some(o => (o.name || '').toLowerCase().includes(query));
}
