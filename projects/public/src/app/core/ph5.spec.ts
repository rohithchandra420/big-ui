import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SwPush } from '@angular/service-worker';
import { of } from 'rxjs';
import { PlanService } from './plan.service';
import { AlertsService } from './alerts.service';
import { PublicSession } from './public-api.service';
import { StarComponent } from '../ui/session-bits';
import { PlanViewComponent } from '../views/plan-view.component';

// PH5: My plan (stars kept on the phone) and festival alerts.

const s = (id: string, over: Partial<PublicSession> = {}): PublicSession => ({
  id, title: id, category: null, venue: 'Dome', start: '2026-12-11T05:30:00Z', end: '2026-12-11T06:30:00Z', facilitators: [],
  description: '', ageLimit: '', language: '', bringYourOwn: '', itemsRequired: '', state: 'reg', stateAt: null, full: false,
  placesLeft: null, ...over
});
const KEYS = ['big-live:starred', 'big-live:plan-seen', 'big-live:alerts-dismissed', 'big-live:alerts-offered'];
const clear = () => KEYS.forEach(k => localStorage.removeItem(k));

describe('PlanService', () => {
  beforeEach(clear);
  afterEach(clear);

  it('stars are kept on the phone', () => {
    const plan = new PlanService();
    expect(plan.toggle(s('a'))).toBeTrue();
    expect(plan.has('a')).toBeTrue();
    expect(new PlanService().ids).toEqual(['a']);   // survives a reload
    expect(plan.toggle(s('a'))).toBeFalse();
    expect(new PlanService().count).toBe(0);
  });

  it('marks time / place / status changes until seen', () => {
    const plan = new PlanService();
    plan.toggle(s('a'));
    expect(plan.changes(s('a'))).toEqual([]);
    const moved = s('a', { start: '2026-12-11T06:00:00Z', venue: 'Meadow', state: 'cancelled' });
    expect(plan.changes(moved)).toEqual(['time', 'place', 'status']);
    // An ordinary status step (registration → walk in) isn't a "change".
    expect(plan.changes(s('a', { state: 'open' }))).toEqual([]);
    plan.markSeen([moved]);
    expect(plan.changes(moved)).toEqual([]);
    expect(plan.changes(s('not-starred', { venue: 'X' }))).toEqual([]);
  });
});

describe('AlertsService', () => {
  let http: HttpTestingController;
  let swPush: any;
  const setup = (sw: any) => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), ...(sw ? [{ provide: SwPush, useValue: sw }] : [])] });
    http = TestBed.inject(HttpTestingController);
    return TestBed.inject(AlertsService);
  };
  beforeEach(clear);
  afterEach(clear);

  it('unsupported without a service worker', async () => {
    const a = setup(null);
    await a.init();
    expect(['unsupported', 'ios-install']).toContain(a.state);
    expect(a.showCard).toBeFalse();
  });

  it('turn on: asks the server key, subscribes, sends the starred list; the card hides', async () => {
    const sub = { endpoint: 'https://push.example.com/1', toJSON: () => ({ endpoint: 'https://push.example.com/1', keys: { p256dh: 'p', auth: 'a' } }) };
    swPush = { isEnabled: true, subscription: of(null), requestSubscription: jasmine.createSpy('req').and.resolveTo(sub), unsubscribe: jasmine.createSpy('unsub').and.resolveTo() };
    const a = setup(swPush);
    TestBed.inject(PlanService).toggle(s('a'));
    await a.init();
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') { pending('Notifications not available in this browser'); return; }
    expect(a.state).toBe('off');
    expect(a.showCard).toBeTrue();
    const done = a.turnOn();
    http.expectOne(r => r.url.endsWith('/public/push/config')).flush({ enabled: true, publicKey: 'KEY' });
    await new Promise(r => setTimeout(r, 0));
    const subReq = http.expectOne(r => r.url.endsWith('/public/push/subscribe'));
    expect(subReq.request.body).toEqual({ subscription: { endpoint: 'https://push.example.com/1', keys: { p256dh: 'p', auth: 'a' } }, starred: ['a'] });
    expect(subReq.request.withCredentials).toBeFalse();
    subReq.flush({ ok: true });
    expect(await done).toBeTrue();
    expect(a.state).toBe('on');
    expect(swPush.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: 'KEY' });

    // A new star is synced.
    TestBed.inject(PlanService).toggle(s('b'));
    expect(http.expectOne(r => r.url.endsWith('/public/push/starred')).request.body.starred).toEqual(['a', 'b']);
  });

  it('the after-first-star offer happens once; the card can be closed', async () => {
    swPush = { isEnabled: true, subscription: of(null) };
    const a = setup(swPush);
    await a.init();
    if (a.state !== 'off') { pending('Notifications not available in this browser'); return; }
    expect(a.shouldOfferAfterStar()).toBeTrue();
    expect(a.shouldOfferAfterStar()).toBeFalse();
    a.dismissCard();
    expect(a.showCard).toBeFalse();
  });
});

describe('StarComponent + PlanViewComponent', () => {
  beforeEach(() => {
    clear();
    TestBed.configureTestingModule({ imports: [StarComponent, PlanViewComponent], providers: [provideHttpClient()] });
  });
  afterEach(clear);

  it('the star toggles My plan, which lists starred sessions in time order', () => {
    const star = TestBed.createComponent(StarComponent);
    star.componentInstance.session = s('late', { start: '2026-12-11T09:00:00Z' });
    star.detectChanges();
    (star.nativeElement.querySelector('.star') as HTMLButtonElement).click();
    star.detectChanges();
    expect(star.nativeElement.querySelector('.star').classList).toContain('on');
    TestBed.inject(PlanService).toggle(s('early'));

    const view = TestBed.createComponent(PlanViewComponent);
    view.componentInstance.sessions = [s('late', { start: '2026-12-11T09:00:00Z' }), s('early'), s('other')];
    view.componentInstance.ngOnChanges();
    view.detectChanges();
    expect(view.componentInstance.mine.map(x => x.id)).toEqual(['early', 'late']);
  });

  it('empty My plan explains the star', () => {
    const view = TestBed.createComponent(PlanViewComponent);
    view.detectChanges();
    expect(view.nativeElement.textContent).toContain('Tap the star');
  });
});
