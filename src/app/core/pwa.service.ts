import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { BehaviorSubject, Subscription, filter, interval } from 'rxjs';

/** Chrome's install-prompt event (not in TypeScript's DOM types yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const IOS_HINT_DISMISSED_KEY = 'pwaIosHintDismissed';
export const INSTALL_DISMISSED_KEY = 'pwaInstallDismissed';
/** How often an open app asks whether a new version has been released. */
export const UPDATE_CHECK_MS = 30 * 60 * 1000;

/**
 * PWA Phase 1 — everything the installable app needs to tell staff:
 *  - online$: the device's connection (drives the "Offline" notice);
 *  - updateReady$: a new release has been downloaded in the background —
 *    reload() switches to it (otherwise the old version keeps running);
 *  - canInstall$ (Android/desktop Chrome): the browser offers installation —
 *    install() shows its prompt;
 *  - showIosHint$ (iPhone/iPad Safari): iOS has no install prompt, so a
 *    dismissible "Share → Add to Home Screen" hint is shown instead.
 * Nothing is shown once the app runs installed (standalone).
 * Created at start-up (AppModule), so the one-off install event isn't missed.
 */
@Injectable({ providedIn: 'root' })
export class PwaService implements OnDestroy {
  readonly online$ = new BehaviorSubject<boolean>(navigator.onLine);
  readonly updateReady$ = new BehaviorSubject<boolean>(false);
  readonly canInstall$ = new BehaviorSubject<boolean>(false);
  readonly showIosHint$ = new BehaviorSubject<boolean>(false);

  private installEvent: BeforeInstallPromptEvent | null = null;
  private subs = new Subscription();
  private readonly onOnline = () => this.zone.run(() => this.online$.next(true));
  private readonly onOffline = () => this.zone.run(() => this.online$.next(false));
  private readonly onBeforeInstall = (e: Event) => this.zone.run(() => {
    e.preventDefault();   // keep Chrome's own mini-bar away; we offer our own button
    this.installEvent = e as BeforeInstallPromptEvent;
    this.canInstall$.next(!this.isStandalone() && !this.readFlag(INSTALL_DISMISSED_KEY));
  });
  private readonly onInstalled = () => this.zone.run(() => {
    this.installEvent = null;
    this.canInstall$.next(false);
  });

  constructor(private swUpdate: SwUpdate, private zone: NgZone) {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    window.addEventListener('beforeinstallprompt', this.onBeforeInstall);
    window.addEventListener('appinstalled', this.onInstalled);

    this.showIosHint$.next(this.isIos() && !this.isStandalone() && !this.readFlag(IOS_HINT_DISMISSED_KEY));

    if (this.swUpdate.isEnabled) {
      this.subs.add(this.swUpdate.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
        .subscribe(() => this.updateReady$.next(true)));
      // The cached copy is broken beyond repair (e.g. files removed mid-update): load fresh.
      this.subs.add(this.swUpdate.unrecoverable.subscribe(() => this.hardReload()));
      // Long-open devices (gate phones) still hear about releases.
      this.subs.add(interval(UPDATE_CHECK_MS).subscribe(() => this.checkForUpdate()));
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    window.removeEventListener('beforeinstallprompt', this.onBeforeInstall);
    window.removeEventListener('appinstalled', this.onInstalled);
    this.subs.unsubscribe();
  }

  checkForUpdate(): void {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.checkForUpdate().catch(() => { /* offline — try again next time */ });
    }
  }

  /** Switch to the downloaded release. */
  async reload(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } finally {
      this.hardReload();
    }
  }

  async install(): Promise<void> {
    const event = this.installEvent;
    if (!event) return;
    this.installEvent = null;
    this.canInstall$.next(false);
    await event.prompt();
    await event.userChoice.catch(() => undefined);
  }

  dismissInstall(): void {
    this.writeFlag(INSTALL_DISMISSED_KEY);
    this.canInstall$.next(false);
  }

  dismissIosHint(): void {
    this.writeFlag(IOS_HINT_DISMISSED_KEY);
    this.showIosHint$.next(false);
  }

  /** Running as the installed app (home-screen icon), not in a browser tab. */
  isStandalone(): boolean {
    return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  }

  /** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
  isIos(): boolean {
    const ua = navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  /* Separate method so tests can replace it. */
  hardReload(): void {
    document.location.reload();
  }

  // Per-device "don't show again" — may be unavailable (private mode), so never throw.
  private readFlag(key: string): boolean {
    try { return localStorage.getItem(key) === '1'; } catch { return false; }
  }
  private writeFlag(key: string): void {
    try { localStorage.setItem(key, '1'); } catch { /* not remembered — shown again next time */ }
  }
}
