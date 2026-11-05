import { Injectable, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface NotificationPrefs {
  emailBatch: boolean;
  announcements: boolean;
  meals: boolean;
}

export interface PushConfig {
  enabled: boolean;
  publicKey: string | null;
  preferences: NotificationPrefs;
  canAnnounce: boolean;
}

export type AnnouncementType = 'general' | 'urgent' | 'schedule' | 'weather' | 'reminder' | 'task';

export interface AnnouncementInput {
  type: AnnouncementType;
  title: string;
  message: string;
  roles: string[];
  departments: string[];   // department ids (home department)
  /** Also show it on the public festival page (PH3). */
  public?: boolean;
  /** PH5: also alert participants' phones. */
  publicAlert?: 'none' | 'all' | 'session';
  publicSession?: string | null;
  /** Staff list (R2): only this event's staff (DEV/DIR/ADMIN always kept); null = BiG-wide. */
  staffEvent?: string | null;
}

export interface Announcement {
  _id: string;
  type: AnnouncementType;
  title: string;
  message: string;
  roles: string[];
  departments: { _id: string; name: string }[];
  resentFrom?: string | null;
  sentBy?: { _id: string; name: string } | null;
  recipients: number;
  devices: number;
  delivered: number;
  createdAt: string;
  /** On the public festival page (PH3) — and when / by whom it was taken down. */
  public?: boolean;
  publicEvent?: { _id: string; name: string } | null;
  staffEvent?: { _id: string; name: string } | null;
  publicRemovedAt?: string | null;
  publicRemovedBy?: { _id: string; name: string } | null;
  publicAlert?: 'none' | 'all' | 'session';
  publicSession?: { _id: string; workshop?: { title: string } } | null;
  publicDelivered?: number;
}

/**
 * Where this device stands:
 *  unsupported      — the browser can't do push (or the app isn't running from the service worker)
 *  ios-needs-install — iPhone/iPad in Safari: notifications only work in the installed app
 *  server-off       — the server has no notification keys yet
 *  blocked          — the user (or browser) denied permission; only browser settings can undo it
 *  off / on         — notifications off / on for this device
 */
export type PushDeviceState = 'unsupported' | 'ios-needs-install' | 'server-off' | 'blocked' | 'off' | 'on';

export const PUSH_PROMPT_DISMISSED_KEY = 'pushPromptDismissed';

/** PWA Phase 2 — push notifications on this device, plus announcements (DEV/DIR/ADMIN). */
@Injectable({ providedIn: 'root' })
export class PushService {
  private url = environment.URL;

  readonly state$ = new BehaviorSubject<PushDeviceState>('off');
  readonly config$ = new BehaviorSubject<PushConfig | null>(null);
  private endpoint: string | null = null;

  // SwPush is optional: it only exists where the service worker module is
  // loaded (the real app), not in unit tests of services that depend on this one.
  constructor(private http: HttpClient, @Optional() private swPush: SwPush | null) {
    this.refreshState();
    this.swPush?.subscription.subscribe(sub => {
      this.endpoint = sub?.endpoint ?? null;
      this.refreshState();
    });
  }

  /** This device currently has notifications on. */
  get hasDeviceSubscription(): boolean {
    return !!this.endpoint;
  }

  /** Loads the server's settings for the signed-in user (call after sign-in / on the Profile page). */
  async load(): Promise<PushConfig | null> {
    try {
      const cfg = await firstValueFrom(this.http.get<PushConfig>(this.url + '/push/config'));
      this.config$.next(cfg);
    } catch {
      this.config$.next(null);
    }
    this.refreshState();
    return this.config$.value;
  }

  /** Must run from a tap (browsers — iPhone especially — only ask for permission then). */
  async enable(): Promise<PushDeviceState> {
    const cfg = this.config$.value ?? await this.load();
    if (!cfg?.enabled || !cfg.publicKey || !this.swPush?.isEnabled) {
      this.refreshState();
      return this.state$.value;
    }
    try {
      const sub = await this.swPush.requestSubscription({ serverPublicKey: cfg.publicKey });
      const json = sub.toJSON();
      await firstValueFrom(this.http.post(this.url + '/push/subscribe', { endpoint: json.endpoint, keys: json.keys }));
      this.endpoint = sub.endpoint;
    } catch {
      /* permission denied or dismissed — refreshState() shows which */
    }
    this.refreshState();
    return this.state$.value;
  }

  async disable(): Promise<void> {
    const endpoint = this.endpoint;
    try {
      if (endpoint) await firstValueFrom(this.http.post(this.url + '/push/unsubscribe', { endpoint }));
    } catch { /* still unsubscribe locally */ }
    try { await this.swPush?.unsubscribe(); } catch { /* wasn't subscribed */ }
    this.endpoint = null;
    this.refreshState();
  }

  /**
   * On logout: stop notifications for this device while the session is still
   * valid, so the server forgets it. Never blocks logout for long.
   */
  async cleanupOnLogout(): Promise<void> {
    if (!this.endpoint) return;
    await Promise.race([this.disable(), new Promise(r => setTimeout(r, 3000))]);
  }

  async setPreference(key: keyof NotificationPrefs, value: boolean): Promise<NotificationPrefs> {
    const res = await firstValueFrom(this.http.patch<{ preferences: NotificationPrefs }>(this.url + '/push/preferences', { [key]: value }));
    const cfg = this.config$.value;
    if (cfg) this.config$.next({ ...cfg, preferences: res.preferences });
    return res.preferences;
  }

  sendTest() {
    return firstValueFrom(this.http.post<{ devices: number; delivered: number }>(this.url + '/push/test', {}));
  }

  sendAnnouncement(body: AnnouncementInput) {
    return firstValueFrom(this.http.post<Announcement>(this.url + '/push/announcements', body));
  }

  /** PH5: the public event's sessions (from the public API), for "phones that starred a session". */
  async publicSessions(): Promise<{ id: string; title: string; start: string; venue: string }[]> {
    const r = await firstValueFrom(this.http.get<any>(this.url + '/public/sessions', { withCredentials: false }));
    return r?.off ? [] : (r.sessions || []).filter((s: any) => s.state !== 'cancelled' && s.state !== 'ended');
  }

  /** "Remove from public page": takes a public post off the public page at once. */
  unpublishAnnouncement(id: string) {
    return firstValueFrom(this.http.post<Announcement>(this.url + `/push/announcements/${id}/unpublish`, {}));
  }

  /** "Send again": same content and audience, as a new announcement. */
  resendAnnouncement(id: string) {
    return firstValueFrom(this.http.post<Announcement>(this.url + `/push/announcements/${id}/resend`, {}));
  }

  listAnnouncements() {
    return firstValueFrom(this.http.get<Announcement[]>(this.url + '/push/announcements'));
  }

  /** The one-time "Turn on notifications" prompt (per device). */
  promptDismissed(): boolean {
    try { return localStorage.getItem(PUSH_PROMPT_DISMISSED_KEY) === '1'; } catch { return false; }
  }
  dismissPrompt(): void {
    try { localStorage.setItem(PUSH_PROMPT_DISMISSED_KEY, '1'); } catch { /* shown again next time */ }
  }

  private refreshState(): void {
    this.state$.next(this.computeState());
  }

  private computeState(): PushDeviceState {
    const supported = typeof window !== 'undefined' && 'Notification' in window && 'PushManager' in window && !!this.swPush?.isEnabled;
    if (!supported) return this.isIos() && !this.isStandalone() ? 'ios-needs-install' : 'unsupported';
    if (this.config$.value && !this.config$.value.enabled) return 'server-off';
    if (Notification.permission === 'denied') return 'blocked';
    return this.endpoint ? 'on' : 'off';
  }

  // Same checks as PwaService — kept local to avoid a dependency between the two.
  private isIos(): boolean {
    const ua = navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  private isStandalone(): boolean {
    return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  }
}
