import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../environments/environment';

// Early Check-In page (EC3, EARLY_CHECKIN_CONTEXT.md). Calls big-api
// /checkin/* only, never sends cookies, and sends the link's secret in the
// request BODY (never the URL), so it can't end up in any request log.
// Nothing is saved on the phone.

export type CheckinGender = 'Male' | 'Female' | 'Prefer not to say';

export interface CheckinPass {
  id: string;
  passType: string;
  name: string;
  phone_no: string;
  email: string;
  gender: CheckinGender | null;
  /** Admitted at the gate: shown, not editable. */
  locked: boolean;
}

export interface CheckinPage {
  state: 'open';
  event: { name: string; startDate: string | null; endDate: string | null };
  booking: string | null;
  expiresAt: string;
  /** The details every Festival Pass needs (big-api utils/festivalDetails.js). */
  fields: string[];
  genders: CheckinGender[];
  nameMin: number;
  nameMax: number;
  passes: CheckinPass[];
}

/** Why the form can't be shown or sent. */
export type CheckinProblem = 'invalid' | 'expired' | 'used' | 'busy' | 'offline' | 'error';

export type CheckinAnswer =
  | CheckinPage
  | { state: 'submitted'; count: number }
  | { state: 'problem'; problem: CheckinProblem; message?: string };

export type CheckinSubmitPass = Pick<CheckinPass, 'id' | 'name' | 'phone_no' | 'email' | 'gender'>;

function problemOf(err: HttpErrorResponse): CheckinAnswer {
  const state = err.error?.state;
  if (state === 'invalid' || state === 'expired' || state === 'used') return { state: 'problem', problem: state };
  if (err.status === 0) return { state: 'problem', problem: 'offline' };
  if (err.status === 429) return { state: 'problem', problem: 'busy' };
  // A malformed link (wrong length / characters) is refused before any lookup.
  if (err.status === 400 && Array.isArray(err.error?.errors)) return { state: 'problem', problem: 'invalid' };
  return { state: 'problem', problem: 'error', message: typeof err.error?.message === 'string' ? err.error.message : undefined };
}

@Injectable({ providedIn: 'root' })
export class CheckinApiService {
  constructor(private http: HttpClient) {}

  open(token: string): Observable<CheckinAnswer> {
    return this.http.post<CheckinPage>(`${environment.URL}/checkin/open`, { token }, { withCredentials: false }).pipe(
      map(page => page as CheckinAnswer),
      catchError((err: HttpErrorResponse) => of(problemOf(err))));
  }

  submit(token: string, passes: CheckinSubmitPass[]): Observable<CheckinAnswer> {
    return this.http.post<{ state: 'submitted'; count: number }>(`${environment.URL}/checkin/submit`, { token, passes }, { withCredentials: false }).pipe(
      map(r => r as CheckinAnswer),
      catchError((err: HttpErrorResponse) => of(problemOf(err))));
  }
}

/** The link's secret from an address hash like `#check-in/<secret>`, or null. */
export function checkinTokenFromHash(hash: string): string | null {
  const m = /^#check-in\/([A-Za-z0-9_-]{20,100})$/.exec(hash || '');
  return m ? m[1] : null;
}

/** True when the hash is a check-in address at all (even a broken one). */
export function isCheckinHash(hash: string): boolean {
  return /^#check-in(\/|$)/.test(hash || '');
}
