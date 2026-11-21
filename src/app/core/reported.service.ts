import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ReportedActor, canSetReported } from './reported-access';

export interface ReportedResult {
  _id: string;
  reportedAt: string | null;
  reportedBy: { _id: string; name: string } | null;
  marked?: number;
  removed?: number;
}

/** Joining Time: mark a person Reported (they arrived) or undo it. */
@Injectable({ providedIn: 'root' })
export class ReportedService {
  private url = environment.URL + '/users';

  constructor(private http: HttpClient, private auth: AuthService) {}

  /** `reportedAt` (ISO) omitted = now. */
  mark(userId: string, eventId: string, reportedAt?: string): Promise<ReportedResult> {
    return firstValueFrom(this.http.patch<ReportedResult>(`${this.url}/${userId}/reported`, { event: eventId, ...(reportedAt ? { reportedAt } : {}) }));
  }

  undo(userId: string, eventId: string): Promise<ReportedResult> {
    return firstValueFrom(this.http.delete<ReportedResult>(`${this.url}/${userId}/reported`, { params: { event: eventId } }));
  }

  /** The signed-in user, as the access rule needs them. */
  actor(): ReportedActor | null {
    const u = this.auth.currentUser;
    if (!u) return null;
    return {
      role: u.role,
      depts: (u.departments || []).filter(d => d?.department).map(d => ({ id: String(d.department._id), key: this.auth.deptKeyOf(d.department) }))
    };
  }

  /** Whether the signed-in user may mark / undo Reported for this person. */
  canSet(targetRole: string, targetHome: string | null | undefined): boolean {
    return canSetReported(this.actor(), targetRole, targetHome || '');
  }
}
