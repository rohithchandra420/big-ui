import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { PublicApiService, deviceId } from './public-api.service';
import { MyLocationService } from './my-location.service';
import { EmergencyComponent } from '../ui/emergency.component';

// PH4b: SOS to the festival team from the public page.

describe('device id (for the SOS limits)', () => {
  beforeEach(() => localStorage.removeItem('big-live:device'));
  afterEach(() => localStorage.removeItem('big-live:device'));

  it('is made once and kept on the phone', () => {
    const a = deviceId();
    expect(a).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(deviceId()).toBe(a);
  });

  it('replaces a broken stored value', () => {
    localStorage.setItem('big-live:device', 'x');
    expect(deviceId()).not.toBe('x');
  });
});

describe('PublicApiService.sendSos', () => {
  it('posts the location with the device id and no cookies', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(PublicApiService);
    const http = TestBed.inject(HttpTestingController);
    api.sendSos({ lat: 20.98, lng: 79.35, accuracy: 12, message: 'Help', phone: '' }).subscribe();
    const req = http.expectOne(r => r.url.endsWith('/public/sos'));
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeFalse();
    expect(req.request.body).toEqual(jasmine.objectContaining({ lat: 20.98, lng: 79.35, message: 'Help', device: jasmine.any(String) }));
    req.flush({ ok: true, id: 's1' });
    http.verify();
  });
});

describe('EmergencyComponent — SOS to the team', () => {
  let fixture: ComponentFixture<EmergencyComponent>;
  let c: EmergencyComponent;
  let api: jasmine.SpyObj<PublicApiService>;
  let me: MyLocationService;
  const text = () => (fixture.nativeElement as HTMLElement).textContent || '';

  beforeEach(() => {
    api = jasmine.createSpyObj('PublicApiService', ['sendSos']);
    TestBed.configureTestingModule({ imports: [EmergencyComponent], providers: [{ provide: PublicApiService, useValue: api }] });
    me = TestBed.inject(MyLocationService);
    fixture = TestBed.createComponent(EmergencyComponent);
    c = fixture.componentInstance;
    c.contacts = [{ label: 'Festival line', phone: '112233' }];
  });

  it('switched off: no SOS option at all', () => {
    c.sos = false;
    fixture.detectChanges();
    c.open = true;
    fixture.detectChanges();
    expect(text()).not.toContain('Send SOS to the festival team');
    expect(text()).toContain('Call Festival line');
  });

  it('on: Send SOS → confirm (location, message, phone) → sent', async () => {
    c.sos = true;
    c.open = true;
    fixture.detectChanges();
    expect(text()).toContain('Send SOS to the festival team');
    spyOn(me, 'request').and.resolveTo({ at: [20.98, 79.35], accuracy: 12 });
    await c.startSos();
    fixture.detectChanges();
    expect(text()).toContain('Send SOS to the festival team?');
    expect(text()).toContain('accurate to about 12 m');
    c.sosMessage = ' Fainted near stage ';
    c.sosPhone = '+91 98765 43210';
    api.sendSos.and.returnValue(of({ ok: true, id: 's1' }));
    c.sendSos();
    expect(api.sendSos).toHaveBeenCalledWith({ lat: 20.98, lng: 79.35, accuracy: 12, message: 'Fainted near stage', phone: '+91 98765 43210' });
    fixture.detectChanges();
    expect(c.step).toBe('sent');
    expect(text()).toContain('Help is on the way');
  });

  it('cannot send without a location; says why', async () => {
    c.sos = true;
    spyOn(me, 'request').and.callFake(async () => { me.problem = 'denied'; return null; });
    await c.startSos();
    expect(c.locProblem).toBe('denied');
    c.sendSos();
    expect(api.sendSos).not.toHaveBeenCalled();
  });

  it('shows the server\'s refusal plainly (e.g. please wait)', async () => {
    c.sos = true;
    spyOn(me, 'request').and.resolveTo({ at: [20.98, 79.35], accuracy: 12 });
    await c.startSos();
    api.sendSos.and.returnValue(throwError(() => ({ error: { message: 'Your SOS was already sent. Please wait a few minutes…' } })));
    c.sendSos();
    expect(c.sendError).toContain('already sent');
    expect(c.step).toBe('confirm');
  });
});
