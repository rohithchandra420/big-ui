import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { DeskDecision, DeskGuestHit, DeskPerson, DeskState, Guest, GuestOutcome, GuestPass, FiguresInput, MealDay, MealRef, MessDay, MessReport, MessSetup, MessSetupInput, PassCard, PassInput, ScanOutcome, ServedRow } from './hospitality.model';

/** Hospitality (H1): the mess plan, the day's meals, kitchen count and alerts. */
@Injectable({ providedIn: 'root' })
export class HospitalityService {
  private url = environment.URL + '/hospitality';

  constructor(private http: HttpClient) {}

  getSetup(eventId: string): Promise<MessSetup> {
    return firstValueFrom(this.http.get<MessSetup>(this.url + '/setup', { params: { event: eventId } }));
  }
  saveSetup(data: MessSetupInput): Promise<{ plan: MessSetup['plan'] }> {
    return firstValueFrom(this.http.put<{ plan: MessSetup['plan'] }>(this.url + '/setup', data));
  }

  getDay(eventId: string, date?: string): Promise<MessDay> {
    const params: Record<string, string> = { event: eventId };
    if (date) params['date'] = date;
    return firstValueFrom(this.http.get<MessDay>(this.url + '/day', { params }));
  }

  setMealTime(ref: MealRef, start: string): Promise<MealDay> {
    return firstValueFrom(this.http.patch<MealDay>(this.url + '/meals', { ...ref, start }));
  }
  resetMealTime(ref: MealRef): Promise<MealDay> {
    return firstValueFrom(this.http.patch<MealDay>(this.url + '/meals', { ...ref, reset: true }));
  }
  close(ref: MealRef): Promise<MealDay> {
    return firstValueFrom(this.http.post<MealDay>(this.url + '/meals/close', ref));
  }
  reopen(ref: MealRef): Promise<MealDay> {
    return firstValueFrom(this.http.post<MealDay>(this.url + '/meals/reopen', ref));
  }
  sendCount(ref: MealRef): Promise<MealDay> {
    return firstValueFrom(this.http.post<MealDay>(this.url + '/meals/count', ref));
  }
  remindTls(ref: MealRef): Promise<{ tls: number; delivered: number }> {
    return firstValueFrom(this.http.post<{ tls: number; delivered: number }>(this.url + '/remind-tls', ref));
  }
  // ── Serving desk (H2) ──
  getDesk(eventId: string): Promise<DeskState> {
    return firstValueFrom(this.http.get<DeskState>(this.url + '/desk', { params: { event: eventId } }));
  }
  /** Staff by name / email, and guests with a pass valid for the open meal. */
  searchStaff(eventId: string, q: string): Promise<{ people: DeskPerson[]; guests: DeskGuestHit[] }> {
    return firstValueFrom(this.http.get<{ people: DeskPerson[]; guests: DeskGuestHit[] }>(this.url + '/staff', { params: { event: eventId, q } }));
  }
  scan(eventId: string, who: { qr?: string; user?: string; pass?: string }): Promise<ScanOutcome> {
    return firstValueFrom(this.http.post<ScanOutcome>(this.url + '/desk/scan', { event: eventId, ...who }));
  }
  decide(eventId: string, user: string, decision: 'serve' | 'refuse' | 'block' | 'extra', reason?: string): Promise<{ decision: DeskDecision; person: DeskPerson }> {
    return firstValueFrom(this.http.post<{ decision: DeskDecision; person: DeskPerson }>(this.url + '/desk/decide', { event: eventId, user, decision, ...(reason ? { reason } : {}) }));
  }
  notifyFlaggedTls(eventId: string): Promise<{ tls: number; people: number; delivered: number }> {
    return firstValueFrom(this.http.post<{ tls: number; people: number; delivered: number }>(this.url + '/desk/notify-tls', { event: eventId }));
  }

  // ── Guests and Meal Passes (H3) ──
  getGuests(eventId: string): Promise<{ today: string; guests: Guest[] }> {
    return firstValueFrom(this.http.get<{ today: string; guests: Guest[] }>(this.url + '/guests', { params: { event: eventId } }));
  }
  addGuest(eventId: string, data: { name: string; phone?: string; note?: string }): Promise<Guest> {
    return firstValueFrom(this.http.post<Guest>(this.url + '/guests', { event: eventId, ...data }));
  }
  updateGuest(id: string, data: { name?: string; phone?: string; note?: string }): Promise<Guest> {
    return firstValueFrom(this.http.patch<Guest>(`${this.url}/guests/${id}`, data));
  }
  deleteGuest(id: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(`${this.url}/guests/${id}`));
  }
  issuePass(guestId: string, data: PassInput): Promise<GuestPass> {
    return firstValueFrom(this.http.post<GuestPass>(`${this.url}/guests/${guestId}/passes`, data));
  }
  revokePass(id: string): Promise<GuestPass> {
    return firstValueFrom(this.http.post<GuestPass>(`${this.url}/passes/${id}/revoke`, {}));
  }
  passCard(id: string): Promise<PassCard> {
    return firstValueFrom(this.http.get<PassCard>(`${this.url}/passes/${id}/qr`));
  }
  servePass(eventId: string, pass: string, body: { veg?: number; nonVeg?: number; extra?: boolean; block?: boolean }): Promise<GuestOutcome> {
    return firstValueFrom(this.http.post<GuestOutcome>(this.url + '/desk/serve-pass', { event: eventId, pass, ...body }));
  }
  walkIn(eventId: string, data: { name: string; note?: string; vegPlates: number; nonVegPlates: number }): Promise<GuestOutcome> {
    return firstValueFrom(this.http.post<GuestOutcome>(this.url + '/desk/walk-in', { event: eventId, ...data }));
  }

  // ── Daily report (H4) ──
  getReport(eventId: string, q: { from: string; to?: string; department?: string | null }): Promise<MessReport> {
    return firstValueFrom(this.http.get<MessReport>(this.url + '/report', { params: this.reportParams(eventId, q) }));
  }
  getServedList(eventId: string, q: { from: string; to?: string; department?: string | null }): Promise<{ rows: ServedRow[] }> {
    return firstValueFrom(this.http.get<{ rows: ServedRow[] }>(this.url + '/report/served', { params: this.reportParams(eventId, q) }));
  }
  saveFigures(ref: MealRef, data: FiguresInput): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.put<{ ok: boolean }>(this.url + '/meals/figures', { ...ref, ...data }));
  }
  private reportParams(eventId: string, q: { from: string; to?: string; department?: string | null }): Record<string, string> {
    const p: Record<string, string> = { event: eventId, from: q.from };
    if (q.to) p['to'] = q.to;
    if (q.department) p['department'] = q.department;
    return p;
  }

  sendAlert(eventId: string, message: string): Promise<{ recipients: number; delivered: number }> {
    return firstValueFrom(this.http.post<{ recipients: number; delivered: number }>(this.url + '/alert', { event: eventId, message }));
  }
}
