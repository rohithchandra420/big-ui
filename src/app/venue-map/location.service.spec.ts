import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LocationService } from './location.service';
import { environment } from '../../environments/environment';

describe('LocationService', () => {
  let service: LocationService;
  let http: HttpTestingController;
  const url = environment.URL;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(LocationService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists an event\'s locations', async () => {
    const p = service.list('ev1');
    http.expectOne(`${url}/locations?event=ev1`).flush({ locations: [], canAdd: true, canImport: false });
    expect(await p).toEqual({ locations: [], canAdd: true, canImport: false });
  });

  it('creates, updates and deletes', async () => {
    const input = { name: 'WS', type: 'water' as const, lat: 1, lng: 2 };
    const c = service.create('ev1', input);
    const req = http.expectOne(`${url}/locations`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ event: 'ev1', ...input });
    req.flush({ _id: 'l1' });
    await c;

    const u = service.update('l1', { lat: 3 });
    const ureq = http.expectOne(`${url}/locations/l1`);
    expect(ureq.request.method).toBe('PATCH');
    ureq.flush({ _id: 'l1' });
    await u;

    const d = service.remove('l1');
    const dreq = http.expectOne(`${url}/locations/l1`);
    expect(dreq.request.method).toBe('DELETE');
    dreq.flush(null);
    await d;
  });

  it('imports many and lists my departments', async () => {
    const i = service.importMany('ev1', [{ name: 'A', type: 'other', lat: 1, lng: 2 }]);
    const req = http.expectOne(`${url}/locations/import`);
    expect(req.request.body.locations.length).toBe(1);
    req.flush({ created: 1 });
    expect(await i).toEqual({ created: 1 });

    const d = service.myDepartments();
    http.expectOne(`${url}/department/mine`).flush([{ _id: 'd1', name: 'Ops' }]);
    expect(await d).toEqual([{ _id: 'd1', name: 'Ops' }]);
  });
});
