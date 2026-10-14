import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject, Subscription, timer } from 'rxjs';
import { switchMap, takeWhile } from 'rxjs/operators';

import { EmailBatch } from '../models/email.model';
import { EmailService } from './email.service';

export interface TrackedBatch {
  batch: EmailBatch;
  label: string;
  /** Polling stopped working (e.g. server restarted); last known numbers shown. */
  lost?: boolean;
}

/**
 * Follows background email batches app-wide (Email epic) so staff can keep
 * working — the floating <app-email-progress> card reads `tracked$`, and
 * pages like Bookings refresh when `finished$` fires.
 */
@Injectable({ providedIn: 'root' })
export class EmailBatchTrackerService implements OnDestroy {

  private readonly pollMs = 1500;
  private trackedSubject = new BehaviorSubject<TrackedBatch[]>([]);
  readonly tracked$ = this.trackedSubject.asObservable();

  private finishedSubject = new Subject<EmailBatch>();
  /** Emits once per batch when it finishes. */
  readonly finished$ = this.finishedSubject.asObservable();

  private polls = new Map<string, Subscription>();

  constructor(private emailService: EmailService) { }

  /** Start following a batch returned by a send call. */
  track(batch: EmailBatch, label: string) {
    this.upsert({ batch, label });
    if (batch.finished) {
      this.finishedSubject.next(batch);
      return;
    }
    const sub = timer(this.pollMs, this.pollMs).pipe(
      switchMap(() => this.emailService.getBatch(batch.id)),
      takeWhile(b => !b.finished, true)
    ).subscribe({
      next: b => {
        this.upsert({ batch: b, label });
        if (b.finished) {
          this.polls.delete(b.id);
          this.finishedSubject.next(b);
        }
      },
      error: () => {
        this.polls.delete(batch.id);
        const current = this.trackedSubject.value.find(t => t.batch.id === batch.id);
        this.upsert({ batch: current?.batch || batch, label, lost: true });
        this.finishedSubject.next(current?.batch || batch);
      }
    });
    this.polls.set(batch.id, sub);
  }

  dismiss(id: string) {
    this.polls.get(id)?.unsubscribe();
    this.polls.delete(id);
    this.trackedSubject.next(this.trackedSubject.value.filter(t => t.batch.id !== id));
  }

  private upsert(entry: TrackedBatch) {
    const list = this.trackedSubject.value.filter(t => t.batch.id !== entry.batch.id);
    this.trackedSubject.next([...list, entry]);
  }

  ngOnDestroy() {
    this.polls.forEach(s => s.unsubscribe());
  }
}
