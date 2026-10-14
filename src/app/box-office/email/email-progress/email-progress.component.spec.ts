import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { EmailProgressComponent } from './email-progress.component';
import { EmailBatchTrackerService, TrackedBatch } from '../../../core/email-batch-tracker.service';
import { EmailBatch } from '../../../models/email.model';

const batch = (over: Partial<EmailBatch> = {}): EmailBatch => ({
  id: 'b1', type: 'ticket', total: 4, done: 1, sent: 1, failed: 0, skipped: 0,
  finished: false, startedAt: '', finishedAt: null, ...over
});

describe('EmailProgressComponent', () => {
  let fixture: ComponentFixture<EmailProgressComponent>;
  let tracked$: BehaviorSubject<TrackedBatch[]>;
  let dismissSpy: jasmine.Spy;

  beforeEach(async () => {
    tracked$ = new BehaviorSubject<TrackedBatch[]>([]);
    dismissSpy = jasmine.createSpy('dismiss').and.callFake((id: string) =>
      tracked$.next(tracked$.value.filter(t => t.batch.id !== id)));
    await TestBed.configureTestingModule({
      declarations: [EmailProgressComponent],
      providers: [{ provide: EmailBatchTrackerService, useValue: { tracked$, dismiss: dismissSpy } }]
    }).compileComponents();
    fixture = TestBed.createComponent(EmailProgressComponent);
    fixture.detectChanges();
  });

  const text = () => fixture.nativeElement.textContent as string;

  it('shows nothing when no batch is running', () => {
    expect(fixture.nativeElement.querySelector('.ep-card')).toBeNull();
  });

  it('shows progress for a running batch', () => {
    tracked$.next([{ batch: batch(), label: 'Ticket emails · 4 bookings' }]);
    fixture.detectChanges();
    expect(text()).toContain('Ticket emails · 4 bookings');
    expect(text()).toContain('Sending… 1 / 4');
    expect(fixture.componentInstance.percent(tracked$.value[0])).toBe(25);
  });

  it('clears a successful batch by itself after a few seconds', fakeAsync(() => {
    tracked$.next([{ batch: batch({ done: 4, sent: 4, finished: true }), label: 'x' }]);
    fixture.detectChanges();
    expect(text()).toContain('Done: 4 sent');
    tick(8000);
    expect(dismissSpy).toHaveBeenCalledWith('b1');
  }));

  it('keeps a batch with failures until dismissed', fakeAsync(() => {
    tracked$.next([{ batch: batch({ done: 4, sent: 3, failed: 1, finished: true }), label: 'x' }]);
    fixture.detectChanges();
    expect(text()).toContain('1 failed');
    tick(20000);
    expect(dismissSpy).not.toHaveBeenCalled();
    fixture.nativeElement.querySelector('.ep-close').click();
    expect(dismissSpy).toHaveBeenCalledWith('b1');
  }));
});
