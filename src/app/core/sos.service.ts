import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, catchError, map, of } from 'rxjs';
import { environment } from 'src/environments/environment.development';

/** An SOS from the public festival page (PH4b). */
export interface SosAlert {
  _id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  message: string;
  phone: string;
  outsideVenue: boolean;
  status: 'open' | 'handled';
  handledBy: string | null;
  handledAt: string | null;
  handledNote: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class SosService {
  private url = environment.URL;
  /** Open alerts for the sidebar count. */
  readonly open$ = new BehaviorSubject<number>(0);

  constructor(private http: HttpClient) {}

  /** May I see the SOS page? (false on any error). */
  canSee(): Observable<boolean> {
    return this.http.get<{ canSee: boolean }>(this.url + '/sos/config').pipe(map(c => !!c.canSee), catchError(() => of(false)));
  }

  list(eventId: string) {
    return this.http.get<{ items: SosAlert[]; open: number }>(this.url + '/sos', { params: { event: eventId } });
  }

  handle(id: string, note: string) {
    return this.http.post<SosAlert>(this.url + `/sos/${id}/handle`, { note });
  }
}
