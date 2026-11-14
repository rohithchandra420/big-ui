import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { MoveResult, NeedInfo, VolBoard, VolProfile } from './volunteers.model';

/** Volunteers page: the board, assign / free, volunteers needed and profiles. */
@Injectable({ providedIn: 'root' })
export class VolunteersService {
  private url = environment.URL + '/volunteers';

  constructor(private http: HttpClient) {}

  board(eventId: string): Promise<VolBoard> {
    return firstValueFrom(this.http.get<VolBoard>(this.url, { params: { event: eventId } }));
  }

  /** `departmentId` null = free them back to the Unassigned pool. */
  assign(eventId: string, userIds: string[], departmentId: string | null): Promise<MoveResult> {
    return firstValueFrom(this.http.post<MoveResult>(this.url + '/assign', { event: eventId, userIds, department: departmentId }));
  }

  profile(eventId: string, userId: string): Promise<VolProfile> {
    return firstValueFrom(this.http.get<VolProfile>(`${this.url}/${userId}/profile`, { params: { event: eventId } }));
  }

  /** Volunteers needed in one department (read by My Department). */
  need(eventId: string, departmentId: string): Promise<NeedInfo> {
    return firstValueFrom(this.http.get<NeedInfo>(this.url + '/needs', { params: { event: eventId, department: departmentId } }));
  }

  /** 0 = no number. */
  setNeed(eventId: string, departmentId: string, needed: number): Promise<NeedInfo> {
    return firstValueFrom(this.http.put<NeedInfo>(this.url + '/needs', { event: eventId, department: departmentId, needed }));
  }
}
