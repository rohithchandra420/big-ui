import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MedicalService } from './medical.service';
import { MedicalLockService } from './medical-lock.service';
import { environment } from '../../environments/environment';

describe('MedicalService', () => {
  let service: MedicalService;
  let lock: MedicalLockService;
  let http: HttpTestingController;
  const url = environment.URL + '/medical';

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(MedicalService);
    lock = TestBed.inject(MedicalLockService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('marks the desk unlocked after a successful call', fakeAsync(() => {
    let done = false;
    service.report('p1').then(() => done = true);
    http.expectOne(`${url}/patients/p1`).flush({ patient: {}, visits: [], can: {} });
    flushMicrotasks();
    expect(done).toBeTrue();
    expect(lock.locked).toBeFalse();
  }));

  it('on 423 locks, waits for the password, then retries once', fakeAsync(() => {
    let result: any;
    service.records('e1', { resting: true, q: ' ann ' }).then(r => result = r);
    const first = http.expectOne(r => r.url === `${url}/patients`);
    expect(first.request.params.get('resting')).toBe('1');
    expect(first.request.params.get('q')).toBe('ann');
    first.flush({ locked: true }, { status: 423, statusText: 'Locked' });
    flushMicrotasks();
    expect(lock.locked).toBeTrue();
    http.expectNone(r => r.url === `${url}/patients`);

    lock.unlock('pw');
    http.expectOne(`${url}/unlock`).flush({ ok: true, lockMinutes: 15 });
    flushMicrotasks();
    http.expectOne(r => r.url === `${url}/patients`).flush({ patients: [], total: 0, page: 0, pageSize: 50, counts: {} });
    flushMicrotasks();
    expect(result.total).toBe(0);
  }));

  it('passes other errors through', fakeAsync(() => {
    let status = 0;
    service.deleteVisit('v1').catch(e => status = e.status);
    http.expectOne(`${url}/visits/v1`).flush({ message: 'no' }, { status: 403, statusText: 'Forbidden' });
    flushMicrotasks();
    expect(status).toBe(403);
  }));

  it('access() follows the server lock state', fakeAsync(() => {
    service.access();
    http.expectOne(`${url}/access`).flush({ canUse: true, canManage: false, canAudit: false, locked: false, lockMinutes: 10 });
    flushMicrotasks();
    expect(lock.locked).toBeFalse();
    expect(lock.lockMinutes).toBe(10);
  }));
});
