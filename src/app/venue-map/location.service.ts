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

/** GET /map/status: live statuses by map item id (today: the Mess Hall area). */
export interface MapStatus {
  /** Tent Fields (B3): a Camping zone linked to a field also carries its fieldId. */
  areas: Record<string, { kind: string; open: boolean; label: string; fieldId?: string; state?: string }>;
  /** The Box Office pin (open / closed + note); WASH facilities (kind 'wash', with `state`). */
  locations: Record<string, { kind: string; open: boolean; label: string; state?: string }>;
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

  /** The one small live-status call the open map repeats once a minute (Hospitality H3). */
  status(eventId: string): Promise<MapStatus> {
    return firstValueFrom(this.http.get<MapStatus>(`${this.url}/map/status?event=${encodeURIComponent(eventId)}`));
  }

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
