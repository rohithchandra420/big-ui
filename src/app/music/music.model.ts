/** Music section (MUSIC_CONTEXT.md): stages, acts and their slots. Same shapes as big-api routers/music.js. */

export interface MusicStage {
  _id: string;
  name: string;
  notes: string;
  /** The Venue Map "Stage area" it stands on, if linked. */
  area: { _id: string; name: string } | null;
  slotCount: number;
}

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

export type StageInput = { name?: string; area?: string | null; notes?: string };
export type ActInput = { name?: string; genre?: string; contactName?: string; contactPhone?: string; notes?: string };
export type SlotInput = {
  act?: string; stage?: string; start?: string; end?: string;
  soundCheckStart?: string | null; soundCheckEnd?: string | null;
};
