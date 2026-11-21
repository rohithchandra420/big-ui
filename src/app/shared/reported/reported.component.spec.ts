import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { DateTimeComponent } from '../date-time/date-time.component';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { ReportedComponent } from './reported.component';
import { ReportedService } from '../../core/reported.service';
import { ConfirmationService } from '../confirm-dialog/confirmation.service';
import { NotificationService } from '../../core/notification.service';

// Joining Time: Expected Join Time + Reported Time with Mark reported / Undo.
describe('ReportedComponent', () => {
  let fixture: ComponentFixture<ReportedComponent>;
  let c: ReportedComponent;
  let svc: jasmine.SpyObj<ReportedService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;

  beforeEach(async () => {
    svc = jasmine.createSpyObj('ReportedService', ['mark', 'undo', 'canSet']);
    svc.canSet.and.returnValue(true);
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    await TestBed.configureTestingModule({
      declarations: [DateTimeComponent, ReportedComponent],
      imports: [FormsModule],
      providers: [
        { provide: ReportedService, useValue: svc },
        { provide: ConfirmationService, useValue: confirm },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(ReportedComponent);
    c = fixture.componentInstance;
    Object.assign(c, { userId: 'u1', eventId: 'e1', name: 'Anil', role: 'VOL', home: 'd1', expectedAt: '2020-01-01T05:30:00Z', reportedAt: null });
    c.ngOnChanges();
    fixture.detectChanges();
  });

  const text = () => (fixture.nativeElement as HTMLElement).textContent || '';

  it('not reported, Expected Join Time passed: says so and offers Mark reported', () => {
    expect(c.state).toBe('late');
    expect(text()).toContain('Expected to join · not reported yet');
    expect(text()).toContain('Mark reported');
    expect(text()).not.toContain('Undo');
  });

  it('hides the buttons for someone who may not mark, or without an event', () => {
    svc.canSet.and.returnValue(false);
    c.ngOnChanges();
    fixture.detectChanges();
    expect(text()).not.toContain('Mark reported');
    svc.canSet.and.returnValue(true);
    c.eventId = '';
    c.ngOnChanges();
    fixture.detectChanges();
    expect(text()).not.toContain('Mark reported');
  });

  it('Mark reported: defaults to now, sends the time and tells the page', fakeAsync(() => {
    const changed = jasmine.createSpy('changed');
    c.changed.subscribe(changed);
    svc.mark.and.returnValue(Promise.resolve({ _id: 'u1', reportedAt: '2026-11-12T08:50:00.000Z', reportedBy: { _id: 'a', name: 'Asha' }, marked: 2 }));
    c.startEdit();
    expect(c.when).toBe(c.maxNow);
    c.save();
    flushMicrotasks();
    expect(svc.mark).toHaveBeenCalledWith('u1', 'e1', jasmine.any(String));
    expect(changed).toHaveBeenCalledWith({ reportedAt: '2026-11-12T08:50:00.000Z', reportedBy: { _id: 'a', name: 'Asha' } });
    expect(c.editing).toBeFalse();
  }));

  it('refuses a time in the future without calling the server', fakeAsync(() => {
    c.startEdit();
    c.when = '2999-01-01T10:00';
    c.save();
    flushMicrotasks();
    expect(svc.mark).not.toHaveBeenCalled();
  }));

  it('Undo asks first, then clears it', fakeAsync(() => {
    c.reportedAt = '2026-11-12T08:50:00.000Z';
    c.reportedBy = { _id: 'a', name: 'Asha' };
    c.ngOnChanges();
    fixture.detectChanges();
    expect(text()).toContain('Reported');
    expect(text()).toContain('by Asha');
    const changed = jasmine.createSpy('changed');
    c.changed.subscribe(changed);
    confirm.confirm.and.returnValue(of(true));
    svc.undo.and.returnValue(Promise.resolve({ _id: 'u1', reportedAt: null, reportedBy: null, removed: 2 }));
    c.undo();
    flushMicrotasks();
    expect(svc.undo).toHaveBeenCalledWith('u1', 'e1');
    expect(changed).toHaveBeenCalledWith({ reportedAt: null, reportedBy: null });
  }));
});
