import { Injectable, OnDestroy, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, Subscription, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** The announcement types plus BiG's own private "Emails sent" note. */
export type BillboardNoteType = 'general' | 'urgent' | 'schedule' | 'weather' | 'reminder' | 'task' | 'email' | 'meal' | 'sos';

export interface BillboardNote {
  _id: string;
  type: BillboardNoteType;
  title: string;
  message: string;
  createdAt: string;
  from: string | null;       // sender's name; null for BiG's own notes
  roles: string[];
  departments: string[];     // department names
  read: boolean;
}

export interface BillboardPage {
  notes: BillboardNote[];
  hasMore: boolean;
}

/**
 * Billboard (PWA, see PWA_CONTEXT.md): every announcement the signed-in user
 * received, and the unread count shown on the sidebar link. The count is
 * refreshed on sign-in, when a push arrives while the app is open, and when
 * the app comes back to the foreground.
 */
@Injectable({ providedIn: 'root' })
export class BillboardService implements OnDestroy {
  private url = environment.URL;
  readonly unread$ = new BehaviorSubject<number>(0);

  private userId = '';
  private subs = new Subscription();
  private onVisible = () => {
    if (document.visibilityState === 'visible') this.refreshUnread();
  };

  // SwPush is optional, as in PushService (absent in unit tests / without the service worker).
  constructor(private http: HttpClient, private auth: AuthService, @Optional() private swPush: SwPush | null) {
    this.subs.add(this.auth.user.subscribe(user => {
      const id = user?._id || '';
      if (id === this.userId) return;
      this.userId = id;
      this.unread$.next(0);
      if (id) this.refreshUnread();
    }));
    if (this.swPush) this.subs.add(this.swPush.messages.subscribe(() => this.refreshUnread()));
    document.addEventListener('visibilitychange', this.onVisible);
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    document.removeEventListener('visibilitychange', this.onVisible);
  }

  /** The newest 100 notes, or the 100 before `before` (a note id) for "Show older". */
  list(before?: string): Promise<BillboardPage> {
    const qs = before ? `?before=${encodeURIComponent(before)}` : '';
    return firstValueFrom(this.http.get<BillboardPage>(`${this.url}/billboard${qs}`));
  }

  async refreshUnread(): Promise<void> {
    if (!this.userId) return;
    const id = this.userId;
    try {
      const r = await firstValueFrom(this.http.get<{ unread: number }>(`${this.url}/billboard/unread-count`));
      if (this.userId === id) this.unread$.next(r.unread);
    } catch { /* keep the last known count */ }
  }

  async markRead(id: string): Promise<void> {
    const r = await firstValueFrom(this.http.post<{ unread: number }>(`${this.url}/billboard/${id}/read`, {}));
    this.unread$.next(r.unread);
  }

  async markAllRead(): Promise<void> {
    const r = await firstValueFrom(this.http.post<{ unread: number }>(`${this.url}/billboard/read-all`, {}));
    this.unread$.next(r.unread);
  }
}
