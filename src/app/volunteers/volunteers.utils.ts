import { VolBoard, VolDepartment, Volunteer } from './volunteers.model';

/** Pure helpers for the Volunteers board (no Angular), so the rules are easy to test. */

export type StatFilter = 'all' | 'unassigned' | 'short';

/** List only: everyone, Volunteers only, or Team Leads only. */
export type RoleFilter = 'all' | 'VOL' | 'TL';

export interface BoardFilter {
  search: string;
  stat: StatFilter;
  notMarked: boolean;
  role?: RoleFilter;
}

export type NeedKind = 'none' | 'short' | 'met';
export interface NeedStatus {
  kind: NeedKind;
  /** "2 short", "Met", "Met · 1 extra", or "No number given". */
  text: string;
  /** Bar fill, 0–100. */
  pct: number;
  short: number;
}

export interface Lane {
  dept: VolDepartment;
  icon: string;
  colour: string;
  /** Everyone in the department (the count on the card). */
  have: number;
  /** The ones left after search / filters. */
  shown: Volunteer[];
  need: NeedStatus;
}

export interface BoardView {
  pool: Volunteer[];
  poolTotal: number;
  lanes: Lane[];
  /** Flat list for the List view (Team Leads included, see RoleFilter). */
  rows: { v: Volunteer; deptName: string }[];
  /** Volunteers only — Team Leads never count here. */
  stats: { all: number; unassigned: number; stillNeeded: number; notMarked: number };
  /** Team Leads on the event (for the role filter). */
  tlCount: number;
}

/** A card's look comes from the department's access key, never its name. */
const LOOK: Record<string, [icon: string, colour: string]> = {
  'box-office': ['confirmation_number', '#1E4638'],
  hospitality: ['restaurant', '#b45309'],
  wash: ['water_drop', '#2b6cb0'],
  workshop: ['palette', '#7c3aed'],
  tenting: ['camping', '#0f766e'],
  medical: ['medical_services', '#be123c'],
};
const PLAIN: [string, string] = ['workspaces', '#475569'];

export function needStatus(have: number, needed: number): NeedStatus {
  if (!needed) return { kind: 'none', text: 'No number given', pct: 0, short: 0 };
  const short = Math.max(0, needed - have);
  const extra = have - needed;
  return {
    kind: short ? 'short' : 'met',
    text: short ? `${short} short` : (extra > 0 ? `Met · ${extra} extra` : 'Met'),
    pct: Math.min(100, Math.round(have / needed * 100)),
    short
  };
}

export function buildBoard(board: VolBoard | null, f: BoardFilter): BoardView {
  const empty: BoardView = { pool: [], poolTotal: 0, lanes: [], rows: [], stats: { all: 0, unassigned: 0, stillNeeded: 0, notMarked: 0 }, tlCount: 0 };
  if (!board) return empty;
  const q = f.search.trim().toLowerCase();
  const match = (v: Volunteer) => (!q || v.name.toLowerCase().includes(q) || v.phone.includes(q)) && (!f.notMarked || !v.marked);
  const role = f.role || 'all';
  // Team Leads are on the List only — the board, the counts and moves are for volunteers
  const vols = board.volunteers.filter(v => v.role !== 'TL');
  const tls = board.volunteers.filter(v => v.role === 'TL');

  const byDept = new Map<string, Volunteer[]>();
  const unassigned: Volunteer[] = [];
  vols.forEach(v => {
    // A volunteer whose department is not on the board counts as unassigned rather than vanishing.
    const known = !v.unassigned && v.department && board.departments.some(d => d._id === v.department);
    if (!known) { unassigned.push(v); return; }
    if (!byDept.has(v.department!)) byDept.set(v.department!, []);
    byDept.get(v.department!)!.push(v);
  });

  const allLanes: Lane[] = board.departments.map(dept => {
    const members = byDept.get(dept._id) || [];
    const [icon, colour] = LOOK[dept.key] || PLAIN;
    return { dept, icon, colour, have: members.length, shown: members.filter(match), need: needStatus(members.length, dept.needed) };
  });
  const lanes = f.stat === 'unassigned' ? [] : allLanes.filter(l => f.stat !== 'short' || l.need.short > 0);
  const pool = unassigned.filter(match);

  // The Unassigned / Still needed cards are about volunteers, so they hide the Team Leads too
  const tlRows = role === 'VOL' || f.stat !== 'all' ? [] : tls.filter(match).map(v => ({ v, deptName: (v.teams || []).join(', ') }));
  const volRows = role === 'TL' ? [] : [
    ...pool.map(v => ({ v, deptName: '' })),
    ...lanes.flatMap(l => l.shown.map(v => ({ v, deptName: l.dept.name })))
  ];
  const rows = [...volRows, ...tlRows].sort((a, b) => a.v.name.localeCompare(b.v.name));

  return {
    pool,
    poolTotal: unassigned.length,
    lanes,
    rows,
    stats: {
      all: vols.length,
      unassigned: unassigned.length,
      stillNeeded: allLanes.reduce((sum, l) => sum + l.need.short, 0),
      notMarked: vols.filter(v => !v.marked).length
    },
    tlCount: tls.length
  };
}

