import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { DepositList, DepositMode, DepositRow, MoveResult, NeedInfo, VolBoard, VolProfile } from './volunteers.model';

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

  // ── Deposits (V2) ──

  deposits(eventId: string): Promise<DepositList> {
    return firstValueFrom(this.http.get<DepositList>(this.url + '/deposits', { params: { event: eventId } }));
  }

  /** Record a deposit, or correct one that is still held. */
  saveDeposit(eventId: string, userId: string, data: { amount: number; mode: DepositMode; note: string; collectedAt?: string }): Promise<DepositRow> {
    return firstValueFrom(this.http.put<DepositRow>(`${this.url}/${userId}/deposit`, { event: eventId, ...data }));
  }

  /** Full refund only. */
  refundDeposit(eventId: string, userId: string, mode: DepositMode, note: string): Promise<DepositRow> {
    return firstValueFrom(this.http.post<DepositRow>(`${this.url}/${userId}/deposit/refund`, { event: eventId, mode, note }));
  }

  /** Remove a deposit entered by mistake (only while held). */
  removeDeposit(eventId: string, userId: string): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.delete<{ ok: boolean }>(`${this.url}/${userId}/deposit`, { body: { event: eventId } }));
  }

  /** The event's standard deposit (pre-fills the form). 0 = none. */
  setDefaultDeposit(eventId: string, amount: number): Promise<{ defaultAmount: number }> {
    return firstValueFrom(this.http.put<{ defaultAmount: number }>(this.url + '/deposits/settings', { event: eventId, amount }));
  }

  /** 0 = no number. */
  setNeed(eventId: string, departmentId: string, needed: number): Promise<NeedInfo> {
    return firstValueFrom(this.http.put<NeedInfo>(this.url + '/needs', { event: eventId, department: departmentId, needed }));
  }
}
