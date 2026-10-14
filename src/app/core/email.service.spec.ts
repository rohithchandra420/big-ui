import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';

import { EmailService } from './email.service';
import { AuthService } from './auth.service';

describe('EmailService', () => {
  let service: EmailService;
  let http: HttpTestingController;
  let user$: BehaviorSubject<any>;

  beforeEach(() => {
    user$ = new BehaviorSubject<any>({ _id: 'u1' });
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [{ provide: AuthService, useValue: { user: user$ } }]
    });
    service = TestBed.inject(EmailService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('caches the email config until refreshed', () => {
    service.getConfig().subscribe();
    service.getConfig().subscribe();
    http.expectOne(r => r.url.endsWith('/emails/config')).flush({ canSend: true, safeMode: true });

    service.getConfig(true).subscribe();
    http.expectOne(r => r.url.endsWith('/emails/config')).flush({ canSend: true });
  });

  it('reads any config error as "cannot send"', () => {
    let can: boolean | undefined;
    service.canSend().subscribe(v => can = v);
    http.expectOne(r => r.url.endsWith('/emails/config')).flush('nope', { status: 500, statusText: 'err' });
    expect(can).toBeFalse();
  });

  it('asks again after the signed-in user changes', () => {
    service.getConfig().subscribe();
    http.expectOne(r => r.url.endsWith('/emails/config')).flush({ canSend: true });
    user$.next({ _id: 'u2' });
    service.getConfig().subscribe();
    http.expectOne(r => r.url.endsWith('/emails/config')).flush({ canSend: false });
  });

  it('starts a ticket batch with the ids, mode and tester', () => {
    service.sendTicketEmails(['t1', 't2'], 'all', 'tester@example.com').subscribe();
    const req = http.expectOne(r => r.url.endsWith('/emails/ticket'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ticketIds: ['t1', 't2'], mode: 'all', testRecipient: 'tester@example.com' });
    req.flush({ id: 'b1' });
  });

  it('starts a custom batch with the content', () => {
    service.sendCustomEmails(['t1'], { subject: 'S', bodyHtml: '<p>x</p>', includeTicket: true }).subscribe();
    const req = http.expectOne(r => r.url.endsWith('/emails/custom'));
    expect(req.request.body).toEqual(jasmine.objectContaining({ ticketIds: ['t1'], subject: 'S', bodyHtml: '<p>x</p>', includeTicket: true }));
    req.flush({ id: 'b2' });
  });

  it('sends only non-empty report filters', () => {
    service.getLog({ type: 'custom', status: '', q: 'gate', page: 0 }).subscribe();
    const req = http.expectOne(r => r.url.endsWith('/emails/log'));
    expect(req.request.params.get('type')).toBe('custom');
    expect(req.request.params.get('q')).toBe('gate');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.has('status')).toBeFalse();
    req.flush({ items: [], total: 0, page: 0, pageSize: 50, summary: { byStatus: {}, byType: {} } });
  });

  it('loads a booking history and polls a batch', () => {
    service.getBookingHistory('t1').subscribe();
    http.expectOne(r => r.url.endsWith('/emails/booking/t1')).flush([]);
    service.getBatch('b1').subscribe();
    http.expectOne(r => r.url.endsWith('/emails/batches/b1')).flush({ id: 'b1' });
  });
});
