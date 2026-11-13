/** WASH — Water, Sanitation & Hygiene (WASH_CONTEXT.md). */
export type WashKind = 'water' | 'toilets';
export type WashStatus = 'ok' | 'empty' | 'out_of_order';
export type WashState = 'not_started' | 'ok' | 'due_soon' | 'overdue' | 'empty' | 'out_of_order';
export type WashAction = 'refilled' | 'cleaned' | 'empty' | 'out_of_order' | 'back_in_service';

export interface WashFacility {
  _id: string;
  event: string;
  /** Where it is on the Venue Map: a pin, or a Washroom area (washrooms exist both ways). */
  place: 'pin' | 'area';
  location: string | null;
  area: string | null;
  name: string;
  lat: number;
  lng: number;
  kind: WashKind;
  intervalHours: number;
  capacityLitres: number | null;
  status: WashStatus;
  statusNote: string;
  lastDoneAt: string | null;
  lastDoneBy: string | null;
  dueAt: string | null;
  state: WashState;
  logCount?: number;
}

export interface WashList {
  facilities: WashFacility[];
  canLog: boolean;
  canManage: boolean;
  /** WA2: Refilled / Cleaned need a scan of the facility's QR sticker. */
  requireQr: boolean;
  now: string;
}

/** WA3: an item of the event's central store. */
export interface StockItem { _id: string; name: string; unit: string; quantity: number; lowLimit: number; low: boolean }
export interface StockList { items: StockItem[]; canManage: boolean }
export type StockMoveKind = 'received' | 'used';
/** `short`: how much of a Used could not be taken (the store ran out). */
export interface StockMoveResult { item: StockItem; short: number; becameLow: boolean }
export interface StockLogEntry { _id: string; kind: StockMoveKind; asked: number; change: number; after: number; at: string; by: string | null; note: string }
export interface StockItemInput { name: string; unit: string; lowLimit: number; quantity?: number }

/** WA5: one festival day (India time). */
export interface ReportLog { action: WashAction; at: string; time: string; by: string | null; note: string; viaQr: boolean }
export interface ReportFacility {
  _id: string; name: string; kind: WashKind; place: 'pin' | 'area'; intervalHours: number;
  done: number; viaQr: number; problems: number; overdueMin: number; downMin: number; logs: ReportLog[];
}
export interface ReportStock { name: string; unit: string; used: number; received: number }
export interface WashReport {
  date: string;
  today: string;
  summary: { refills: number; cleanings: number; overdueFacilities: number; problems: number; viaQr: number };
  facilities: ReportFacility[];
  stock: ReportStock[];
}

export interface WashSticker { _id: string; name: string; kind: WashKind; qr: string }

export interface WashLogEntry {
  _id: string;
  action: WashAction;
  at: string;
  by: string | null;
  note: string;
  viaQr: boolean;
}

/** A map place not yet set up: a Water / Toilets pin, or a Washroom area (type toilets). */
export interface WashPin { _id: string; name: string; type: WashKind; place: 'pin' | 'area' }

export interface NewFacility {
  event: string;
  location?: string;
  area?: string;
  name?: string;
  type?: WashKind;
  lat?: number;
  lng?: number;
  intervalHours: number;
  capacityLitres?: number | null;
}

export interface StateInfo { label: string; icon: string; tone: string }

export const STATE_INFO: Record<WashState, StateInfo> = {
  not_started: { label: 'Not started', icon: 'hourglass_empty', tone: 'ns' },
  ok: { label: 'OK', icon: 'check_circle', tone: 'ok' },
  due_soon: { label: 'Due soon', icon: 'schedule', tone: 'soon' },
  overdue: { label: 'Overdue', icon: 'warning', tone: 'over' },
  empty: { label: 'Empty', icon: 'water_loss', tone: 'empty' },
  out_of_order: { label: 'Out of order', icon: 'block', tone: 'ooo' },
};

export const STATE_ORDER: WashState[] = ['overdue', 'empty', 'out_of_order', 'due_soon', 'not_started', 'ok'];

export const ACTION_INFO: Record<WashAction, { label: string; icon: string }> = {
  refilled: { label: 'Refilled', icon: 'water_full' },
  cleaned: { label: 'Cleaned', icon: 'cleaning_services' },
  empty: { label: 'Empty', icon: 'water_loss' },
  out_of_order: { label: 'Out of order', icon: 'block' },
  back_in_service: { label: 'Back in service', icon: 'build_circle' },
};

export const KIND_INFO: Record<WashKind, { label: string; icon: string; done: WashAction; doneLabel: string }> = {
  water: { label: 'Water station', icon: 'water_drop', done: 'refilled', doneLabel: 'Refilled' },
  toilets: { label: 'Toilets', icon: 'wc', done: 'cleaned', doneLabel: 'Cleaned' },
};
