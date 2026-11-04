import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

// The public page's only way to the API (PUBLIC_HOME_CONTEXT.md). It calls
// /public/* routes only, never sends cookies (withCredentials: false), and
// keeps the last good answer on this phone so the page still opens offline.

export type Phase = 'before' | 'during' | 'after';

export interface PublicEvent {
  off: false;
  name: string;
  startDate: string;   // 'YYYY-MM-DD' (festival days, India time)
  endDate: string;
  today: string;
  phase: Phase;
  days: string[];
}
export type PublicEventAnswer = PublicEvent | { off: true };

export interface Loaded<T> {
  data: T;
  /** When the server answered (ms). */
  at: number;
  /** true = the server couldn't be reached; this is the last saved answer. */
  offline: boolean;
}

const KEY = 'big-live:';

@Injectable({ providedIn: 'root' })
export class PublicApiService {
  constructor(private http: HttpClient) {}

  event(): Observable<Loaded<PublicEventAnswer>> {
    return this.get<PublicEventAnswer>('event');
  }

  private get<T>(name: string): Observable<Loaded<T>> {
    return this.http.get<T>(`${environment.URL}/public/${name}`, { withCredentials: false }).pipe(
      map(data => {
        const loaded = { data, at: Date.now(), offline: false };
        this.save(name, loaded);
        return loaded;
      }),
      catchError(err => {
        const saved = this.read<T>(name);
        return saved ? of({ ...saved, offline: true }) : throwError(() => err);
      })
    );
  }

  private save(name: string, loaded: Loaded<unknown>): void {
    try { localStorage.setItem(KEY + name, JSON.stringify({ data: loaded.data, at: loaded.at })); } catch { /* storage off or full */ }
  }

  private read<T>(name: string): { data: T; at: number } | null {
    try {
      const raw = localStorage.getItem(KEY + name);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed.at === 'number' && parsed.data ? parsed : null;
    } catch {
      return null;
    }
  }
}
