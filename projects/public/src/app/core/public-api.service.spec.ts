import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PublicApiService, Loaded, PublicEventAnswer } from './public-api.service';

const EVENT: PublicEventAnswer = {
  off: false, name: 'BiG 7.0', startDate: '2026-12-10', endDate: '2026-12-12', today: '2026-12-11',
  phase: 'during', days: ['2026-12-10', '2026-12-11', '2026-12-12']
};

describe('PublicApiService', () => {
  let api: PublicApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('big-live:event');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PublicApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    localStorage.removeItem('big-live:event');
  });

  it('calls /public/event without cookies and keeps the answer on the phone', () => {
    let got: Loaded<PublicEventAnswer> | undefined;
    api.event().subscribe(r => got = r);
    const req = http.expectOne(r => r.url.endsWith('/public/event'));
    expect(req.request.withCredentials).toBeFalse();
    req.flush(EVENT);
    expect(got?.data).toEqual(EVENT);
    expect(got?.offline).toBeFalse();
    expect(JSON.parse(localStorage.getItem('big-live:event')!).data).toEqual(EVENT);
  });

  it('offline: answers with the saved copy, marked offline', () => {
    localStorage.setItem('big-live:event', JSON.stringify({ data: EVENT, at: 1234 }));
    let got: Loaded<PublicEventAnswer> | undefined;
    api.event().subscribe(r => got = r);
    http.expectOne(r => r.url.endsWith('/public/event')).error(new ProgressEvent('error'));
    expect(got).toEqual({ data: EVENT, at: 1234, offline: true });
  });

  it('offline with nothing saved: fails', () => {
    let failed = false;
    api.event().subscribe({ error: () => failed = true });
    http.expectOne(r => r.url.endsWith('/public/event')).error(new ProgressEvent('error'));
    expect(failed).toBeTrue();
  });

  it('ignores a broken saved copy', () => {
    localStorage.setItem('big-live:event', '{not json');
    let failed = false;
    api.event().subscribe({ error: () => failed = true });
    http.expectOne(r => r.url.endsWith('/public/event')).error(new ProgressEvent('error'));
    expect(failed).toBeTrue();
  });
});
