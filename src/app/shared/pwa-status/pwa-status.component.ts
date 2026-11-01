import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject, Subscription, combineLatest, map } from 'rxjs';
import { PwaService } from '../../core/pwa.service';
import { PushService } from '../../core/push.service';
import { AuthService } from '../../core/auth.service';

/**
 * PWA notices, on every page: Offline, "New version available", Install
 * (Android/desktop Chrome), the iPhone "Add to Home Screen" hint, and (Phase 2)
 * a one-time "Turn on notifications" prompt for signed-in users.
 * Desktop: stacked bottom-left (the email progress card owns bottom-right).
 * Phone: at the top, under the menu bar when there is one.
 */
@Component({
  selector: 'app-pwa-status',
  templateUrl: './pwa-status.component.html',
  styleUrls: ['./pwa-status.component.css']
})
export class PwaStatusComponent implements OnInit, OnDestroy {
  /** True when the sticky mobile menu bar is showing, so phone notices sit below it. */
  @Input() belowTopbar = false;

  private signedIn$ = new BehaviorSubject<boolean>(false);
  private dismissed$ = new BehaviorSubject<boolean>(false);
  private subs = new Subscription();
  pushBusy = false;

  /** Signed in, push possible on this device but off, server ready, and not dismissed before. */
  readonly showPushPrompt$ = combineLatest([this.signedIn$, this.push.state$, this.push.config$, this.dismissed$]).pipe(
    map(([signedIn, state, config, dismissed]) => signedIn && state === 'off' && !!config?.enabled && !dismissed)
  );

  constructor(public pwa: PwaService, public push: PushService, private auth: AuthService) { }

  ngOnInit(): void {
    this.dismissed$.next(this.push.promptDismissed());
    this.subs.add(this.auth.user.subscribe(user => {
      const signedIn = !!user;
      if (signedIn && !this.signedIn$.value) this.push.load();
      this.signedIn$.next(signedIn);
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  async turnOnPush(): Promise<void> {
    this.pushBusy = true;
    try {
      await this.push.enable();
    } finally {
      // Asked once — whatever they chose, it's in My Profile from now on.
      this.dismissPushPrompt();
      this.pushBusy = false;
    }
  }

  dismissPushPrompt(): void {
    this.push.dismissPrompt();
    this.dismissed$.next(true);
  }
}
