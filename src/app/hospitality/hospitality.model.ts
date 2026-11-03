/** Hospitality (H1) — see HOSPITALITY_CONTEXT.md. Same shapes as big-api routers/hospitality.js. */
export type MealKey = 'breakfast' | 'lunch' | 'snacks' | 'dinner';
export type MealStatus = 'upcoming' | 'open' | 'closed';
export type Slot = 'morning' | 'afternoon' | 'night';

export const MEALS: { key: MealKey; label: string; icon: string; colour: string }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: 'egg_alt', colour: '#d97706' },
  { key: 'lunch', label: 'Lunch', icon: 'lunch_dining', colour: '#0f766e' },
  { key: 'snacks', label: 'Snacks', icon: 'bakery_dining', colour: '#7c3aed' },
  { key: 'dinner', label: 'Dinner', icon: 'dinner_dining', colour: '#1d4ed8' },
];

export const SLOT_LABELS: Record<Slot, string> = { morning: 'Morning', afternoon: 'Noon', night: 'Previous night' };

export interface MessPlan {
  _id: string;
  event: string;
  opensOn: string;
  closesOn: string;
  times: Record<MealKey, string>;
  openMinutes: number;
  snacksBasis: 'morning' | 'afternoon';
  countDueAfterMin: number;
  /** H2: automatic Remind-TL Task this many minutes before the count is due. */
  remindBeforeMin?: number;
  messHall: string | null;
}

export interface MessSetup {
  plan: MessPlan | null;
  messHalls: { _id: string; name: string }[];
  messStatus: { open: boolean; label: string } | null;
  defaults: { times: Record<MealKey, string>; openMinutes: number; snacksBasis: 'morning' | 'afternoon'; countDueAfterMin: number; remindBeforeMin?: number };
}

export interface MessSetupInput {
  event: string;
  opensOn: string;
  closesOn: string;
  times: Record<MealKey, string>;
  openMinutes: number;
  snacksBasis: 'morning' | 'afternoon';
  countDueAfterMin: number;
  remindBeforeMin: number;
  messHall: string | null;
}

/** veg / nonVeg = totals; guestVeg / guestNonVeg = the guest part of them (H3). */
export interface Plates { veg: number; nonVeg: number; guests: number; guestVeg?: number; guestNonVeg?: number; total?: number }

export interface NotMarkedRow {
  department: { _id: string; name: string } | null;
  total: number;
  missing: number;
}

export interface MealDay {
  meal: MealKey;
  label: string;
  start: string;
  end: string;
  status: MealStatus;
  closedEarly: boolean;
  ownTimes: boolean;
  basis: { date: string; slot: Slot };
  expected: Plates & { total: number };
  count: (Plates & { sentAt: string; sentBy: string }) | null;
  countDueAt: string;
  notMarked: NotMarkedRow[];
  notMarkedTotal: number;
  /** Plates handed out at the Serving desk (H2). */
  served: number;
}

export interface MessDay {
  plan: MessPlan | null;
  date?: string;
  today?: string;
  inMessDates?: boolean;
  meals?: MealDay[];
}

export interface MealRef { event: string; date: string; meal: MealKey }

// ── Serving desk (H2) ──────────────────────────────────────────
export interface DeskPerson {
  _id: string;
  name: string;
  role: string;
  department: { _id: string; name: string } | null;
  foodPreference: 'veg' | 'non-veg';
  avatarVersion: number;
}

/** A guest found by the desk search: one row per pass valid for the open meal (H3). */
export interface DeskGuestHit { guestId: string; name: string; note: string; passId: string; label: string }

export type DeskDecision = 'served' | 'served_flagged' | 'refused' | 'blocked' | 'extra';

export interface DeskState {
  open: { meal: MealKey; label: string; date: string; start: string; end: string; served: number; expected: number } | null;
  next?: string;
  recent?: { _id: string; name: string; guest?: boolean; plates?: number; decision: DeskDecision; reason: string; at: string }[];
  flaggedToReport?: number;
}

export type ScanOutcome =
  | { result: 'served'; person: DeskPerson }
  | { result: 'flag'; person: DeskPerson; slot: Slot; teamLeads: string[] }
  | { result: 'duplicate'; person: DeskPerson; lastServedAt: string; lastServedBy: string }
  | GuestOutcome;

// ── Guests and Meal Passes (H3) ────────────────────────────────
export type PassKind = 'one_meal' | 'one_day' | 'range';

export const PASS_KINDS: { key: PassKind; label: string; icon: string; hint: string }[] = [
  { key: 'one_meal', label: 'One Meal', icon: 'restaurant', hint: 'One specific meal' },
  { key: 'one_day', label: 'One Day', icon: 'today', hint: 'All four meals that day' },
  { key: 'range', label: 'Date Range', icon: 'date_range', hint: 'Every meal, several days' },
];

export interface GuestPass {
  _id: string;
  kind: PassKind;
  meal: MealKey | null;
  from: string;
  to: string;
  vegPlates: number;
  nonVegPlates: number;
  label: string;
  revoked: boolean;
  validToday: boolean;
  ended: boolean;
}

export interface Guest {
  _id: string;
  name: string;
  phone: string;
  note: string;
  passes: GuestPass[];
}

export interface PassInput {
  kind: PassKind;
  meal?: MealKey | null;
  from: string;
  to?: string | null;
  vegPlates: number;
  nonVegPlates: number;
}

export interface PassCard { image: string; guest: string; note: string; label: string; vegPlates: number; nonVegPlates: number }

export interface GuestOutcome {
  result: 'guest';
  guest: { _id: string; name: string; note: string };
  pass: { _id: string; label: string; vegPlates: number; nonVegPlates: number };
  used: { veg: number; nonVeg: number };
  left: { veg: number; nonVeg: number };
  decision?: DeskDecision;
}
