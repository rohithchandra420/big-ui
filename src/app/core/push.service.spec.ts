import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject } from 'rxjs';
import { PushService, PUSH_PROMPT_DISMISSED_KEY } from './push.service';

describe('PushService', () => {
  let service: PushService;
  let http: HttpTestingController;
  let swSub$: BehaviorSubject<PushSubscription | null>;
  let swPush: any;
  const config = { enabled: true, publicKey: 'PUBKEY', preferences: { emailBatch: true, announcements: true, meals: true }, canAnnounce: false };
  const fakeSub = (endpoint = 'https://push.example.com/abc') => ({
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } })
  } as any);

  const setup = (withSw = true) => {
    swSub$ = new BehaviorSubject<PushSubscription | null>(null);
    swPush = {
      isEnabled: true,
      subscription: swSub$.asObservable(),
      requestSubscription: jasmine.createSpy('requestSubscription').and.resolveTo(fakeSub()),
      unsubscribe: jasmine.createSpy('unsubscribe').and.resolveTo(undefined)
    };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: withSw ? [{ provide: SwPush, useValue: swPush }] : []
    });
    service = TestBed.inject(PushService);
    http = TestBed.inject(HttpTestingController);
  };

  const loadConfig = async (cfg: any = config) => {
    const p = service.load();
    http.expectOne(r => r.url.endsWith('/push/config')).flush(cfg);
    return p;
  };

  afterEach(() => {
    http?.verify();
    localStorage.removeItem(PUSH_PROMPT_DISMISSED_KEY);
  });

  it('is "unsupported" (and harmless) without the service worker', () => {
    setup(false);
    expect(['unsupported', 'ios-needs-install']).toContain(service.state$.value);
    expect(service.hasDeviceSubscription).toBeFalse();
  });

  it('is "off" until this device subscribes, then "on"', async () => {
    setup();
    await loadConfig();
    if (Notification.permission === 'denied') { pending('Notifications are denied in this test browser'); return; }
    expect(service.state$.value).toBe('off');
    swSub$.next(fakeSub());
    expect(service.state$.value).toBe('on');
    expect(service.hasDeviceSubscription).toBeTrue();
  });

  it('is "server-off" when the server has no keys', async () => {
    setup();
    await loadConfig({ ...config, enabled: false, publicKey: null });
    expect(service.state$.value).toBe('server-off');
  });

  it('enable() asks the browser with the server key and registers the device', async () => {
    setup();
    await loadConfig();
    const p = service.enable();
    await Promise.resolve(); await Promise.resolve();
    const req = http.expectOne(r => r.url.endsWith('/push/subscribe'));
    expect(swPush.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'PUBKEY' });
    expect(req.request.body).toEqual({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } });
    req.flush({ ok: true });
    await p;
    expect(service.hasDeviceSubscription).toBeTrue();
  });

  it('enable() does nothing when push is off on the server', async () => {
    setup();
    await loadConfig({ ...config, enabled: false, publicKey: null });
    await service.enable();
    expect(swPush.requestSubscription).not.toHaveBeenCalled();
  });

  it('disable() tells the server and unsubscribes the browser', async () => {
    setup();
    swSub$.next(fakeSub('https://push.example.com/xyz'));
    const p = service.disable();
    const req = http.expectOne(r => r.url.endsWith('/push/unsubscribe'));
    expect(req.request.body).toEqual({ endpoint: 'https://push.example.com/xyz' });
    req.flush({ ok: true });
    await p;
    expect(swPush.unsubscribe).toHaveBeenCalled();
    expect(service.hasDeviceSubscription).toBeFalse();
  });

  it('setPreference() saves and updates the loaded config', async () => {
    setup();
    await loadConfig();
    const p = service.setPreference('announcements', false);
    const req = http.expectOne(r => r.url.endsWith('/push/preferences'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ announcements: false });
    req.flush({ preferences: { emailBatch: true, announcements: false } });
    await p;
    expect(service.config$.value!.preferences.announcements).toBeFalse();
  });

  it('remembers the one-time prompt was dismissed', () => {
    setup();
    expect(service.promptDismissed()).toBeFalse();
    service.dismissPrompt();
    expect(service.promptDismissed()).toBeTrue();
  });
});
