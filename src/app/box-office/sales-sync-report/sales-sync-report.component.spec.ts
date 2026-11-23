import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { SalesSyncReportComponent } from './sales-sync-report.component';
import { BoxOfficeService, SalesSyncLogEntry } from '../box-office.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { SlidePanelComponent } from '../../shared/slide-panel/slide-panel.component';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';
import { SortThComponent } from '../../shared/table-sort/sort-th.component';
import { DateTimeComponent } from '../../shared/date-time/date-time.component';
import { syncAlertText } from '../bookings/sales-sync/sales-sync.utils';

const entry = (o: Partial<SalesSyncLogEntry> = {}): SalesSyncLogEntry => ({
  _id: 'l1', via: 'webhook', kind: 'booking.paid', at: '2026-11-23T08:32:00Z',
  counts: { fetched: 1, created: 0, updated: 0, cancelled: 0, skipped: 0, errors: 1 },
  problems: [{ reference: 'BIG7-REP001', messages: ['Unknown pass type(s): glamp_dome'] }],
  unknownCodes: ['glamp_dome'], flagged: [], note: null,
  alert: { users: 3, devices: 4, delivered: 4, held: false }, by: null, ...o
});

describe('SalesSyncReportComponent', () => {
  let fixture: ComponentFixture<SalesSyncReportComponent>;
  let component: SalesSyncReportComponent;
  let boxOffice: jasmine.SpyObj<BoxOfficeService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let active: BehaviorSubject<any>;
  const el = (): HTMLElement => fixture.nativeElement;
  const lastQuery = () => boxOffice.getSalesSyncLog.calls.mostRecent().args[1];

  beforeEach(async () => {
    boxOffice = jasmine.createSpyObj('BoxOfficeService', ['getSalesSyncLog']);
    boxOffice.getSalesSyncLog.and.returnValue(of({
      total: 2, page: 0, limit: 25,
      entries: [entry(), entry({ _id: 'l2', via: 'pull', kind: 'pull', counts: { fetched: 9, created: 7, updated: 0, cancelled: 0, skipped: 2, errors: 0 }, problems: [], unknownCodes: [], alert: null, by: 'Box Office TL' })]
    }));
    notify = jasmine.createSpyObj('NotificationService', ['openErrorSnackBar']);
    active = new BehaviorSubject<any>({ _id: 'evt1', name: 'Fest' });

    await TestBed.configureTestingModule({
      declarations: [SalesSyncReportComponent, SlidePanelComponent, AppSelectComponent, AppOptionComponent, SortThComponent, DateTimeComponent],
      imports: [FormsModule],
      providers: [
        { provide: BoxOfficeService, useValue: boxOffice },
        { provide: EventService, useValue: { activeEvent: active, get currentActiveEvent() { return active.value; } } },
        { provide: NotificationService, useValue: notify }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(SalesSyncReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads the first page for the selected event, newest first', () => {
    expect(boxOffice.getSalesSyncLog).toHaveBeenCalledWith('evt1', jasmine.objectContaining({ page: 0, limit: 25, sort: 'at', dir: 'desc' }));
    const text = el().textContent!;
    expect(text).toContain('Sales Sync Report');
    expect(text).toContain('Live update');
    expect(text).toContain('Pass type missing: glamp_dome');
    expect(text).toContain('BIG7-REP001');
    expect(text).toContain('Sent · 3 people');
    expect(text).toContain('by Box Office TL');
    // The full alert text is on hover.
    expect(el().querySelector('td.sr-al')!.getAttribute('title')).toBe('Sent to 3 people (4 of 4 phones)');
  });

  it('Problem cell: the reason, the first Booking ID and how many more', () => {
    expect(component.problemOf(entry({ counts: { fetched: 5, created: 0, updated: 0, cancelled: 0, skipped: 0, errors: 5 } })))
      .toEqual({ reason: 'Pass type missing: glamp_dome', first: 'BIG7-REP001', more: 4, flag: false });
    expect(component.problemOf(entry({ problems: [], counts: { fetched: 395, created: 0, updated: 0, cancelled: 0, skipped: 0, errors: 395 } })))
      .toEqual({ reason: 'Pass type missing: glamp_dome', first: null, more: 0, flag: false });
    expect(component.problemOf(entry({ problems: [], unknownCodes: [], flagged: ['BIG7-F1', 'BIG7-F2'], counts: { fetched: 2, created: 0, updated: 2, cancelled: 0, skipped: 0, errors: 0 } })))
      .toEqual({ reason: '2 to check', first: 'BIG7-F1', more: 1, flag: true });
    expect(component.problemOf(entry({ problems: [], unknownCodes: [], counts: { fetched: 1, created: 1, updated: 0, cancelled: 0, skipped: 0, errors: 0 } }))).toBeNull();
  });

  it('filters go to the server and start again at page 1', () => {
    component.pageIndex = 3;
    component.source = 'webhook';
    component.applyFilters();
    expect(lastQuery()).toEqual(jasmine.objectContaining({ page: 0, source: 'webhook' }));
    component.toggleProblems();
    expect(lastQuery().problems).toBeTrue();
    component.from = '2026-11-21';
    component.to = '2026-11-22';
    component.applyFilters();
    expect(lastQuery()).toEqual(jasmine.objectContaining({ from: '2026-11-21', to: '2026-11-22' }));
    component.clearFilters();
    expect(lastQuery()).toEqual(jasmine.objectContaining({ source: '', problems: false, from: undefined, to: undefined }));
  });

  it('refuses a "from" after "to" without asking the server', () => {
    const calls = boxOffice.getSalesSyncLog.calls.count();
    component.from = '2026-11-23';
    component.to = '2026-11-20';
    component.applyFilters();
    expect(boxOffice.getSalesSyncLog.calls.count()).toBe(calls);
    expect(notify.openErrorSnackBar).toHaveBeenCalled();
  });

  it('a header tap sorts on the server', () => {
    component.sort.toggle('errors');
    expect(lastQuery()).toEqual(jasmine.objectContaining({ sort: 'errors', dir: 'asc', page: 0 }));
  });

  it('pages', () => {
    component.onPage({ pageIndex: 1, pageSize: 50, length: 2 } as any);
    expect(lastQuery()).toEqual(jasmine.objectContaining({ page: 1, limit: 50 }));
  });

  it('reloads when another event is picked', () => {
    const calls = boxOffice.getSalesSyncLog.calls.count();
    active.next({ _id: 'evt2', name: 'Other' });
    expect(boxOffice.getSalesSyncLog.calls.count()).toBe(calls + 1);
    expect(boxOffice.getSalesSyncLog.calls.mostRecent().args[0]).toBe('evt2');
  });

  it('opens an entry in the panel with everything stored on it', () => {
    component.open(entry({
      sourceEventId: 'evt_abc123',
      bookings: { created: ['BIG7-NEW001'], updated: ['BIG7-UPD001'], cancelled: [] },
      counts: { fetched: 3, created: 1, updated: 1, cancelled: 0, skipped: 0, errors: 1 }
    }));
    fixture.detectChanges();
    const text = el().textContent!;
    expect(text).toContain('evt_abc123');
    expect(text).toContain('Sales system (automatic)');
    expect(text).toContain('From the sales system');
    expect(text).toContain('BIG7-NEW001');
    expect(text).toContain('BIG7-UPD001');
    expect(text).toContain('Pass types missing');
    expect(text).toContain('4 sent of 4');
    expect(text).toContain('Whether it was read is not known');
  });

  it('a live update that was stored says no alert was needed', () => {
    component.open(entry({ alert: null, problems: [], unknownCodes: [], counts: { fetched: 1, created: 1, updated: 0, cancelled: 0, skipped: 0, errors: 0 } }));
    fixture.detectChanges();
    expect(el().textContent).toContain('No alert: the booking was stored');
  });

  it('says so when the report cannot load', () => {
    boxOffice.getSalesSyncLog.and.returnValue(throwError(() => ({ error: { message: 'Nope' } })));
    component.load();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('Nope');
  });

  it('alert wording', () => {
    expect(syncAlertText({ users: 2, devices: 0, delivered: 0, held: false })).toBe('No phones with alerts on (2 people)');
    expect(syncAlertText({ users: 0, devices: 0, delivered: 0, held: true })).toBe('Held (one alert per hour)');
    expect(syncAlertText(null)).toBe('');
  });
});
