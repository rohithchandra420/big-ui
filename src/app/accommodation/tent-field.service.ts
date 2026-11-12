import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';

import { environment } from 'src/environments/environment.development';

/** Tent Fields (Epic B, VENUE_MAP_AND_TENT_FIELDS_CONTEXT.md). Rows / columns are 0-based. */
export type TentState = 'empty' | 'partly' | 'full';

export interface FieldCounts { placed: number; empty: number; partly: number; full: number; }

/** Tents per tent type on a field (e.g. SH 12, SO 4). */
export interface FieldTypeCount { passType?: string | null; code: string; name: string; count: number; }

export interface TentField {
  _id: string;
  event: string;
  name: string;
  rows: number;
  cols: number;
  paths: [number, number][];
  layoutVersion: number;
  /** B3: the Camping zone on the Venue Map (area id), if linked. */
  area?: string | null;
  counts?: FieldCounts;
  types?: FieldTypeCount[];
}

export interface FieldPassType { _id: string; name: string; code?: string; }

export interface FieldOccupant {
  _id: string;
  name: string;
  isAdmitted: boolean;
  gender?: string | null;
  phone_no?: string;
  email?: string;
  order_id?: number | null;
}

export interface FieldTent {
  _id: string;
  tent_no: string;
  passType: FieldPassType | null;
  capacity: number;
  state: TentState;
  row?: number;
  col?: number;
  occupants?: FieldOccupant[];
}

export interface FieldList { fields: TentField[]; unplaced: number; canEdit: boolean; }

export interface FieldDetail {
  field: TentField;
  counts: FieldCounts;
  tents: FieldTent[];
  /** Tents of the event not on any field yet (only sent to editors). */
  unplaced: FieldTent[];
  canEdit: boolean;
}

export interface LayoutSave {
  version: number;
  paths: [number, number][];
  placements: { tent: string; row: number; col: number }[];
}

@Injectable({ providedIn: 'root' })
export class TentFieldService {
  private url = environment.URL;

  constructor(private http: HttpClient) {}

  list(eventId: string) {
    return this.http.get<FieldList>(this.url + '/tent-fields', { params: new HttpParams().set('event', eventId) });
  }

  get(id: string) {
    return this.http.get<FieldDetail>(this.url + '/tent-fields/' + id);
  }

  create(body: { event: string; name: string; rows: number; cols: number }) {
    return this.http.post<TentField>(this.url + '/tent-fields', body);
  }

  update(id: string, body: { name?: string; rows?: number; cols?: number; area?: string | null }) {
    return this.http.patch<TentField>(this.url + '/tent-fields/' + id, body);
  }

  remove(id: string) {
    return this.http.delete<{ deleted: boolean; tentsFreed: number }>(this.url + '/tent-fields/' + id);
  }

  saveLayout(id: string, body: LayoutSave) {
    return this.http.put<{ field: TentField; counts: FieldCounts }>(this.url + '/tent-fields/' + id + '/layout', body);
  }
}
