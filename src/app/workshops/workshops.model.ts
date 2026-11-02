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
