import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';
import { BillboardService } from './billboard.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

describe('BillboardService', () => {
  let service: BillboardService;
  let http: HttpTestingController;
  let user$: BehaviorSubject<any>;
  const url = environment.URL;

  beforeEach(() => {
    user$ = new BehaviorSubject<any>(null);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: AuthService, useValue: { user: user$ } }]
    });
    service = TestBed.inject(BillboardService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks for nothing while signed out', () => {
    http.expectNone(`${url}/billboard/unread-count`);
    expect(service.unread$.value).toBe(0);
  });

  it('loads the unread count on sign-in and resets it when a different user signs in', fakeAsync(() => {
    user$.next({ _id: 'u1' });
    http.expectOne(`${url}/billboard/unread-count`).flush({ unread: 4 });
    flushMicrotasks();
    expect(service.unread$.value).toBe(4);

    user$.next({ _id: 'u1' });                    // same user again: no new request
    http.expectNone(`${url}/billboard/unread-count`);

    user$.next({ _id: 'u2' });
    expect(service.unread$.value).toBe(0);
    http.expectOne(`${url}/billboard/unread-count`).flush({ unread: 1 });
    flushMicrotasks();
    expect(service.unread$.value).toBe(1);

    user$.next(null);
    expect(service.unread$.value).toBe(0);
  }));

  it('ignores a late answer for the previous user', fakeAsync(() => {
    user$.next({ _id: 'u1' });
    const req = http.expectOne(`${url}/billboard/unread-count`);
    user$.next(null);
    req.flush({ unread: 9 });
    flushMicrotasks();
    expect(service.unread$.value).toBe(0);
  }));

  it('lists notes, paging back with ?before=', fakeAsync(() => {
    let page: any;
    service.list().then(p => page = p);
    http.expectOne(`${url}/billboard`).flush({ notes: [{ _id: 'n1' }], hasMore: true });
    flushMicrotasks();
    expect(page.hasMore).toBeTrue();

    service.list('n1').then(p => page = p);
    http.expectOne(`${url}/billboard?before=n1`).flush({ notes: [], hasMore: false });
    flushMicrotasks();
    expect(page.hasMore).toBeFalse();
  }));

  it('markRead / markAllRead update the count from the server\'s answer', fakeAsync(() => {
    service.markRead('n1');
    const r = http.expectOne(`${url}/billboard/n1/read`);
    expect(r.request.method).toBe('POST');
    r.flush({ unread: 2 });
    flushMicrotasks();
    expect(service.unread$.value).toBe(2);

    service.markAllRead();
    http.expectOne(`${url}/billboard/read-all`).flush({ unread: 0 });
    flushMicrotasks();
    expect(service.unread$.value).toBe(0);
  }));
});
