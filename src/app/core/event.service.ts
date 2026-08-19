import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { BehaviorSubject } from "rxjs";
import { environment } from "src/environments/environment.development";
import { EventItem, EventDetail, PassType, PassTypeCategory } from "../models/event.model";
import { AuthService } from "./auth.service";

const ACTIVE_EVENT_KEY = 'activeEventId';

// Mirrors AuthService's BehaviorSubject pattern. GET /admin/events is
// already role-filtered server-side (decision #8 in
// INTRODUCING_EVENTS_CONTEXT.md) — DEV/DIR/ADMIN get every event
// regardless of status, TL/VOL only get 'active' ones — so this service
// doesn't need its own role check, it just renders whatever comes back.
//
// Reacts to AuthService.currentUser$ rather than requiring call sites to
// remember to invoke loadEvents() themselves — covers autoLogin() (page
// refresh), a fresh login, logout, AND handleSessionExpired() all from one
// subscription instead of three-plus separate call sites.
@Injectable({ providedIn: 'root' })
export class EventService {

  url = environment.URL;

  // The full list of events visible to the current user (role-filtered by
  // the backend already).
  events = new BehaviorSubject<EventItem[]>([]);

  // Which one is "currently being worked in" — drives Box Office,
  // Dashboard, Bookings, Ticket Registry.
  activeEvent = new BehaviorSubject<EventItem | null>(null);

  // Guards against a startup race: currentUser$ is a BehaviorSubject seeded
  // with null, so subscribing here always replays that initial null first —
  // typically before AppComponent.ngOnInit() has even called autoLogin() to
  // restore the session (child component constructors, which is what gets
  // this service injected and constructed, run before the parent's ngOnInit
  // in Angular's lifecycle). Without this flag, that spurious startup null
  // was read as "logged out" on every single page refresh, wiping the
  // persisted active-event id moments before autoLogin() restored the real
  // user. Only treat null as a real logout once we've actually seen a user.
  private sawUser = false;

  constructor(private http: HttpClient, private authService: AuthService) {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.sawUser = true;
        this.loadEvents();
      } else if (this.sawUser) {
        this.clearActiveEvent();
      }
    });
  }

  get currentEvents(): EventItem[] { return this.events.value; }
  get currentActiveEvent(): EventItem | null { return this.activeEvent.value; }

  // Fetches the visible event list and (re)resolves the active event —
  // call on app init / login, same spot AuthService.autoLogin() is called.
  // Falls back gracefully if the previously-stored active event is no
  // longer visible (e.g. it was archived, or the user's role no longer
  // sees it) — picks the first available event instead of holding onto a
  // dead reference, and clears the stored id if there's nothing to fall
  // back to.
  loadEvents() {
    this.http.get<EventItem[]>(this.url + '/admin/events').subscribe({
      next: (events) => {
        this.events.next(events);

        const storedId = localStorage.getItem(ACTIVE_EVENT_KEY);
        const stored = storedId && events.find(e => e._id === storedId);

        if (stored) {
          this.activeEvent.next(stored);
        } else if (events.length) {
          this.setActiveEvent(events[0]);
        } else {
          localStorage.removeItem(ACTIVE_EVENT_KEY);
          this.activeEvent.next(null);
        }
      },
      error: () => {} // non-critical on most pages — fail silently rather than alarm the user
    });
  }

  setActiveEvent(event: EventItem) {
    localStorage.setItem(ACTIVE_EVENT_KEY, event._id);
    this.activeEvent.next(event);
  }

  clearActiveEvent() {
    localStorage.removeItem(ACTIVE_EVENT_KEY);
    this.activeEvent.next(null);
    this.events.next([]);
  }

  getEventDetail(id: string) {
    return this.http.get<EventDetail>(this.url + '/admin/events/' + id);
  }

  createEvent(data: { name: string; description?: string; startDate?: string; endDate?: string }) {
    return this.http.post<EventItem>(this.url + '/admin/events', data);
  }

  updateEvent(id: string, data: Partial<{ name: string; description: string; startDate: string; endDate: string; status: string }>) {
    return this.http.patch<EventItem>(this.url + '/admin/events/' + id, data);
  }

  deleteEvent(id: string) {
    return this.http.delete<{ message: string; count?: number }>(this.url + '/admin/events/' + id);
  }

  createPassType(eventId: string, data: { name: string; category: PassTypeCategory }) {
    return this.http.post<PassType>(this.url + '/admin/events/' + eventId + '/pass-types', data);
  }

  updatePassType(eventId: string, passTypeId: string, data: Partial<{ name: string; category: PassTypeCategory }>) {
    return this.http.patch<PassType>(this.url + '/admin/events/' + eventId + '/pass-types/' + passTypeId, data);
  }

  deletePassType(eventId: string, passTypeId: string) {
    return this.http.delete<{ message: string; count?: number }>(this.url + '/admin/events/' + eventId + '/pass-types/' + passTypeId);
  }
}
