import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AreaKind, AreaShape, LatLng, LocationType } from './venue-map.utils';

export interface VenueArea {
  _id: string;
  event: string;
  name: string;
  kind: AreaKind;
  shape: AreaShape;
  points: LatLng[];
  department: { _id: string; name: string } | null;
  notes: string;
  canEdit: boolean;
}

export interface AreaList {
  areas: VenueArea[];
  canDraw: boolean;          // DEV/DIR/ADMIN, or a Team Lead (own department, inside the boundary)
  canDrawBoundary: boolean;  // DEV/DIR/ADMIN only
}

export interface AreaInput {
  name: string;
  kind: AreaKind;
  points: LatLng[];
  department?: string | null;
  notes?: string;
}

export interface VenueLocation {
  _id: string;
  event: string;
  name: string;
  type: LocationType;
  lat: number;
  lng: number;
  department: { _id: string; name: string } | null;
  notes: string;
  canEdit: boolean;       // decided by the server for the signed-in user
}

export interface LocationList {
  locations: VenueLocation[];
  canAdd: boolean;        // DEV/DIR/ADMIN, or a Team Lead (own departments)
  canImport: boolean;     // KML import: DEV/DIR/ADMIN only
}

export interface LocationInput {
  name: string;
  type: LocationType;
  lat: number;
  lng: number;
  department?: string | null;
  notes?: string;
}

/** Venue Map locations (story A1, see VENUE_MAP_AND_TENT_FIELDS_CONTEXT.md). */
@Injectable({ providedIn: 'root' })
export class LocationService {
  private url = environment.URL;

  constructor(private http: HttpClient) {}

  list(eventId: string): Promise<LocationList> {
    return firstValueFrom(this.http.get<LocationList>(`${this.url}/locations?event=${encodeURIComponent(eventId)}`));
  }

  create(eventId: string, input: LocationInput): Promise<VenueLocation> {
    return firstValueFrom(this.http.post<VenueLocation>(`${this.url}/locations`, { event: eventId, ...input }));
  }

  update(id: string, changes: Partial<LocationInput>): Promise<VenueLocation> {
    return firstValueFrom(this.http.patch<VenueLocation>(`${this.url}/locations/${id}`, changes));
  }

  remove(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url}/locations/${id}`));
  }

  importMany(eventId: string, locations: LocationInput[]): Promise<{ created: number }> {
    return firstValueFrom(this.http.post<{ created: number }>(`${this.url}/locations/import`, { event: eventId, locations }));
  }

  // ── Areas and lines (story A2) ──

  listAreas(eventId: string): Promise<AreaList> {
    return firstValueFrom(this.http.get<AreaList>(`${this.url}/areas?event=${encodeURIComponent(eventId)}`));
  }

  createArea(eventId: string, input: AreaInput): Promise<VenueArea> {
    return firstValueFrom(this.http.post<VenueArea>(`${this.url}/areas`, { event: eventId, ...input }));
  }

  updateArea(id: string, changes: Partial<AreaInput>): Promise<VenueArea> {
    return firstValueFrom(this.http.patch<VenueArea>(`${this.url}/areas/${id}`, changes));
  }

  removeArea(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.url}/areas/${id}`));
  }

  importAreas(eventId: string, areas: AreaInput[]): Promise<{ created: number }> {
    return firstValueFrom(this.http.post<{ created: number }>(`${this.url}/areas/import`, { event: eventId, areas }));
  }

  /** Departments this user may pick: everyone for DEV/DIR/ADMIN, own ones for a Team Lead. */
  myDepartments(): Promise<{ _id: string; name: string; key?: string }[]> {
    return firstValueFrom(this.http.get<{ _id: string; name: string; key?: string }[]>(`${this.url}/department/mine`));
  }
}
