import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { MealDay, MealRef, MessDay, MessSetup, MessSetupInput } from './hospitality.model';

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
  sendAlert(eventId: string, message: string): Promise<{ recipients: number; delivered: number }> {
    return firstValueFrom(this.http.post<{ recipients: number; delivered: number }>(this.url + '/alert', { event: eventId, message }));
  }
}
