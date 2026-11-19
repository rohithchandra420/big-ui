/** Volunteers page (V1) — the shapes big-api `routers/volunteers.js` answers with. */
export interface VolSlots { morning: boolean; afternoon: boolean; night: boolean }

/** Bed for the night of the picked date: moved in, bed given (not moved in yet), or none. */
export type NightStay = 'in' | 'booked' | 'none';

export interface Volunteer {
  _id: string;
  name: string;
  avatarVersion: number;
  /** 'TL' rows (user, 2026-11-18) show in the List only: never on the board, in the counts or in moves. */
  role: 'VOL' | 'TL';
  /** Home department id; null when unassigned (in the Volunteer department or none). */
  department: string | null;
  /** A Team Lead's departments by name. */
  teams?: string[];
  unassigned: boolean;
  phone: string;
  gender: string;
  /** Expected Join Time (date + time). */
  dateOfJoining: string | null;
  /** Reported Time (Joining Time): when they actually arrived; null = not reported yet. */
  reportedAt: string | null;
  /** Attendance on the picked date (the board's `today`). */
  today: VolSlots;
  /** Marked in any slot on the picked date. Shown only — marking stays in My Department. */
  marked: boolean;
  stay: NightStay;
  /** Has an active staff band for this event. */
  band: boolean;
  /** V3: shares their location when asked. Sent only to people who may ask (Manage). */
  sharing?: boolean;
}

export interface VolDepartment {
  _id: string;
  name: string;
  key: string;
  tls: string[];
  /** Volunteers needed for the event; 0 = no number given. */
  needed: number;
  /** The signed-in person may set `needed` (the department's own Team Lead, DEV/DIR/ADMIN). */
  canSetNeed: boolean;
}

export interface VolBoard {
  /** The picked date (YYYY-MM-DD); today unless another date was asked for. */
  today: string;
  canAssign: boolean;
  /** V3: may ask volunteers for their location and read the answers. */
  canManage?: boolean;
  pool: { _id: string; name: string } | null;
  departments: VolDepartment[];
  volunteers: Volunteer[];
}

export interface MoveResult {
  moved: number;
  skipped: number;
  department: { _id: string; name: string } | null;
}

export type DepositStatus = 'none' | 'held' | 'refunded';
export type DepositMode = 'cash' | 'upi' | 'bank' | 'other';

export interface DepositLog { action: 'collected' | 'corrected' | 'refunded'; at: string; by: string; amount: number; mode: DepositMode }

/** One person on the Deposits tab. The money fields are missing for people who only see the status. */
export interface DepositRow {
  _id: string;
  name: string;
  avatarVersion: number;
  phone: string;
  department: string;
  status: DepositStatus;
  /** 'left' = no longer a volunteer on this event, 'deactivated' = account deactivated — while a deposit is still held. */
  flag: '' | 'left' | 'deactivated';
  amount?: number;
  mode?: DepositMode;
  note?: string;
  collectedAt?: string;
  collectedBy?: string;
  refundedAt?: string | null;
  refundedBy?: string;
  refundMode?: DepositMode | null;
  refundNote?: string;
  log?: DepositLog[];
}

export interface DepositList {
  canManage: boolean;
  seeAmounts: boolean;
  modes: DepositMode[];
  defaultAmount?: number;
  totals: { held: number; none: number; refunded: number; heldAmount?: number; refundedAmount?: number };
  rows: DepositRow[];
}

// ── Location on request (V3) ──
export type LocationState = 'asked' | 'answered' | 'declined' | 'expired';

export interface LocationEntry {
  _id: string;
  status: LocationState;
  askedBy: string;
  askedAt: string;
  expiresAt: string;
  answeredAt: string | null;
  lat?: number;
  lng?: number;
}

export interface LocationInfo {
  sharing: boolean;
  /** A request is open and not answered yet. */
  waiting: boolean;
  latest: LocationEntry | null;
  requestHours: number;
  log: LocationEntry[];
}

export interface AskResult { asked: number; notSharing: number; alreadyAsked: number; skipped: number }

/** A request waiting for the signed-in person's own answer. */
export interface MyLocationRequest { _id: string; askedBy: string; event: string; askedAt: string; expiresAt: string }

export interface NeedInfo { needed: number; have: number; canSet: boolean }

export interface VolProfile {
  _id: string;
  name: string;
  email: string;
  phone: string;
  avatarVersion: number;
  role?: 'VOL' | 'TL';
  department: { _id: string; name: string } | null;
  teams?: string[];
  unassigned: boolean;
  dateOfJoining: string | null;
  reportedAt: string | null;
  reportedBy: { _id: string; name: string } | null;
  foodPreference: 'veg' | 'non-veg';
  gender: string;
  stay: { unit: string; type: string; from: string; to: string; movedIn: boolean } | null;
  band: boolean;
  meals: number;
  /** Security deposit for the event; `amount` only for people who may see amounts. */
  deposit: { status: DepositStatus; amount?: number };
  attendance: ({ date: string } & VolSlots)[];
  /** My Department only (2026-11-19): what the signed-in person may do for this member. */
  can?: { role: boolean; location: boolean };
}
