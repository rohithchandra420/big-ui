import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { EmailBatchTrackerService, TrackedBatch } from './email-batch-tracker.service';
import { EmailService } from './email.service';
import { EmailBatch } from '../models/email.model';

const batch = (over: Partial<EmailBatch> = {}): EmailBatch => ({
  id: 'b1', type: 'ticket', total: 2, done: 0, sent: 0, failed: 0, skipped: 0,
  finished: false, startedAt: '', finishedAt: null, ...over
});

describe('EmailBatchTrackerService', () => {
  let tracker: EmailBatchTrackerService;
  let emailSpy: jasmine.SpyObj<EmailService>;

  beforeEach(() => {
    emailSpy = jasmine.createSpyObj('EmailService', ['getBatch']);
    TestBed.configureTestingModule({ providers: [{ provide: EmailService, useValue: emailSpy }] });
    tracker = TestBed.inject(EmailBatchTrackerService);
  });

  it('polls until the batch finishes, then announces it', fakeAsync(() => {
    const responses = [batch({ done: 1, sent: 1 }), batch({ done: 2, sent: 2, finished: true })];
    emailSpy.getBatch.and.callFake(() => of(responses.shift()!));
    let latest: TrackedBatch[] = [];
    const finished: EmailBatch[] = [];
    tracker.tracked$.subscribe(t => latest = t);
    tracker.finished$.subscribe(b => finished.push(b));

    tracker.track(batch(), 'Ticket emails');
    expect(latest[0].batch.done).toBe(0);

    tick(1500);
    expect(latest[0].batch.done).toBe(1);
    expect(finished.length).toBe(0);

    tick(1500);
    expect(latest[0].batch.finished).toBeTrue();
    expect(finished.length).toBe(1);

    tick(3000);
    expect(emailSpy.getBatch).toHaveBeenCalledTimes(2);
    discardPeriodicTasks();
  }));

  it('announces an already-finished batch straight away without polling', () => {
    const finished: EmailBatch[] = [];
    tracker.finished$.subscribe(b => finished.push(b));
    tracker.track(batch({ total: 0, finished: true }), 'x');
    expect(finished.length).toBe(1);
    expect(emailSpy.getBatch).not.toHaveBeenCalled();
  });

  it('marks a batch lost when progress can no longer be read', fakeAsync(() => {
    emailSpy.getBatch.and.returnValue(throwError(() => new Error('404')));
    let latest: TrackedBatch[] = [];
    tracker.tracked$.subscribe(t => latest = t);
    tracker.track(batch(), 'x');
    tick(1500);
    expect(latest[0].lost).toBeTrue();
    discardPeriodicTasks();
  }));

  it('dismisses a batch and stops polling it', fakeAsync(() => {
    emailSpy.getBatch.and.returnValue(of(batch()));
    let latest: TrackedBatch[] = [];
    tracker.tracked$.subscribe(t => latest = t);
    tracker.track(batch(), 'x');
    tracker.dismiss('b1');
    tick(3000);
    expect(latest.length).toBe(0);
    expect(emailSpy.getBatch).not.toHaveBeenCalled();
  }));
});
