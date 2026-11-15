import { Component, HostListener, OnDestroy, OnInit, Optional } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { VolunteersService } from '../volunteers.service';
import { MyLocationRequest } from '../volunteers.model';

/**
 * Shown on every page while the signed-in person has an open "where are you?"
 * request (Volunteers V3). They opted in on their profile; nothing is sent
 * until they press Share here — the phone is asked for its position once and
 * only latitude + longitude go to the server. Decline closes the request.
 * Checked on sign-in, when BiG comes back to the front, and when a
 * notification arrives.
 */
@Component({
  selector: 'app-location-prompt',
  templateUrl: './location-prompt.component.html',
  styleUrls: ['./location-prompt.component.css']
})
export class LocationPromptComponent implements OnInit, OnDestroy {
  request: MyLocationRequest | null = null;
  busy = false;
  error = '';
  private userId = '';
  private sub = new Subscription();

  constructor(
    private auth: AuthService,
    private volunteers: VolunteersService,
    private notify: NotificationService,
    // Optional, as in PushService: absent in unit tests / without the service worker
    @Optional() private swPush: SwPush | null
  ) {}

  ngOnInit() {
    this.sub.add(this.auth.user.subscribe(u => {
      const id = u?._id || '';
      if (id === this.userId) return;
      this.userId = id;
      this.request = null;
      this.check();
    }));
    if (this.swPush) this.sub.add(this.swPush.messages.subscribe(() => this.check()));
  }

  ngOnDestroy() { this.sub.unsubscribe(); }

  @HostListener('document:visibilitychange')
  onVisible() {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') this.check();
  }

  async check() {
    const id = this.userId;
    if (!id) return;
    try {
      const open = await this.volunteers.myLocationRequests();
      if (id === this.userId) this.request = open[0] || null;
    } catch {
      /* offline or signed out: nothing to show */
    }
  }

  share() {
    const r = this.request;
    if (!r || this.busy) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) { this.error = 'This device cannot give its location.'; return; }
    this.busy = true;
    this.error = '';
    navigator.geolocation.getCurrentPosition(
      pos => this.send(r, pos.coords.latitude, pos.coords.longitude),
      err => {
        this.busy = false;
        this.error = err.code === err.PERMISSION_DENIED
          ? 'Location is blocked for BiG on this device. Allow it in the browser or phone settings, then try again.'
          : 'Could not find your location. Check that location is on, then try again.';
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  private async send(r: MyLocationRequest, lat: number, lng: number) {
    try {
      await this.volunteers.answerLocation(r._id, lat, lng);
      this.notify.openSucessSnackBar('Location shared');
      this.request = null;
      this.check();
    } catch (err: any) {
      this.error = err?.error?.message || 'Could not send your location.';
    } finally {
      this.busy = false;
    }
  }

  async decline() {
    const r = this.request;
    if (!r || this.busy) return;
    this.busy = true;
    try {
      await this.volunteers.declineLocation(r._id);
    } catch {
      /* already closed */
    } finally {
      this.busy = false;
      this.request = null;
      this.check();
    }
  }
}
