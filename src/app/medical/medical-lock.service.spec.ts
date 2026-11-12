import { TestBed, discardPeriodicTasks, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MedicalLockService } from './medical-lock.service';
import { environment } from '../../environments/environment';

describe('MedicalLockService', () => {
  let lock: MedicalLockService;
  let http: HttpTestingController;
  const url = environment.URL + '/medical';

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    lock = TestBed.inject(MedicalLockService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { lock.leave(); http.verify(); });

  it('starts locked and releases waiters on unlock', fakeAsync(() => {
    expect(lock.locked).toBeTrue();
    let released = false;
    lock.waitForUnlock().then(() => released = true);
    lock.unlock('pw');
    const req = http.expectOne(`${url}/unlock`);
    expect(req.request.body).toEqual({ password: 'pw' });
    req.flush({ ok: true, lockMinutes: 15 });
    flushMicrotasks();
    expect(lock.locked).toBeFalse();
    expect(released).toBeTrue();
  }));

  it('locks after the idle time with no activity, and tells the server', fakeAsync(() => {
    lock.lockMinutes = 1;
    lock.enter();
    lock.touched();
    tick(45000);
    expect(lock.locked).toBeFalse();
    tick(30000);
    expect(lock.locked).toBeTrue();
    http.expectOne(`${url}/lock`).flush({ ok: true });
    discardPeriodicTasks();
  }));

  it('activity keeps it open', fakeAsync(() => {
    lock.lockMinutes = 1;
    lock.enter();
    lock.touched();
    for (let i = 0; i < 6; i++) {
      tick(20000);
      window.dispatchEvent(new KeyboardEvent('keydown'));
    }
    expect(lock.locked).toBeFalse();
    discardPeriodicTasks();
  }));
});
