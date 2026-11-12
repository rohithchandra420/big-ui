/**
 * Tent Fields — how a field is drawn, shared by the field page and the
 * Box Office "Pick on field" picker so both always look the same.
 */
import { FieldTent } from '../tent-field.service';
import { parseKey } from './field-layout';

/** Drawing units: one square is CELL units; zoom scales the whole drawing. */
export const CELL = 34;
export const FILL: Record<string, string> = { empty: '#ffffff', partly: '#fde68a', full: '#86efac' };
export const TYPE_COLORS = ['#1E4638', '#2563eb', '#9333ea', '#c2410c', '#0f766e', '#be185d', '#4d7c0f', '#7c2d12'];

/** One drawn tent (kept in a stored list with stable keys). */
export interface TentView {
  key: string; id: string; x: number; y: number; no: string; fill: string; stroke: string; label: string;
}
export interface PathView { key: string; x: number; y: number; }

/** A colour per tent type, stable for a set of tents (sorted by type id). */
export function typeColors(tents: Iterable<FieldTent>): Map<string, string> {
  const ids = [...new Set([...tents].map(t => t.passType?._id || ''))].sort();
  return new Map(ids.map((id, i) => [id, TYPE_COLORS[i % TYPE_COLORS.length]]));
}

export function tentViewsOf(cells: Record<string, string>, tents: Map<string, FieldTent>, colors: Map<string, string>): TentView[] {
  const out: TentView[] = [];
  for (const [k, id] of Object.entries(cells)) {
    const t = tents.get(id);
    if (!t) continue;
    const [r, c] = parseKey(k);
    const no = t.tent_no || '?';
    out.push({
      key: k + '|' + id, id, x: c * CELL, y: r * CELL, no,
      fill: FILL[t.state] || FILL['empty'], stroke: colors.get(t.passType?._id || '') || TYPE_COLORS[0],
      label: no.length > 5 ? no.slice(-5) : no,
    });
  }
  return out;
}

export function pathViewsOf(paths: Record<string, true>): PathView[] {
  return Object.keys(paths).map(k => { const [r, c] = parseKey(k); return { key: k, x: c * CELL, y: r * CELL }; });
}

/** Faint square lines as one path (no SVG pattern: url(#id) breaks with a <base> tag in some browsers). */
export function gridPathOf(rows: number, cols: number): string {
  let d = '';
  for (let r = 0; r <= rows; r++) d += `M0 ${r * CELL}H${cols * CELL}`;
  for (let c = 0; c <= cols; c++) d += `M${c * CELL} 0V${rows * CELL}`;
  return d;
}

export const clampZoom = (z: number) => Math.min(2.5, Math.max(0.3, Math.round(z * 100) / 100));
