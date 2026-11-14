import { VolBoard, VolDepartment, Volunteer } from './volunteers.model';

/** Pure helpers for the Volunteers board (no Angular), so the rules are easy to test. */

export type StatFilter = 'all' | 'unassigned' | 'short';

export interface BoardFilter {
  search: string;
  stat: StatFilter;
  notMarked: boolean;
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
  /** Flat list for the List view. */
  rows: { v: Volunteer; deptName: string }[];
  stats: { all: number; unassigned: number; stillNeeded: number; notMarked: number };
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
  const empty: BoardView = { pool: [], poolTotal: 0, lanes: [], rows: [], stats: { all: 0, unassigned: 0, stillNeeded: 0, notMarked: 0 } };
  if (!board) return empty;
  const q = f.search.trim().toLowerCase();
  const match = (v: Volunteer) => (!q || v.name.toLowerCase().includes(q) || v.phone.includes(q)) && (!f.notMarked || !v.marked);

  const byDept = new Map<string, Volunteer[]>();
  const unassigned: Volunteer[] = [];
  board.volunteers.forEach(v => {
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

  const rows = [
    ...pool.map(v => ({ v, deptName: '' })),
    ...lanes.flatMap(l => l.shown.map(v => ({ v, deptName: l.dept.name })))
  ].sort((a, b) => a.v.name.localeCompare(b.v.name));

  return {
    pool,
    poolTotal: unassigned.length,
    lanes,
    rows,
    stats: {
      all: board.volunteers.length,
      unassigned: unassigned.length,
      stillNeeded: allLanes.reduce((sum, l) => sum + l.need.short, 0),
      notMarked: board.volunteers.filter(v => !v.marked).length
    }
  };
}

/** "3 volunteers moved to WASH" / "Asha freed to Unassigned". */
export function moveMessage(moved: number, firstName: string, deptName: string | null): string {
  const who = moved === 1 ? firstName : `${moved} volunteers`;
  return deptName ? `${who} moved to ${deptName}` : `${who} freed to Unassigned`;
}
