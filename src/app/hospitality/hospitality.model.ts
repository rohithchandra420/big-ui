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
  messHall: string | null;
}

export interface MessSetup {
  plan: MessPlan | null;
  messHalls: { _id: string; name: string }[];
  messStatus: { open: boolean; label: string } | null;
  defaults: { times: Record<MealKey, string>; openMinutes: number; snacksBasis: 'morning' | 'afternoon'; countDueAfterMin: number };
}

export interface MessSetupInput {
  event: string;
  opensOn: string;
  closesOn: string;
  times: Record<MealKey, string>;
  openMinutes: number;
  snacksBasis: 'morning' | 'afternoon';
  countDueAfterMin: number;
  messHall: string | null;
}

export interface Plates { veg: number; nonVeg: number; guests: number; total?: number }

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
}

export interface MessDay {
  plan: MessPlan | null;
  date?: string;
  today?: string;
  inMessDates?: boolean;
  meals?: MealDay[];
}

export interface MealRef { event: string; date: string; meal: MealKey }
