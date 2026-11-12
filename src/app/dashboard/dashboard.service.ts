import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment.development';

// Festival Dashboard (big-ui 1.46.0). One call per view; the server builds
// every section in parallel.

export interface Attention { kind: string; level: 'bad' | 'warn' | 'info'; count: number; text: string; link: string; }
export interface NamedCount { name: string; count: number; }
export interface BedRow { name: string; beds: number; used: number; }
export interface MealRow { meal: string; label: string; start: string; status: 'upcoming' | 'open' | 'closed'; expected: number; served: number; prepared: number | null; notMarked: number; }
export interface SessionRow { _id: string; title: string; venue: string; colour: string; start: string; end: string; attended: number; capacity: number | null; }

export interface DashboardOverview {
  event: { _id: string; name: string; startDate?: string; endDate?: string };
  today: string;
  day: { index: number | null; total: number | null };
  updatedAt: string;
  attention: Attention[];
  tiles: {
    bookings: number; spot: number; passes: number; festivalPasses: number; tentPasses: number; admitted: number;
    staff: number; staffMarkedToday: number; mealsServedToday: number; mealsExpectedToday: number;
    workshopVisitsToday: number; sessionsToday: number; sosOpen: number; sosHandled: number;
    /** Only in a Director's reply. */
    revenue?: { total: number; today: number };
  };
  gate: { perHour: { hour: number; count: number }[]; admitted: number; notAdmitted: number; byType: { name: string; category: string; count: number; admitted: number }[] };
  accommodation: { tents: BedRow[]; beds: { byType: BedRow[]; inBed: number; movedIn: number; staffWithoutBed: number } };
  people: { byDept: NamedCount[]; heat: { date: string; morning: number; afternoon: number; night: number }[] };
  meals: { plan: boolean; today: MealRow[]; leftover: { date: string; leftoverPct: number | null }[]; goalPct: number | null };
  workshops: { today: SessionRow[]; byCategory: { name: string; colour: string; visits: number }[] };
  comms: {
    email: { sent: number; notSent: number; sending: number; failed: number; bounced: number; noEmail: number };
    sos: { open: number; handled: number; avgMinutes: number | null; recent: { message: string; status: 'open' | 'handled'; at: string }[] };
    announcements: { title: string; type: string; public: boolean; at: string }[];
    reached: number;
  };
  /** Medical Desk (counts only, never names). Missing on an older API. */
  medical?: { visitsToday: number; seriousToday: number; hospitalToday: number; restingNow: number };
}

export interface DashboardMine {
  name: string; role: string; department: string | null; isTeamLead: boolean;
  team: { size: number; slots: { morning: number; afternoon: number; night: number } };
  nextMeal: { label: string; start: string; open: boolean } | null;
  billboard: { _id: string; title: string; type: string; at: string; read: boolean }[];
  bed: { unit: string; type: string; movedIn: boolean } | null;
}

@Injectable()
export class DashboardService {
  private url = environment.URL;

  constructor(private http: HttpClient) {}

  overview(eventId: string) {
    return this.http.get<DashboardOverview>(`${this.url}/dashboard/overview`, { params: { event: eventId } });
  }

  mine(eventId: string) {
    return this.http.get<DashboardMine>(`${this.url}/dashboard/me`, { params: { event: eventId } });
  }
}
