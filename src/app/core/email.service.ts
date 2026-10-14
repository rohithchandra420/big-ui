import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';

import { environment } from 'src/environments/environment.development';
import { AuthService } from './auth.service';
import {
  CustomEmailContent, EmailBatch, EmailConfig, EmailLogEntry, EmailLogPage, EmailLogQuery,
  EmailPreview, TicketEmailMode
} from '../models/email.model';

/**
 * Email epic (see EMAIL_CONTEXT.md) — talks to big-api's /emails routes.
 * The server decides who may send (DEV/DIR/ADMIN or a Box Office TL); the UI
 * just reads `canSend` from the config to show or hide the email actions.
 */
@Injectable({ providedIn: 'root' })
export class EmailService {

  private url = environment.URL;
  private config$?: Observable<EmailConfig>;

  constructor(private http: HttpClient, authService: AuthService) {
    // A different user may have different rights — re-ask on every login/logout.
    authService.user.subscribe(() => this.clearConfig());
  }

  /** Cached for the session; pass `refresh` to re-read (e.g. after sending,
   *  so today's remaining allowance is current). Errors read as "can't send". */
  getConfig(refresh = false): Observable<EmailConfig> {
    if (!this.config$ || refresh) {
      this.config$ = this.http.get<EmailConfig>(`${this.url}/emails/config`).pipe(
        catchError(() => of({ canSend: false } as EmailConfig)),
        shareReplay(1)
      );
    }
    return this.config$;
  }

  /** Forget the cached config (e.g. on logout / user change). */
  clearConfig() {
    this.config$ = undefined;
  }

  sendTicketEmails(ticketIds: string[], mode: TicketEmailMode, testRecipient?: string): Observable<EmailBatch> {
    return this.http.post<EmailBatch>(`${this.url}/emails/ticket`, { ticketIds, mode, testRecipient })
      .pipe(tap(() => this.clearConfig()));
  }

  sendCustomEmails(ticketIds: string[], content: CustomEmailContent, testRecipient?: string): Observable<EmailBatch> {
    return this.http.post<EmailBatch>(`${this.url}/emails/custom`, { ticketIds, ...content, testRecipient })
      .pipe(tap(() => this.clearConfig()));
  }

  /** One test copy to the signed-in user's own address. */
  sendTest(kind: 'ticket' | 'custom', ticketId: string, content?: CustomEmailContent): Observable<{ to: string }> {
    return this.http.post<{ to: string }>(`${this.url}/emails/test`, { kind, ticketId, ...(content || {}) })
      .pipe(tap(() => this.clearConfig()));
  }

  preview(kind: 'ticket' | 'custom', ticketId: string, content?: CustomEmailContent): Observable<EmailPreview> {
    return this.http.post<EmailPreview>(`${this.url}/emails/preview`, { kind, ticketId, ...(content || {}) });
  }

  getBatch(id: string): Observable<EmailBatch> {
    return this.http.get<EmailBatch>(`${this.url}/emails/batches/${id}`);
  }

  getBookingHistory(ticketId: string): Observable<EmailLogEntry[]> {
    return this.http.get<EmailLogEntry[]>(`${this.url}/emails/booking/${ticketId}`);
  }

  getLog(query: EmailLogQuery = {}): Observable<EmailLogPage> {
    let params = new HttpParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params = params.set(key, String(value));
    });
    return this.http.get<EmailLogPage>(`${this.url}/emails/log`, { params });
  }

  getLogEntry(id: string): Observable<EmailLogEntry> {
    return this.http.get<EmailLogEntry>(`${this.url}/emails/log/${id}`);
  }

  /** True when the current user may send; false on any error. */
  canSend(): Observable<boolean> {
    return this.getConfig().pipe(map(c => !!c.canSend));
  }

  canSendTicket(): Observable<boolean> {
    return this.getConfig().pipe(map(c => !!c.canSendTicket));
  }

  canSendCustom(): Observable<boolean> {
    return this.getConfig().pipe(map(c => !!c.canSendCustom));
  }

  canViewReport(): Observable<boolean> {
    return this.getConfig().pipe(map(c => !!c.canViewReport));
  }
}
