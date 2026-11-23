import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, SimpleChange } from '@angular/core';
import { of, throwError } from 'rxjs';

import { SalesSyncComponent } from './sales-sync.component';
import { BoxOfficeService, SalesSyncReport, SalesSyncStatus } from '../../box-office.service';
import { EventService } from '../../../core/event.service';
import { NotificationService } from '../../../core/notification.service';
import { SlidePanelComponent } from '../../../shared/slide-panel/slide-panel.component';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';
import { FormsModule } from '@angular/forms';

const status = (o: Partial<SalesSyncStatus> = {}): SalesSyncStatus => ({
  on: true, syncEvent: { _id: 'evt1', name: 'Fest' }, pullReady: true, webhookReady: true, masked: false,
  lastPullAt: null, lastWebhookAt: null, pending: 0, logs: [], ...o
});
const report = (o: Partial<SalesSyncReport> = {}): SalesSyncReport => ({
  fetched: 3, created: 2, updated: 0, cancelled: 0, skipped: 1, errorCount: 0, errors: [],
  unknownCodes: [], unknownPassTypes: [], flagged: [], ...o
});
const dome = { externalCode: 'glamp_dome', name: 'Dome (2 guests)', category: 'tent' as const, beds: 2, bookings: 520 };

describe('SalesSyncComponent', () => {
  let fixture: ComponentFixture<SalesSyncComponent>;
  let component: SalesSyncComponent;
  let boxOffice: jasmine.SpyObj<BoxOfficeService>;
  let notify: jasmine.SpyObj<NotificationService>;
  let events: { currentActiveEvent: any; createPassType: jasmine.Spy };
  const el = (): HTMLElement => fixture.nativeElement;

  const openWith = (s: SalesSyncStatus) => {
    boxOffice.getSalesSync.and.returnValue(of(s));
    component.open = true;
    component.ngOnChanges({ open: new SimpleChange(false, true, false) });
    fixture.detectChanges();
  };

  beforeEach(async () => {
    boxOffice = jasmine.createSpyObj('BoxOfficeService', ['getSalesSync', 'pullSalesSync', 'checkSalesSync', 'fetchSalesBooking']);
    notify = jasmine.createSpyObj('NotificationService', ['openErrorSnackBar', 'openSucessSnackBar']);

    events = { currentActiveEvent: { _id: 'evt1', name: 'Fest' }, createPassType: jasmine.createSpy('createPassType').and.returnValue(of({})) };

    await TestBed.configureTestingModule({
      declarations: [SalesSyncComponent, SlidePanelComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [
        { provide: BoxOfficeService, useValue: boxOffice },
        { provide: EventService, useValue: events },
        { provide: NotificationService, useValue: notify }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(SalesSyncComponent);
    component = fixture.componentInstance;
  });

  it('loads the status for the active event when opened', () => {
    openWith(status());
    expect(boxOffice.getSalesSync).toHaveBeenCalledWith('evt1');
    expect(el().textContent).toContain('New and changed bookings come into this event');
    expect(component.canPull).toBeTrue();
  });

  it('says where bookings go when this event is off, and blocks the pull', () => {
    openWith(status({ on: false, syncEvent: { _id: 'evt2', name: 'Other Fest' } }));
    expect(el().textContent).toContain("This event doesn't take sales system bookings");
    expect(el().textContent).toContain('Other Fest');
    expect(component.canPull).toBeFalse();
  });

  it('blocks the pull when it is not set up on the server', () => {
    openWith(status({ pullReady: false }));
    expect(el().textContent).toContain('Pull not set up yet');
    expect(component.canPull).toBeFalse();
  });

  it('shows the test-system masking note', () => {
    openWith(status({ masked: true }));
    expect(el().textContent).toContain('phones and emails of incoming bookings are replaced with dummies');
  });

  it('pulls, shows the report, tells the page to reload and refreshes the status', () => {
    openWith(status());
    const changed = spyOn(component.changed, 'emit');
    boxOffice.pullSalesSync.and.returnValue(of(report({ flagged: ['SYN7-AAAA01'] })));
    component.pull();
    fixture.detectChanges();
    expect(boxOffice.pullSalesSync).toHaveBeenCalledWith('evt1');
    expect(changed).toHaveBeenCalled();
    expect(boxOffice.getSalesSync).toHaveBeenCalledTimes(2);
    expect(el().textContent).toContain('SYN7-AAAA01');
  });

  it('top roles: missing pass types are pre-filled; Create & pull again creates them then pulls', () => {
    openWith(status());
    boxOffice.pullSalesSync.and.returnValue(of(report({ created: 0, fetched: 520, errorCount: 520, unknownCodes: ['glamp_dome'], unknownPassTypes: [dome], canCreatePassTypes: true })));
    component.pull();
    fixture.detectChanges();
    expect(component.drafts).toEqual([jasmine.objectContaining({ externalCode: 'glamp_dome', name: 'Dome (2 guests)', category: 'tent', beds: 2, bookings: 520 })]);
    expect(el().textContent).toContain('Create 1 pass type & pull again');
    expect(el().textContent).toContain('520 bookings');

    boxOffice.pullSalesSync.and.returnValue(of(report({ created: 520, fetched: 520, skipped: 0 })));
    component.drafts[0].name = 'Dome';
    component.createAndPull();
    expect(events.createPassType).toHaveBeenCalledWith('evt1', { name: 'Dome', category: 'tent', externalCode: 'glamp_dome', beds: 2 });
    expect(boxOffice.pullSalesSync).toHaveBeenCalledTimes(2);
    expect(component.drafts).toEqual([]);
    expect(component.report?.created).toBe(520);
  });

  it('others: missing pass types are listed with "ask an admin", no create button', () => {
    openWith(status());
    boxOffice.pullSalesSync.and.returnValue(of(report({ created: 0, errorCount: 520, unknownPassTypes: [dome], canCreatePassTypes: false })));
    component.pull();
    fixture.detectChanges();
    expect(el().textContent).toContain('Ask an admin');
    expect(el().textContent).not.toContain('& pull again');
    component.createAndPull();
    expect(events.createPassType).not.toHaveBeenCalled();
  });

  it('keeps the drafts and says so when creating a pass type fails', () => {
    openWith(status());
    boxOffice.pullSalesSync.and.returnValue(of(report({ created: 0, errorCount: 1, unknownPassTypes: [dome], canCreatePassTypes: true })));
    component.pull();
    events.createPassType.and.returnValue(throwError(() => ({ error: { message: 'Code already used' } })));
    component.createAndPull();
    expect(notify.openErrorSnackBar).toHaveBeenCalledWith('Code already used');
    expect(component.drafts.length).toBe(1);
    expect(boxOffice.pullSalesSync).toHaveBeenCalledTimes(1);
  });

  it('says "Nothing new" instead of empty tiles when the pull brought nothing', () => {
    openWith(status());
    boxOffice.pullSalesSync.and.returnValue(of(report({ fetched: 0, created: 0, skipped: 0 })));
    component.pull();
    fixture.detectChanges();
    expect(el().textContent).toContain('Nothing new from the sales system');
    expect(el().querySelector('.xi-tiles')).toBeNull();
  });

  it('does not reload the page when nothing changed', () => {
    openWith(status());
    const changed = spyOn(component.changed, 'emit');
    boxOffice.pullSalesSync.and.returnValue(of(report({ created: 0, skipped: 3 })));
    component.pull();
    expect(changed).not.toHaveBeenCalled();
  });

  it('shows the error and the part that was done when a pull stops', () => {
    openWith(status());
    const changed = spyOn(component.changed, 'emit');
    boxOffice.pullSalesSync.and.returnValue(throwError(() => ({ error: { message: 'The sales system refused the API key', report: report({ created: 1 }) } })));
    component.pull();
    fixture.detectChanges();
    expect(component.pullError).toBe('The sales system refused the API key');
    expect(component.report?.created).toBe(1);
    expect(changed).toHaveBeenCalled();
    expect(el().textContent).toContain('refused the API key');
  });

  describe('Check & repair', () => {
    it('stays closed until tapped', () => {
      openWith(status());
      expect(el().textContent).not.toContain('Check all bookings');
      (el().querySelector('.ss-rep-hd') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el().textContent).toContain('Check all bookings');
      expect(el().textContent).toContain('Fetch one booking');
    });

    it('Check shows the comparison and the bookings that were missing', () => {
      openWith(status());
      component.repairOpen = true;
      const changed = spyOn(component.changed, 'emit');
      boxOffice.checkSalesSync.and.returnValue(of({
        ...report({ fetched: 412, created: 2, skipped: 410 }),
        salesPaid: 412, inBig: 413, missing: ['BIG7-AAA001', 'BIG7-AAA002'], extraInBig: ['BIG7-ZZZ009'], extraCount: 1
      }));
      component.runCheck();
      fixture.detectChanges();
      expect(boxOffice.checkSalesSync).toHaveBeenCalledWith('evt1');
      expect(changed).toHaveBeenCalled();
      const text = el().textContent!;
      expect(text).toContain('BIG7-AAA002');
      expect(text).toContain('BIG7-ZZZ009');
      expect(text).toContain('In BiG but not paid in the sales system');
    });

    it('says everything matches when it does', () => {
      openWith(status());
      component.repairOpen = true;
      boxOffice.checkSalesSync.and.returnValue(of({ ...report({ created: 0, skipped: 3 }), salesPaid: 3, inBig: 3, missing: [], extraInBig: [], extraCount: 0 }));
      component.runCheck();
      fixture.detectChanges();
      expect(el().textContent).toContain('Everything matches');
    });

    it('Fetch needs a Booking ID, then says what happened to it', () => {
      openWith(status());
      component.repairOpen = true;
      component.fetchRef = 'bad id!';
      expect(component.canFetch).toBeFalse();
      component.fetchRef = ' BIG7-AAA001 ';
      expect(component.canFetch).toBeTrue();
      boxOffice.fetchSalesBooking.and.returnValue(of({
        ...report({ fetched: 1, created: 0, cancelled: 1 }), result: 'cancelled', reference: 'BIG7-AAA001', messages: [], flags: []
      }));
      component.fetchOne();
      fixture.detectChanges();
      expect(boxOffice.fetchSalesBooking).toHaveBeenCalledWith('evt1', 'BIG7-AAA001');
      expect(el().textContent).toContain('is cancelled in the sales system');
    });

    it('a fetch that is not in the sales system shows the server message', () => {
      openWith(status());
      component.fetchRef = 'BIG7-NOPE01';
      boxOffice.fetchSalesBooking.and.returnValue(throwError(() => ({ error: { message: 'The sales system has no booking with this ID' } })));
      component.fetchOne();
      expect(notify.openErrorSnackBar).toHaveBeenCalledWith('The sales system has no booking with this ID');
    });
  });

  it('describes log entries in plain words', () => {
    expect(component.countsText({ fetched: 4, created: 2, updated: 1, cancelled: 0, skipped: 1, errors: 0 })).toBe('2 new · 1 changed · 1 no change');
    expect(component.countsText({ fetched: 0, created: 0, updated: 0, cancelled: 0, skipped: 0, errors: 0 })).toBe('nothing to do');
    expect(component.kindLabel({ via: 'webhook', kind: 'booking.cancelled' } as any)).toBe('Booking cancelled');
  });
});
