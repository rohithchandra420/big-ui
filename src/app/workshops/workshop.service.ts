import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { DoorAnswer, EntryAdded, EntryCounts, EntryPass, PersonRef, SessionInput, SessionLists, SessionSaved, Workshop, WorkshopCategory, WorkshopSchedule, WorkshopSession, WorkshopSetup, WorkshopVenue } from './workshops.model';

/** Workshops setup (release 2): venues, workshops and categories. */
@Injectable({ providedIn: 'root' })
export class WorkshopService {
  private url = environment.URL + '/workshops';

  constructor(private http: HttpClient) {}

  getSetup(eventId: string): Promise<WorkshopSetup> {
    return firstValueFrom(this.http.get<WorkshopSetup>(this.url + '/setup', { params: { event: eventId } }));
  }

  addVenue(data: Partial<WorkshopVenue> & { event: string; area?: string | null }): Promise<WorkshopVenue> {
    return firstValueFrom(this.http.post<WorkshopVenue>(this.url + '/venues', data));
  }
  updateVenue(id: string, data: any): Promise<WorkshopVenue> {
    return firstValueFrom(this.http.patch<WorkshopVenue>(`${this.url}/venues/${id}`, data));
  }
  deleteVenue(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.url}/venues/${id}`));
  }

  addWorkshop(data: any): Promise<Workshop> {
    return firstValueFrom(this.http.post<Workshop>(this.url + '/workshops', data));
  }
  updateWorkshop(id: string, data: any): Promise<Workshop> {
    return firstValueFrom(this.http.patch<Workshop>(`${this.url}/workshops/${id}`, data));
  }
  deleteWorkshop(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.url}/workshops/${id}`));
  }

  addCategory(data: Partial<WorkshopCategory>): Promise<WorkshopCategory> {
    return firstValueFrom(this.http.post<WorkshopCategory>(this.url + '/categories', data));
  }
  updateCategory(id: string, data: Partial<WorkshopCategory>): Promise<WorkshopCategory> {
    return firstValueFrom(this.http.patch<WorkshopCategory>(`${this.url}/categories/${id}`, data));
  }
  deleteCategory(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.url}/categories/${id}`));
  }

  // ── Planner (W4) ─────────────────────────────────────────

  getSchedule(eventId: string): Promise<WorkshopSchedule> {
    return firstValueFrom(this.http.get<WorkshopSchedule>(this.url + '/schedule', { params: { event: eventId } }));
  }
  addSession(eventId: string, data: SessionInput): Promise<SessionSaved> {
    return firstValueFrom(this.http.post<SessionSaved>(this.url + '/sessions', { ...data, event: eventId }));
  }
  updateSession(id: string, data: Partial<SessionInput>): Promise<SessionSaved> {
    return firstValueFrom(this.http.patch<SessionSaved>(`${this.url}/sessions/${id}`, data));
  }
  deleteSession(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.url}/sessions/${id}`));
  }
  /** open: true / false = by hand at the door; null = follow the times again. */
  setRegistration(id: string, open: boolean | null): Promise<{ session: WorkshopSession }> {
    return firstValueFrom(this.http.patch<{ session: WorkshopSession }>(`${this.url}/sessions/${id}/registration`, { open }));
  }

  // ── Lists and the door (release 3) ───────────────────────

  getLists(sessionId: string): Promise<SessionLists> {
    return firstValueFrom(this.http.get<SessionLists>(`${this.url}/sessions/${sessionId}/entries`));
  }
  /** Festival Pass holders by name, email, phone or order number (when scanning is down). */
  searchPasses(eventId: string, q: string): Promise<{ passes: EntryPass[] }> {
    return firstValueFrom(this.http.get<{ passes: EntryPass[] }>(this.url + '/passes', { params: { event: eventId, q } }));
  }
  addToList(sessionId: string, who: PersonRef): Promise<EntryAdded> {
    return firstValueFrom(this.http.post<EntryAdded>(`${this.url}/sessions/${sessionId}/entries`, who));
  }
  removeFromList(sessionId: string, entryId: string): Promise<{ promoted: string[]; counts: EntryCounts }> {
    return firstValueFrom(this.http.delete<{ promoted: string[]; counts: EntryCounts }>(`${this.url}/sessions/${sessionId}/entries/${entryId}`));
  }
  door(sessionId: string, who: PersonRef): Promise<DoorAnswer> {
    return firstValueFrom(this.http.post<DoorAnswer>(`${this.url}/sessions/${sessionId}/door`, who));
  }
  /** Let in now (walk-in) / Let in anyway (waitlisted). */
  letIn(sessionId: string, entryId: string): Promise<DoorAnswer> {
    return firstValueFrom(this.http.post<DoorAnswer>(`${this.url}/sessions/${sessionId}/entries/${entryId}/admit`, {}));
  }
}
