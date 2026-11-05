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
  /** PH4a — set on Admin › Public Page. The first contact is the main line. */
  emergency?: { contacts: { label: string; phone: string }[]; note: string };
  help?: { icon: string; title: string; text: string }[];
  /** PH4b: staff switched SOS on. */
  sos?: boolean;
}

/** PH4a public map: whitelisted pins and areas only. */
export interface PublicMapPin { id: string; name: string; type: string; lat: number; lng: number; open?: boolean; note?: string; }
export interface PublicMapArea { id: string; name: string; kind: string; points: [number, number][]; }
export type PublicMapAnswer = { off: false; pins: PublicMapPin[]; areas: PublicMapArea[] } | { off: true };

/** PH6: photos staff chose to show, and "through the years". */
export interface PublicPhoto { id: string; url: string; thumbUrl: string; caption: string; sub: string; layout: 'normal' | 'tall' | 'wide'; }
export interface PublicEdition { edition: string; items: { value: string; label: string; icon: string }[]; }
export type PublicHighlightsAnswer = { off: false; photos: PublicPhoto[]; stats: PublicEdition[] } | { off: true };
export type PublicEventAnswer = PublicEvent | { off: true };

/** A workshop session's public status (big-api utils/publicSessionState.js). */
export type SessionState = 'cancelled' | 'ended' | 'closed' | 'soon' | 'reg' | 'regclosed' | 'list' | 'open' | 'full';

export interface PublicSession {
  id: string;
  title: string;
  category: { name: string; colour: string; icon: string } | null;
  venue: string;
  start: string;
  end: string;
  facilitators: string[];
  description: string;
  ageLimit: string;
  language: string;
  bringYourOwn: string;
  itemsRequired: string;
  state: SessionState;
  /** The time that goes with the state (e.g. when registration opens). */
  stateAt: string | null;
  /** Registration: the list is full, the venue keeps a waitlist. */
  full: boolean;
  /** Only while everyone can walk in, and only when staff show it. */
  placesLeft: number | null;
}
export type PublicSessionsAnswer = { off: false; sessions: PublicSession[] } | { off: true };

/** A news post from the organisers (PH3) — sent from staff Announcements. */
export interface PublicNews {
  id: string;
  type: 'general' | 'urgent' | 'schedule' | 'weather';
  title: string;
  message: string;
  at: string;
}
export type PublicNewsAnswer = { off: false; news: PublicNews[] } | { off: true };

export interface Loaded<T> {
  data: T;
  /** When the server answered (ms). */
  at: number;
  /** true = the server couldn't be reached; this is the last saved answer. */
  offline: boolean;
}

const KEY = 'big-live:';

/** A random id for this phone, kept on it — only used for the SOS limits (PH4b). */
export function deviceId(): string {
  let id = '';
  try { id = localStorage.getItem(KEY + 'device') || ''; } catch { /* storage off */ }
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) {
    id = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    try { localStorage.setItem(KEY + 'device', id); } catch { /* storage off: a new id each time */ }
  }
  return id;
}

@Injectable({ providedIn: 'root' })
export class PublicApiService {
  constructor(private http: HttpClient) {}

  event(): Observable<Loaded<PublicEventAnswer>> {
    return this.get<PublicEventAnswer>('event');
  }

  sessions(): Observable<Loaded<PublicSessionsAnswer>> {
    return this.get<PublicSessionsAnswer>('sessions');
  }

  news(): Observable<Loaded<PublicNewsAnswer>> {
    return this.get<PublicNewsAnswer>('news');
  }

  map(): Observable<Loaded<PublicMapAnswer>> {
    return this.get<PublicMapAnswer>('map');
  }

  highlights(): Observable<Loaded<PublicHighlightsAnswer>> {
    return this.get<PublicHighlightsAnswer>('highlights');
  }

  /** PH4b: send an SOS to the festival team (never saved or retried offline). */
  sendSos(body: { lat: number; lng: number; accuracy: number | null; message: string; phone: string }): Observable<{ ok: true; id: string }> {
    return this.http.post<{ ok: true; id: string }>(`${environment.URL}/public/sos`, { ...body, device: deviceId() }, { withCredentials: false });
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
