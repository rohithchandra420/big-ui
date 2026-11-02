// Workshops epic (release 2) — shapes returned by big-api routers/workshops.js.

export interface WorkshopCategory {
  _id: string;
  name: string;
  colour: string;
  icon: string;
  workshopCount?: number;
}

export interface WorkshopVenue {
  _id: string;
  event: string;
  name: string;
  capacity: number;
  amenities: string;
  area: { _id: string; name: string } | null;
  notes: string;
  sessionCount?: number;
}

export interface Workshop {
  _id: string;
  event: string;
  title: string;
  category: WorkshopCategory | null;
  description: string;
  facilitators: string[];
  itemsRequired: string;
  ageLimit: string;
  language: string;
  bringYourOwn: string;
  notes: string;
  sessionCount?: number;
}

export interface WorkshopSetup {
  venues: WorkshopVenue[];
  workshops: Workshop[];
  categories: WorkshopCategory[];
  workshopAreas: { _id: string; name: string }[];
  colours: string[];
  canPlan: boolean;
  /** Add a venue; add / edit / delete workshops and categories: the Workshop TL or above
   *  (not a workshop:manage grant). Editing / deleting a venue stays with canPlan. */
  canManage: boolean;
  canRun: boolean;
}

export type SetupKind = 'venue' | 'workshop' | 'category';

/** Icons a category can use (Material Symbols names). */
export const CATEGORY_ICONS = [
  'palette', 'music_note', 'directions_run', 'self_improvement', 'theater_comedy', 'spa',
  'construction', 'school', 'eco', 'photo_camera', 'restaurant', 'category'
];

/**
 * An unfinished venue form, kept in this browser tab (sessionStorage) while
 * staff draw or change its Workshop area on the Venue Map, and restored when
 * they come back to Workshop Setup.
 */
export interface VenueDraft {
  eventId: string;
  venueId: string | null;   // null = a new venue
  values: { name: string; capacity: number | null; area: string; amenities: string; notes: string };
}

export const VENUE_DRAFT_KEY = 'workshopVenueDraft';

// ── Planner (W4) ─────────────────────────────────────────────

export interface WorkshopSession {
  _id: string;
  event: string;
  workshop: { _id: string; title: string; category: WorkshopCategory | null; facilitators: string[] };
  venue: { _id: string; name: string; capacity: number };
  start: string;
  end: string;
  regOpensAt: string | null;
  regClosesAt: string | null;
  /** null = follow the times; true / false = opened / closed by hand at the door */
  regManual: boolean | null;
  cutoffAt: string | null;
  preRegLimit: number | null;
  facilitatorsOverride: string[];
  status: 'scheduled' | 'cancelled';
  /** In the schedule: how many on the list, waitlist, walk-ins, and attended (release 3). */
  counts?: { pre: number; wait: number; walkin: number; attended: number };
}

export interface WorkshopSchedule {
  event: { _id: string; name: string; startDate: string | null; endDate: string | null };
  sessions: WorkshopSession[];
  venues: { _id: string; name: string; capacity: number }[];
  workshops: { _id: string; title: string; category: WorkshopCategory | null; facilitators: string[] }[];
  /** Schedule: the Workshop TL or above. */
  canManage: boolean;
  /** The registration switch: the Workshop team. */
  canRun: boolean;
}

export interface SessionInput {
  workshop: string;
  venue: string;
  start: string;
  end: string;
  regOpensAt: string | null;
  regClosesAt: string | null;
  cutoffAt: string | null;
  preRegLimit: number | null;
  facilitatorsOverride: string[];
}

export interface SessionSaved {
  session: WorkshopSession;
  /** Soft checks the server ran (overlap, same day, limit, dates): shown, never blocking. */
  warnings: string[];
}

// ── Lists and the door (release 3: W5 + W6) ──────────────────

export type EntryList = 'pre' | 'wait' | 'walkin';

export interface EntryPass {
  _id: string;
  name: string;
  email: string;
  phone_no: string;
  order_id: number;
  passTypeName: string;
  isAdmitted: boolean;
  band: { _id: string; code: string } | null;
}

export interface WorkshopEntry {
  _id: string;
  session: string;
  pass: EntryPass | null;
  list: EntryList;
  position: number;
  /** On the list, but came after the cut-off: lost their place. */
  late: boolean;
  addedBy: { _id: string; name: string } | null;
  addedAt: string;
  attendedAt: string | null;
  attendedBy: { _id: string; name: string } | null;
}

export interface EntryCounts {
  pre: number;
  wait: number;
  walkin: number;
  attended: number;
  limit: number;
  capacity: number;
}

export interface SessionLists {
  session: Omit<WorkshopSession, 'workshop'> & { workshop: { _id: string; title: string; facilitators: string[] } };
  entries: WorkshopEntry[];
  counts: EntryCounts;
  registrationOpen: boolean;
}

/** How staff point at a person: a scanned band, or a pass picked from search. */
export interface PersonRef {
  raw?: string;
  passId?: string;
  /** A replaced band: staff checked the person and continue with its owner. */
  confirmReplaced?: boolean;
}

export interface EntryAdded { entry: WorkshopEntry; list: EntryList; warnings: string[]; counts: EntryCounts; }

export type DoorResult = 'admitted' | 'already' | 'waitlisted' | 'walkin' | 'late';
export interface DoorAnswer { result: DoorResult; entry: WorkshopEntry; warnings: string[]; afterCutoff?: boolean; counts: EntryCounts; }
