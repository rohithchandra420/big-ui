/** Music section (MUSIC_CONTEXT.md): stages, acts and their slots. Same shapes as big-api routers/music.js. */

export interface MusicStage {
  _id: string;
  name: string;
  notes: string;
  /** The Venue Map "Stage area" it stands on, if linked. */
  area: { _id: string; name: string } | null;
  /** Keys from STAGE_AMENITIES (staff only). */
  amenities: string[];
  /** Up to MAX_EXTRA_AMENITIES free-text extras. */
  extraAmenities: string[];
  slotCount: number;
}

/**
 * Stage amenities (user, 2026-11-20): staff only, never on the public page.
 * Mirror of big-api models/musicStage.js AMENITIES — keep the keys in step.
 */
export interface StageAmenity { key: string; label: string; icon: string; }
export const STAGE_AMENITIES: StageAmenity[] = [
  { key: 'sound', label: 'Sound system', icon: 'speaker' },
  { key: 'lights', label: 'Stage lights', icon: 'light' },
  { key: 'power', label: 'Power supply', icon: 'bolt' },
  { key: 'backstage', label: 'Backstage', icon: 'door_back' },
  { key: 'green_room', label: 'Green room', icon: 'chair' },
  { key: 'shade', label: 'Roof / shade', icon: 'roofing' },
  { key: 'seating', label: 'Audience seating', icon: 'event_seat' },
  { key: 'water', label: 'Drinking water', icon: 'water_drop' },
  { key: 'toilets', label: 'Toilets nearby', icon: 'wc' },
  { key: 'wheelchair', label: 'Wheelchair access', icon: 'accessible' },
];
export const MAX_EXTRA_AMENITIES = 5;
export const EXTRA_AMENITY_MAX_LEN = 30;

export interface MusicAct {
  _id: string;
  /** Artist / band. */
  name: string;
  genre: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  slotCount: number;
}

export interface MusicSlot {
  _id: string;
  act: string;
  stage: string;
  start: string;
  end: string;
  soundCheckStart: string | null;
  soundCheckEnd: string | null;
}

/** GET /music: everything for one event, with what the signed-in person may change. */
export interface MusicData {
  canEdit: boolean;
  canManage: boolean;
  stages: MusicStage[];
  acts: MusicAct[];
  slots: MusicSlot[];
}

/** Another slot a saved one overlaps: same stage (sound check counts), or the same act. */
export interface MusicClash {
  kind: 'stage' | 'act';
  slot: string;
  act: string;
  stage: string;
  start: string;
  end: string;
}

export interface MusicStageArea {
  _id: string;
  name: string;
  usedBy: { _id: string; name: string } | null;
}

export type StageInput = { name?: string; area?: string | null; notes?: string; amenities?: string[]; extraAmenities?: string[] };
export type ActInput = { name?: string; genre?: string; contactName?: string; contactPhone?: string; notes?: string };
export type SlotInput = {
  act?: string; stage?: string; start?: string; end?: string;
  soundCheckStart?: string | null; soundCheckEnd?: string | null;
};
