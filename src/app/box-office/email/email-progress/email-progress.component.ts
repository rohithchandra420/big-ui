import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { EmailBatchTrackerService, TrackedBatch } from '../../../core/email-batch-tracker.service';

const AUTO_DISMISS_MS = 8000;

/**
 * Floating progress card for background email batches (Email epic). Lives in
 * the app shell so it stays visible while staff move between pages.
 * Successful batches clear themselves after a few seconds; batches with
 * failures stay until dismissed, so nobody misses them.
 */
@Component({
  selector: 'app-email-progress',
  templateUrl: './email-progress.component.html',
  styleUrls: ['./email-progress.component.css']
})
export class EmailProgressComponent implements OnInit, OnDestroy {

  items: TrackedBatch[] = [];
  private sub?: Subscription;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(public tracker: EmailBatchTrackerService) { }

  ngOnInit() {
    this.sub = this.tracker.tracked$.subscribe(items => {
      this.items = items;
      items.forEach(t => {
        if (t.batch.finished && !t.batch.failed && !t.lost && !this.timers.has(t.batch.id)) {
          this.timers.set(t.batch.id, setTimeout(() => this.dismiss(t.batch.id), AUTO_DISMISS_MS));
        }
      });
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
    this.timers.forEach(t => clearTimeout(t));
  }

  trackById(_: number, t: TrackedBatch): string {
    return t.batch.id;
  }

  percent(t: TrackedBatch): number {
    return t.batch.total ? Math.round((t.batch.done / t.batch.total) * 100) : 100;
  }

  dismiss(id: string) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    this.tracker.dismiss(id);
  }
}
