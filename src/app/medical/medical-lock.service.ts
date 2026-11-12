import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Medical Desk idle lock (MEDICAL_CONTEXT.md — option A, server-enforced).
 * The server refuses Medical requests (423) unless the password was entered
 * within the last `lockMinutes`; every Medical request renews it. Here:
 * - `locked$` true → the open Medical page is covered by the password box;
 * - no activity for `lockMinutes` → covered (and the server's unlock ends);
 * - activity while unlocked → a ping now and then keeps the server's unlock
 *   alive, so typing a long visit doesn't lock;
 * - a 423 from any call → covered; `waitForUnlock()` resolves after the password.
 */
@Injectable({ providedIn: 'root' })
export class MedicalLockService implements OnDestroy {
  private url = environment.URL + '/medical';
  readonly locked$ = new BehaviorSubject<boolean>(true);
  lockMinutes = 15;

  private lastActivity = Date.now();
  private lastServer = 0;
  private waiters: (() => void)[] = [];
  private timer: any = null;
  private active = 0;
  private readonly onActivity = () => this.activity();

  constructor(private http: HttpClient, private zone: NgZone) {}

  get locked(): boolean { return this.locked$.value; }

  /** A Medical page opened: start watching for idle. Pair with `leave()`. */
  enter(): void {
    if (this.active++ > 0) return;
    this.lastActivity = Date.now();
    this.zone.runOutsideAngular(() => {
      for (const e of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
        window.addEventListener(e, this.onActivity, { passive: true, capture: true });
      }
      this.timer = setInterval(() => this.tick(), 15000);
    });
  }

  leave(): void {
    if (--this.active > 0) return;
    this.active = 0;
    for (const e of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
      window.removeEventListener(e, this.onActivity, { capture: true } as any);
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  ngOnDestroy(): void { this.leave(); }

  /** A Medical request succeeded: the server renewed the unlock. */
  touched(): void {
    this.lastServer = Date.now();
    if (this.locked) this.zone.run(() => this.locked$.next(false));
  }

  /** The server said 423, or the app knows it's locked. */
  lock(): void {
    if (!this.locked) this.zone.run(() => this.locked$.next(true));
  }

  /** Resolves once the password is entered (immediately when unlocked). */
  waitForUnlock(): Promise<void> {
    if (!this.locked) return Promise.resolve();
    return new Promise(resolve => this.waiters.push(resolve));
  }

  async unlock(password: string): Promise<void> {
    const res = await firstValueFrom(this.http.post<{ lockMinutes: number }>(this.url + '/unlock', { password }));
    this.lockMinutes = res.lockMinutes || this.lockMinutes;
    this.lastActivity = Date.now();
    this.lastServer = Date.now();
    this.locked$.next(false);
    const waiting = this.waiters;
    this.waiters = [];
    waiting.forEach(w => w());
  }

  /** Lock now (button), and end the server's unlock too. */
  async lockNow(): Promise<void> {
    this.lock();
    try { await firstValueFrom(this.http.post(this.url + '/lock', {})); } catch { /* locks itself anyway */ }
  }

  private activity(): void {
    this.lastActivity = Date.now();
    // Busy on the page without other requests: keep the server's unlock alive.
    if (!this.locked && Date.now() - this.lastServer > 5 * 60 * 1000) {
      this.lastServer = Date.now();
      firstValueFrom(this.http.post(this.url + '/ping', {})).catch(err => { if (err?.status === 423) this.lock(); });
    }
  }

  private tick(): void {
    if (!this.locked && Date.now() - this.lastActivity >= this.lockMinutes * 60 * 1000) this.lockNow();
  }
}
