import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { DepartmentService } from './department.service';
import { EventService } from './event.service';

// Staff list R2: every My Department call carries the sidebar event.
describe('DepartmentService (staff list)', () => {
  let service: DepartmentService;
  let http: HttpTestingController;
  let current: any;

  beforeEach(() => {
    current = { _id: 'e1', name: 'BiG 7.0' };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: EventService, useValue: { get currentActiveEvent() { return current; } } }
      ]
    });
    service = TestBed.inject(DepartmentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('adds the sidebar event to lists, matrices and marks', () => {
    service.getAttendance('d1', '2026-11-12').subscribe();
    const list = http.expectOne(r => r.url.endsWith('/department/d1/attendance'));
    expect(list.request.params.get('event')).toBe('e1');
    expect(list.request.params.get('date')).toBe('2026-11-12');
    list.flush({});

    service.markAttendance('d1', '2026-11-12', []).subscribe();
    const mark = http.expectOne(r => r.method === 'POST');
    expect(mark.request.body.event).toBe('e1');
    mark.flush({});

    service.getUsersMatrix().subscribe();
    const m = http.expectOne(r => r.url.endsWith('/department/summary/users-matrix'));
    expect(m.request.params.get('event')).toBe('e1');
    m.flush({});
  });

  it('sends no event when none is picked, and none for "my" endpoints', () => {
    current = null;
    service.getDepartmentDetail('d1').subscribe();
    const d = http.expectOne(r => r.url.endsWith('/department/d1'));
    expect(d.request.params.has('event')).toBeFalse();
    d.flush({});

    current = { _id: 'e1', name: 'BiG 7.0' };
    service.getMyDepartments().subscribe();
    const mine = http.expectOne(r => r.url.endsWith('/department/mine'));
    expect(mine.request.params.has('event')).toBeFalse();
    mine.flush([]);
  });
});
