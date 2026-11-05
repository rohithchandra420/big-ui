import { Injectable, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { Subject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { PlanService } from './plan.service';

/**
 * Festival alerts on this phone (PH5): an anonymous push subscription plus
 * the starred sessions, so staff can alert "everyone" or "phones that
 * starred this session" from Announcements. No account, no name.
 *   unsupported — this browser can't (or the page isn't running from its service worker)
 *   ios-install — iPhone / iPad: works only from the installed app (Add to Home Screen)
 *   server-off  — the server has no alert keys
 *   blocked     — the person refused permission (only browser settings undo it)
 *   off / on
 */
export type AlertState = 'unsupported' | 'ios-install' | 'server-off' | 'blocked' | 'off' | 'on';

const DISMISSED = 'big-live:alerts-dismissed';
const OFFERED = 'big-live:alerts-offered';

@Injectable({ providedIn: 'root' })
export class AlertsService {
  state: AlertState = 'unsupported';
  busy = false;
  /** Fires once, after the first star, to offer alerts. */
  readonly offer$ = new Subject<void>();
  private endpoint: string | null = null;

  constructor(private http: HttpClient, private plan: PlanService, @Optional() private swPush: SwPush | null) {
    // Keep the server's starred list in step with the phone's.
    this.plan.starred$.subscribe(() => this.syncStarred());
  }

  /** Works out the state; call once on start. */
  async init(): Promise<void> {
    if (!this.swPush?.isEnabled || typeof Notification === 'undefined') {
      this.state = isIosBrowser() ? 'ios-install' : 'unsupported';
      return;
    }
    if (Notification.permission === 'denied') { this.state = 'blocked'; return; }
    try {
      const sub = await firstValueFrom(this.swPush.subscription);
      this.endpoint = sub?.endpoint || null;
      this.state = sub ? 'on' : 'off';
    } catch { this.state = 'off'; }
  }

  async turnOn(): Promise<boolean> {
    if (!this.swPush?.isEnabled || this.busy) return false;
    this.busy = true;
    try {
      const cfg = await firstValueFrom(this.http.get<{ enabled: boolean; publicKey: string | null }>(`${environment.URL}/public/push/config`, { withCredentials: false }));
      if (!cfg.enabled || !cfg.publicKey) { this.state = 'server-off'; return false; }
      const sub = await this.swPush.requestSubscription({ serverPublicKey: cfg.publicKey });
      const json = sub.toJSON();
      await firstValueFrom(this.http.post(`${environment.URL}/public/push/subscribe`,
        { subscription: { endpoint: json.endpoint, keys: json.keys }, starred: this.plan.ids }, { withCredentials: false }));
      this.endpoint = json.endpoint || null;
      this.state = 'on';
      return true;
    } catch {
      this.state = typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'blocked' : 'off';
      return false;
    } finally {
      this.busy = false;
    }
  }

  async turnOff(): Promise<void> {
    const endpoint = this.endpoint;
    try { await this.swPush?.unsubscribe(); } catch { /* already gone */ }
    if (endpoint) {
      try { await firstValueFrom(this.http.post(`${environment.URL}/public/push/unsubscribe`, { endpoint }, { withCredentials: false })); } catch { /* deleted after the event anyway */ }
    }
    this.endpoint = null;
    this.state = 'off';
  }

  /** The Home card: shown while alerts could be turned on and it wasn't closed. */
  get showCard(): boolean { return this.state === 'off' && !flag(DISMISSED); }
  dismissCard(): void { setFlag(DISMISSED); }

  /** Offer alerts once, right after the first star. */
  shouldOfferAfterStar(): boolean {
    if (this.state !== 'off' || flag(OFFERED)) return false;
    setFlag(OFFERED);
    return true;
  }

  private syncStarred(): void {
    if (this.state !== 'on' || !this.endpoint) return;
    this.http.put(`${environment.URL}/public/push/starred`, { endpoint: this.endpoint, starred: this.plan.ids }, { withCredentials: false })
      .subscribe({ error: () => { /* best effort */ } });
  }
}

const isIosBrowser = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
function flag(key: string): boolean { try { return localStorage.getItem(key) === '1'; } catch { return false; } }
function setFlag(key: string): void { try { localStorage.setItem(key, '1'); } catch { /* storage off */ } }
