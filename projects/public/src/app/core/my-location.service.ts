import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface MyLocation { at: [number, number]; accuracy: number; }

/**
 * Where this phone is (PH4a) — only after the person taps something that
 * needs it (the browser asks permission). Stays on the phone: the public page
 * never sends it to our server (SOS to staff is PH4b).
 */
@Injectable({ providedIn: 'root' })
export class MyLocationService {
  readonly location$ = new BehaviorSubject<MyLocation | null>(null);
  /** 'denied' / 'unavailable' after a failed try. */
  problem: 'denied' | 'unavailable' | null = null;

  constructor(private zone: NgZone) {}

  get current(): MyLocation | null { return this.location$.value; }

  /** Asks for the location once; resolves null when refused or impossible. */
  request(): Promise<MyLocation | null> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.problem = 'unavailable';
      return Promise.resolve(null);
    }
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => this.zone.run(() => {
          const loc: MyLocation = { at: [pos.coords.latitude, pos.coords.longitude], accuracy: Math.round(pos.coords.accuracy) };
          this.problem = null;
          this.location$.next(loc);
          resolve(loc);
        }),
        err => this.zone.run(() => {
          this.problem = err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable';
          resolve(null);
        }),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    });
  }
}
