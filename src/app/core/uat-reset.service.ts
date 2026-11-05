// UAT-RESET: remove before Production (whole file). See UAT_RESET_CONTEXT.md.
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from 'src/environments/environment.development';

export type UatResetGroup = 'bands' | 'workshops' | 'map' | 'hospitality' | 'attendance';

export interface UatResetCounts {
  /** records null = the event has no dates, so this group can't be used. */
  attendance: { records: number | null };
  bands: { bands: number; admitted: number };
  workshops: { entries: number };
  map: { locations: number; areas: number };
  hospitality: { mealsServed: number; mealDays: number; mealPasses: number; stays: number };
}

@Injectable({ providedIn: 'root' })
export class UatResetService {
  private url = environment.URL;
  constructor(private http: HttpClient) {}

  /** true only when the server has the reset switched on and you're a Developer. */
  available(): Observable<boolean> {
    return this.http.get<{ enabled: boolean }>(this.url + '/admin/uat-reset/config').pipe(
      map(c => !!c?.enabled), catchError(() => of(false)));
  }

  preview(eventId: string) {
    return this.http.get<{ event: { _id: string; name: string }; counts: UatResetCounts }>(
      this.url + '/admin/uat-reset/preview', { params: { event: eventId } });
  }

  reset(eventId: string, groups: UatResetGroup[], confirm: string) {
    return this.http.post<{ event: { _id: string; name: string }; deleted: Partial<UatResetCounts> }>(
      this.url + '/admin/uat-reset', { event: eventId, groups, confirm });
  }
}
