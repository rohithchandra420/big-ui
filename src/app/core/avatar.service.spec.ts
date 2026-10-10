import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { AvatarService } from './avatar.service';

describe('AvatarService', () => {
  let service: AvatarService;
  let http: HttpTestingController;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  beforeEach(() => {
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: MatDialog, useValue: dialogSpy }]
    });
    service = TestBed.inject(AvatarService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('returns null without a request when there is no photo', () => {
    let result: string | null | undefined;
    service.getPhotoUrl('u1', 0).subscribe(url => result = url);
    expect(result).toBeNull();
  });

  it('fetches a photo once per user+version and reuses it', () => {
    const results: (string | null)[] = [];
    service.getPhotoUrl('u1', 5).subscribe(url => results.push(url));
    service.getPhotoUrl('u1', 5).subscribe(url => results.push(url));

    const req = http.expectOne(r => r.url.includes('/users/u1/avatar?v=5'));
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['x'], { type: 'image/webp' }));

    expect(results.length).toBe(2);
    expect(results[0]).toMatch(/^blob:/);
    expect(results[1]).toBe(results[0]);
  });

  it('falls back to null when the photo request fails (e.g. 403)', () => {
    let result: string | null | undefined;
    service.getPhotoUrl('u1', 7).subscribe(url => result = url);
    http.expectOne(r => r.url.includes('/users/u1/avatar?v=7'))
      .flush(new Blob(), { status: 403, statusText: 'Forbidden' });
    expect(result).toBeNull();
  });

  it('uploads with the image type and publishes the new version', () => {
    const blob = new Blob(['img'], { type: 'image/webp' });
    let version = 0;
    service.upload('u1', blob).subscribe(v => version = v);

    const req = http.expectOne(r => r.method === 'PUT' && r.url.endsWith('/users/u1/avatar'));
    expect(req.request.headers.get('Content-Type')).toBe('image/webp');
    expect(req.request.body).toBe(blob);
    req.flush({ avatarVersion: 99 });

    expect(version).toBe(99);
    // A list loaded earlier with an older version is overridden
    expect(service.effectiveVersion('u1', 3)).toBe(99);
  });

  it('remove() publishes version 0 so every avatar falls back to initials', () => {
    service.remove('u1').subscribe();
    http.expectOne(r => r.method === 'DELETE' && r.url.endsWith('/users/u1/avatar')).flush({ avatarVersion: 0 });
    expect(service.effectiveVersion('u1', 42)).toBe(0);
  });

  it('uses the list version when nothing changed this session', () => {
    expect(service.effectiveVersion('other', 12)).toBe(12);
    expect(service.effectiveVersion('other', undefined)).toBe(0);
  });

  it('changePhoto() opens the picker with a round crop and uploads what it returns', () => {
    const blob = new Blob(['img'], { type: 'image/webp' });
    dialogSpy.open.and.returnValue({ afterClosed: () => of(blob) } as any);
    let version = 0;
    service.changePhoto('u1').subscribe(v => version = v);

    expect(dialogSpy.open).toHaveBeenCalled();
    expect((dialogSpy.open.calls.mostRecent().args[1] as any).data.shape).toBe('circle');
    http.expectOne(r => r.method === 'PUT').flush({ avatarVersion: 11 });
    expect(version).toBe(11);
  });

  it('changePhoto() does nothing if the picker is cancelled', () => {
    dialogSpy.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    let emitted = false;
    service.changePhoto('u1').subscribe(() => emitted = true);

    http.expectNone(r => r.method === 'PUT');
    expect(emitted).toBeFalse();
  });

  it('fetchVersion() reads avatarVersion from the profile endpoint', () => {
    let version = -1;
    service.fetchVersion('u1').subscribe(v => version = v);
    http.expectOne(r => r.url.endsWith('/user/profile') && r.params.get('id') === 'u1')
      .flush({ _id: 'u1', avatarVersion: 77 });
    expect(version).toBe(77);
  });
});
