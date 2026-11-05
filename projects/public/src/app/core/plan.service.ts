import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PublicSession } from './public-api.service';

// "My plan" (PH5): the sessions starred on this phone, kept on the phone only
// (localStorage). The 30-second refresh compares each starred session with
// what the person last saw, so a changed time / place / status is marked.

const STARRED = 'big-live:starred';
const SEEN = 'big-live:plan-seen';

export interface Seen { start: string; end: string; venue: string; state: string; }
export type Change = 'time' | 'place' | 'status';

@Injectable({ providedIn: 'root' })
export class PlanService {
  readonly starred$ = new BehaviorSubject<Set<string>>(read<string[]>(STARRED, []).reduce((s, id) => s.add(id), new Set<string>()));
  private seen: Record<string, Seen> = read(SEEN, {});

  has(id: string): boolean { return this.starred$.value.has(id); }
  get count(): number { return this.starred$.value.size; }
  get ids(): string[] { return [...this.starred$.value]; }

  /** Star / unstar; returns true when it is now starred. */
  toggle(s: PublicSession): boolean {
    const set = new Set(this.starred$.value);
    const on = !set.has(s.id);
    if (on) { set.add(s.id); this.seen[s.id] = snapshot(s); } else { set.delete(s.id); delete this.seen[s.id]; }
    write(STARRED, [...set]);
    write(SEEN, this.seen);
    this.starred$.next(set);
    return on;
  }

  /** What changed since the person last looked at this starred session. */
  changes(s: PublicSession): Change[] {
    const before = this.seen[s.id];
    if (!before || !this.has(s.id)) return [];
    const out: Change[] = [];
    if (before.start !== s.start || before.end !== s.end) out.push('time');
    if (before.venue !== s.venue) out.push('place');
    if (before.state !== s.state && (s.state === 'cancelled' || before.state === 'cancelled' || s.state === 'closed' || s.state === 'full')) out.push('status');
    return out;
  }

  /** The person has seen the current details (My plan was opened). */
  markSeen(sessions: PublicSession[]): void {
    for (const s of sessions) if (this.has(s.id)) this.seen[s.id] = snapshot(s);
    write(SEEN, this.seen);
  }
}

const snapshot = (s: PublicSession): Seen => ({ start: s.start, end: s.end, venue: s.venue, state: s.state });

function read<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage off */ }
}
