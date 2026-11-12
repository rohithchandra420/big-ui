import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { MedicalLockService } from './medical-lock.service';
import {
  AuditEntry, DayReport, ExportRow, FoundPerson, MedicalAccess, MedicalPatient, MedicalVisit, PatientHeaderInput, PatientKind,
  PatientReport, RecordFilters, RecordsPage, VisitInput
} from './medical.model';

type VisitResult = { visit: MedicalVisit; patient: MedicalPatient };

/** Medical Desk (release 1). Every call waits for the password when the desk is locked (423) and retries once. */
@Injectable({ providedIn: 'root' })
export class MedicalService {
  private url = environment.URL + '/medical';

  constructor(private http: HttpClient, private lock: MedicalLockService) {}

  private async call<T>(make: () => Observable<T>): Promise<T> {
    try {
      const res = await firstValueFrom(make());
      this.lock.touched();
      return res;
    } catch (err: any) {
      if (err?.status !== 423) throw err;
      this.lock.lock();
      await this.lock.waitForUnlock();
      const res = await firstValueFrom(make());
      this.lock.touched();
      return res;
    }
  }

  async access(): Promise<MedicalAccess> {
    const a = await firstValueFrom(this.http.get<MedicalAccess>(this.url + '/access'));
    this.lock.lockMinutes = a.lockMinutes || this.lock.lockMinutes;
    if (a.locked) this.lock.lock(); else this.lock.touched();
    return a;
  }

  find(eventId: string, q: string): Promise<{ people: FoundPerson[] }> {
    return this.call(() => this.http.get<{ people: FoundPerson[] }>(this.url + '/find', { params: { event: eventId, q } }));
  }
  findBand(eventId: string, raw: string): Promise<{ person: FoundPerson }> {
    return this.call(() => this.http.get<{ person: FoundPerson }>(this.url + '/find-band', { params: { event: eventId, raw } }));
  }

  /** Opens a report — or returns the existing one for that pass / staff member. */
  openReport(eventId: string, kind: PatientKind, who: { pass?: string; user?: string } & PatientHeaderInput): Promise<{ patient: MedicalPatient; existing: boolean }> {
    return this.call(() => this.http.post<{ patient: MedicalPatient; existing: boolean }>(this.url + '/patients', { event: eventId, kind, ...who }));
  }

  records(eventId: string, f: RecordFilters): Promise<RecordsPage> {
    const params: Record<string, string> = { event: eventId };
    if (f.q?.trim()) params['q'] = f.q.trim();
    for (const k of ['type', 'severity', 'outcome', 'from', 'to'] as const) if (f[k]) params[k] = String(f[k]);
    if (f.resting) params['resting'] = '1';
    if (f.followUp) params['followUp'] = '1';
    if (f.page) params['page'] = String(f.page);
    return this.call(() => this.http.get<RecordsPage>(this.url + '/patients', { params }));
  }

  report(id: string): Promise<PatientReport> {
    return this.call(() => this.http.get<PatientReport>(`${this.url}/patients/${id}`));
  }
  updateReport(id: string, data: PatientHeaderInput): Promise<{ patient: MedicalPatient }> {
    return this.call(() => this.http.patch<{ patient: MedicalPatient }>(`${this.url}/patients/${id}`, data));
  }
  deleteReport(id: string): Promise<{ ok: boolean }> {
    return this.call(() => this.http.delete<{ ok: boolean }>(`${this.url}/patients/${id}`));
  }

  addVisit(patientId: string, data: VisitInput): Promise<VisitResult> {
    return this.call(() => this.http.post<VisitResult>(`${this.url}/patients/${patientId}/visits`, data));
  }
  updateVisit(id: string, data: Partial<VisitInput>): Promise<VisitResult> {
    return this.call(() => this.http.patch<VisitResult>(`${this.url}/visits/${id}`, data));
  }
  deleteVisit(id: string): Promise<{ ok: boolean; patient: MedicalPatient }> {
    return this.call(() => this.http.delete<{ ok: boolean; patient: MedicalPatient }>(`${this.url}/visits/${id}`));
  }
  markLeft(id: string): Promise<VisitResult> {
    return this.call(() => this.http.post<VisitResult>(`${this.url}/visits/${id}/left`, {}));
  }
  followUpDone(id: string): Promise<VisitResult> {
    return this.call(() => this.http.post<VisitResult>(`${this.url}/visits/${id}/follow-up-done`, {}));
  }

  /** The full report as a password-protected PDF by email (password: phone's last 6 digits, or `password`). */
  emailReport(id: string, data: { to: string; password?: string; testRecipient?: string }): Promise<{ to: string; redirectedTo: string | null; password: 'phone' | 'typed' }> {
    return this.call(() => this.http.post<{ to: string; redirectedTo: string | null; password: 'phone' | 'typed' }>(`${this.url}/patients/${id}/email`, data));
  }
  medicines(eventId: string, q: string): Promise<{ medicines: string[] }> {
    return this.call(() => this.http.get<{ medicines: string[] }>(this.url + '/medicines', { params: { event: eventId, q } }));
  }
  dayReport(eventId: string, date?: string): Promise<DayReport> {
    const params: Record<string, string> = { event: eventId };
    if (date) params['date'] = date;
    return this.call(() => this.http.get<DayReport>(this.url + '/report', { params }));
  }
  /** Full visit list (DIR, DEV, Medical TL only). Dates are festival days (YYYY-MM-DD); none = the whole event. */
  exportVisits(eventId: string, from?: string, to?: string): Promise<{ event: string; rows: ExportRow[]; truncated: boolean }> {
    const params: Record<string, string> = { event: eventId };
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.call(() => this.http.get<{ event: string; rows: ExportRow[]; truncated: boolean }>(this.url + '/export', { params }));
  }
  audit(eventId: string, patientId?: string): Promise<{ entries: AuditEntry[] }> {
    const params: Record<string, string> = { event: eventId };
    if (patientId) params['patient'] = patientId;
    return this.call(() => this.http.get<{ entries: AuditEntry[] }>(this.url + '/audit', { params }));
  }
}
