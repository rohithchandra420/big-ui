import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { LocationPromptComponent } from './location-prompt.component';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { VolunteersService } from '../volunteers.service';

describe('LocationPromptComponent', () => {
  let fixture: ComponentFixture<LocationPromptComponent>;
  let component: LocationPromptComponent;
  let service: jasmine.SpyObj<VolunteersService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let user: BehaviorSubject<any>;
  const el = () => fixture.nativeElement as HTMLElement;
  const open = [{ _id: 'r1', askedBy: 'Lead One', event: 'BiG 7.0', askedAt: '2026-11-14T08:00:00.000Z', expiresAt: '2026-11-14T10:00:00.000Z' }];

  beforeEach(async () => {
    user = new BehaviorSubject<any>({ _id: 'u1' });
    service = jasmine.createSpyObj('VolunteersService', ['myLocationRequests', 'answerLocation', 'declineLocation']);
    service.myLocationRequests.and.returnValue(Promise.resolve(open));
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    await TestBed.configureTestingModule({
      declarations: [LocationPromptComponent],
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: NotificationService, useValue: notify },
        { provide: VolunteersService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(LocationPromptComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };

  it('shows the open request and sends the position only after Share', fakeAsync(() => {
    start();
    expect(el().querySelector('.lp')!.textContent).toContain('Lead One asked where you are');
    expect(service.answerLocation).not.toHaveBeenCalled();

    spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((ok: PositionCallback) =>
      ok({ coords: { latitude: 20.98, longitude: 79.35 } } as GeolocationPosition));
    service.answerLocation.and.returnValue(Promise.resolve({ ok: true }));
    service.myLocationRequests.and.returnValue(Promise.resolve([]));
    component.share();
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.answerLocation).toHaveBeenCalledWith('r1', 20.98, 79.35);
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Location shared');
    expect(el().querySelector('.lp')).toBeNull();
  }));

  it('explains a blocked location and sends nothing', fakeAsync(() => {
    start();
    spyOn(navigator.geolocation, 'getCurrentPosition').and.callFake((_ok: PositionCallback, fail?: PositionErrorCallback | null) =>
      fail!({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
    component.share();
    fixture.detectChanges();
    expect(el().querySelector('.lp-err')!.textContent).toContain('blocked');
    expect(service.answerLocation).not.toHaveBeenCalled();
  }));

  it('Decline closes the request; nothing shows when signed out', fakeAsync(() => {
    start();
    service.declineLocation.and.returnValue(Promise.resolve({ ok: true }));
    service.myLocationRequests.and.returnValue(Promise.resolve([]));
    component.decline();
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.declineLocation).toHaveBeenCalledWith('r1');
    expect(el().querySelector('.lp')).toBeNull();

    service.myLocationRequests.calls.reset();
    user.next(null);
    flushMicrotasks();
    expect(service.myLocationRequests).not.toHaveBeenCalled();
  }));
});