// ── List view sorting (B-003) ──
export type SortKey = 'name' | 'dept' | 'today' | 'stay' | 'band' | 'gender' | 'phone' | 'joined';
export type SortDir = 'asc' | 'desc';
type Row = BoardView['rows'][number];

/** Stay, ascending: no bed first (the ones to act on), then bed given, then moved in. */
const STAY_ORDER: Record<string, number> = { none: 0, booked: 1, in: 2 };

/**
 * The List rows sorted by one column. Ties fall back to the name (A–Z), and
 * rows with no phone / joining date / gender stay at the bottom either way.
 * Unassigned sorts as a department named "Unassigned"; Marked and Band =
 * "not yet" first (asc).
 */
export function sortRows(rows: Row[], key: SortKey, dir: SortDir): Row[] {
  const sign = dir === 'asc' ? 1 : -1;
  const byName = (a: Row, b: Row) => a.v.name.localeCompare(b.v.name);
  const missing = (r: Row) => (key === 'phone' && !r.v.phone) || (key === 'joined' && !r.v.dateOfJoining) || (key === 'gender' && !r.v.gender);
  const value = (a: Row, b: Row): number => {
    switch (key) {
      case 'dept': return (a.deptName || 'Unassigned').localeCompare(b.deptName || 'Unassigned');
      case 'today': return Number(a.v.marked) - Number(b.v.marked);
      case 'stay': return (STAY_ORDER[a.v.stay] ?? 0) - (STAY_ORDER[b.v.stay] ?? 0);
      case 'band': return Number(a.v.band) - Number(b.v.band);
      case 'gender': return a.v.gender.localeCompare(b.v.gender);
      case 'phone': return a.v.phone.localeCompare(b.v.phone);
      case 'joined': return Date.parse(a.v.dateOfJoining!) - Date.parse(b.v.dateOfJoining!);
      default: return byName(a, b);
    }
  };
  return [...rows].sort((a, b) => {
    const ma = missing(a), mb = missing(b);
    if (ma !== mb) return ma ? 1 : -1;
    return (ma ? 0 : sign * value(a, b)) || byName(a, b);
  });
}

export const STAY_LABEL: Record<string, string> = { in: 'Moved in', booked: 'Bed given', none: 'No bed' };

/** "Today" for today, otherwise "Mon 16 Nov". `day` and `today` are YYYY-MM-DD. */
export function dayWord(day: string, today: string): string {
  if (day === today) return 'Today';
  const d = new Date(day + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** YYYY-MM-DD `n` days after `day`. */
export function shiftDate(day: string, n: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const LOCATION_LABEL: Record<string, string> = { asked: 'Waiting for an answer', answered: 'Answered', declined: 'Declined', expired: 'No answer (expired)' };

/** "Asked 3 · 2 don't share their location · 1 already asked" */
export function askMessage(r: { asked: number; notSharing: number; alreadyAsked: number }): string {
  const parts = [r.asked ? `Asked ${r.asked}` : 'Nobody asked'];
  if (r.notSharing) parts.push(`${r.notSharing} ${r.notSharing === 1 ? "doesn't" : "don't"} share their location`);
  if (r.alreadyAsked) parts.push(`${r.alreadyAsked} already asked`);
  return parts.join(' · ');
}

export const MODE_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', bank: 'Bank transfer', other: 'Other' };
export const DEPOSIT_LABEL: Record<string, string> = { held: 'Collected', none: 'Not collected', refunded: 'Refunded' };

/** "₹1,500" (Indian grouping); "" when there is no amount to show. */
export function money(amount: number | null | undefined): string {
  return typeof amount === 'number' ? '₹' + amount.toLocaleString('en-IN') : '';
}

/** "3 volunteers moved to WASH" / "Asha freed to Unassigned". */
export function moveMessage(moved: number, firstName: string, deptName: string | null): string {
  const who = moved === 1 ? firstName : `${moved} volunteers`;
  return deptName ? `${who} moved to ${deptName}` : `${who} freed to Unassigned`;
}
