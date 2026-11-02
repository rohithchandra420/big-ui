import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { BoxOfficeQrscannerPopupComponent, SCAN_MAX_RETRIES, SCAN_RETRY_DELAY_MS } from './qrscanner-popup.component';
import { BoxOfficeService } from '../../box-office.service';
import { GateFeedbackService } from '../../../core/gate-feedback.service';

// The camera component itself isn't rendered here (NO_ERRORS_SCHEMA + an
// overridden template) — these tests cover what happens with a scanned code.
describe('BoxOfficeQrscannerPopupComponent', () => {
  let fixture: ComponentFixture<BoxOfficeQrscannerPopupComponent>;
  let component: BoxOfficeQrscannerPopupComponent;
  let boxOfficeSpy: jasmine.SpyObj<BoxOfficeService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<BoxOfficeQrscannerPopupComponent>>;
  let feedbackSpy: jasmine.SpyObj<GateFeedbackService>;
  const scan = (value: string) => component.onEvent([{ value } as any], { stop: jasmine.createSpy('stop') });

  beforeEach(async () => {
    boxOfficeSpy = jasmine.createSpyObj('BoxOfficeService', ['verifyQr', 'lookupBand']);
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    feedbackSpy = jasmine.createSpyObj('GateFeedbackService', ['found', 'notFound', 'error', 'unlock']);
    await TestBed.configureTestingModule({
      declarations: [BoxOfficeQrscannerPopupComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: GateFeedbackService, useValue: feedbackSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).overrideTemplate(BoxOfficeQrscannerPopupComponent, '<div>{{ message }}</div>').compileComponents();
    fixture = TestBed.createComponent(BoxOfficeQrscannerPopupComponent);
    component = fixture.componentInstance;
  });

  it('opens the booking when big-api accepts the code', () => {
    boxOfficeSpy.verifyQr.and.returnValue(of({ ticketId: 't1', orderId: 1, signed: true }));
    scan('{"_id":"t1","oid":1,"tid":"x","sig":"abc"}');
    expect(boxOfficeSpy.verifyQr).toHaveBeenCalledWith('{"_id":"t1","oid":1,"tid":"x","sig":"abc"}');
    expect(dialogRefSpy.close).toHaveBeenCalledWith('t1');
    expect(feedbackSpy.found).toHaveBeenCalledTimes(1);
    expect(feedbackSpy.notFound).not.toHaveBeenCalled();
  });

  it('shows the reason and keeps scanning when a code is rejected', () => {
    boxOfficeSpy.verifyQr.and.returnValue(throwError(() => ({ error: { message: 'This QR code is not valid' } })));
    scan('{forged}');
    expect(component.message).toBe('This QR code is not valid');
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
    expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);
    expect(feedbackSpy.found).not.toHaveBeenCalled();
  });

  describe('connection/server failures', () => {
    const offline = () => throwError(() => ({ status: 0 }));

    it('says the server could not be reached and retries instead of rejecting the code', fakeAsync(() => {
      boxOfficeSpy.verifyQr.and.returnValue(offline());
      scan('{"_id":"t1"}');
      expect(component.message).toContain('Could not reach the server');
      expect(component.message).toContain(`Retrying (1 of ${SCAN_MAX_RETRIES})`);
      expect(component.isError).toBeTrue();
      expect(feedbackSpy.error).not.toHaveBeenCalled();
      expect(feedbackSpy.notFound).not.toHaveBeenCalled();
      component.close();
    }));

    it('opens the booking when a retry succeeds', fakeAsync(() => {
      boxOfficeSpy.verifyQr.and.returnValues(offline(), of({ ticketId: 't1', orderId: 1, signed: true }));
      scan('{"_id":"t1"}');
      tick(SCAN_RETRY_DELAY_MS);
      expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(2);
      expect(dialogRefSpy.close).toHaveBeenCalledWith('t1');
      expect(feedbackSpy.found).toHaveBeenCalledTimes(1);
      expect(component.message).toBe('');
    }));

    it(`gives up after ${SCAN_MAX_RETRIES} retries with one Error sound and offers Scan again`, fakeAsync(() => {
      boxOfficeSpy.verifyQr.and.returnValue(offline());
      scan('{"_id":"t1"}');
      // Camera frames during the pauses must not start parallel checks.
      scan('{"_id":"t1"}');
      tick(SCAN_RETRY_DELAY_MS * SCAN_MAX_RETRIES);
      expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(1 + SCAN_MAX_RETRIES);
      expect(feedbackSpy.error).toHaveBeenCalledTimes(1);
      expect(feedbackSpy.notFound).not.toHaveBeenCalled();
      expect(component.message).not.toContain('Retrying');
      expect(component.canScanAgain).toBeTrue();

      // The same code isn't re-checked on its own...
      scan('{"_id":"t1"}');
      expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(1 + SCAN_MAX_RETRIES);
      // ...until staff tap Scan again.
      component.scanAgain();
      expect(component.message).toBe('');
      expect(component.canScanAgain).toBeFalse();
      boxOfficeSpy.verifyQr.and.returnValue(of({ ticketId: 't1', orderId: 1, signed: true }));
      scan('{"_id":"t1"}');
      expect(dialogRefSpy.close).toHaveBeenCalledWith('t1');
    }));

    it('retries a server error (5xx) too', fakeAsync(() => {
      boxOfficeSpy.verifyQr.and.returnValue(throwError(() => ({ status: 503 })));
      scan('{"_id":"t1"}');
      expect(component.message).toContain('server ran into a problem');
      tick(SCAN_RETRY_DELAY_MS);
      expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(2);
      component.close();
    }));

    it('stops retrying when the dialog is closed', fakeAsync(() => {
      boxOfficeSpy.verifyQr.and.returnValue(offline());
      scan('{"_id":"t1"}');
      component.close();
      tick(SCAN_RETRY_DELAY_MS * SCAN_MAX_RETRIES);
      expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(1);
    }));

    it('does not retry a rejected (invalid) code', fakeAsync(() => {
      boxOfficeSpy.verifyQr.and.returnValue(throwError(() => ({ status: 400, error: { message: 'This QR code is not valid' } })));
      scan('{forged}');
      tick(SCAN_RETRY_DELAY_MS * SCAN_MAX_RETRIES);
      expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(1);
      expect(component.isError).toBeFalse();
      expect(component.canScanAgain).toBeFalse();
      expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);
    }));
  });

  it('does not re-check the same rejected code over and over', () => {
    boxOfficeSpy.verifyQr.and.returnValue(throwError(() => ({ error: { message: 'nope' } })));
    scan('{forged}');
    scan('{forged}');
    scan('{forged}');
    expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(1);
    // ...and only buzzes once for it, not on every camera frame.
    expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);
  });

  it("turns off the scanner library's own per-frame beep and vibration", () => {
    expect(component.config.isBeep).toBeFalse();
    expect(component.config.vibrate).toBe(0);
  });

  it('ignores empty scans', () => {
    component.onEvent([], undefined);
    expect(boxOfficeSpy.verifyQr).not.toHaveBeenCalled();
  });

  it('defaults to booking mode when opened without data', () => {
    expect(component.mode).toBe('booking');
  });
});

const owner = (extra: any = {}) => ({
  passId: 'p1', ticketId: 't1', orderId: 1001, name: 'Arjun Mehta', passTypeName: 'Festival Pass', isAdmitted: true, ...extra
});

describe('BoxOfficeQrscannerPopupComponent — bands at the gate (booking mode)', () => {
  let component: BoxOfficeQrscannerPopupComponent;
  let boxOfficeSpy: jasmine.SpyObj<BoxOfficeService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<BoxOfficeQrscannerPopupComponent>>;
  let feedbackSpy: jasmine.SpyObj<GateFeedbackService>;
  let stopSpy: jasmine.Spy;
  const scan = (value: string) => component.onEvent([{ value } as any], { stop: stopSpy });

  beforeEach(async () => {
    boxOfficeSpy = jasmine.createSpyObj('BoxOfficeService', ['verifyQr', 'lookupBand']);
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    feedbackSpy = jasmine.createSpyObj('GateFeedbackService', ['found', 'notFound', 'error', 'unlock']);
    stopSpy = jasmine.createSpy('stop');
    await TestBed.configureTestingModule({
      declarations: [BoxOfficeQrscannerPopupComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: GateFeedbackService, useValue: feedbackSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).overrideTemplate(BoxOfficeQrscannerPopupComponent, '<div>{{ message }}</div>').compileComponents();
    component = TestBed.createComponent(BoxOfficeQrscannerPopupComponent).componentInstance;
  });

  it('opens the booking of a linked band', () => {
    boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'active', code: 'E:T1', owner: owner() } as any));
    scan('https://wallet.example/p?eventid=E&tagid=T1');
    expect(boxOfficeSpy.verifyQr).not.toHaveBeenCalled();
    expect(dialogRefSpy.close).toHaveBeenCalledWith('t1');
    expect(feedbackSpy.found).toHaveBeenCalledTimes(1);
  });

  it('says a band nobody has is not linked yet', () => {
    boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'unknown', code: 'E:T9' } as any));
    scan('BAND-9');
    expect(component.message).toContain('isn\'t linked to anyone yet');
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
    expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);
  });

  it('flags a replaced band and blocks until staff choose to open the booking', () => {
    boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'replaced', code: 'E:T1', owner: owner(), currentCode: 'E:T2' } as any));
    scan('BAND-1');
    expect(component.paused).toBeTrue();
    expect(component.band?.state).toBe('replaced');
    expect(stopSpy).toHaveBeenCalled();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
    expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);

    // More camera frames do nothing while blocked.
    scan('BAND-1');
    expect(boxOfficeSpy.lookupBand).toHaveBeenCalledTimes(1);

    component.openFlaggedBooking();
    expect(dialogRefSpy.close).toHaveBeenCalledWith('t1');
  });
});

describe('BoxOfficeQrscannerPopupComponent — band mode', () => {
  let component: BoxOfficeQrscannerPopupComponent;
  let boxOfficeSpy: jasmine.SpyObj<BoxOfficeService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<BoxOfficeQrscannerPopupComponent>>;
  let feedbackSpy: jasmine.SpyObj<GateFeedbackService>;
  let stopSpy: jasmine.Spy;
  const scan = (value: string) => component.onEvent([{ value } as any], { stop: stopSpy });

  const create = async (purpose: 'admit' | 'link' | 'replace') => {
    TestBed.resetTestingModule();
    boxOfficeSpy = jasmine.createSpyObj('BoxOfficeService', ['verifyQr', 'lookupBand']);
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    feedbackSpy = jasmine.createSpyObj('GateFeedbackService', ['found', 'notFound', 'error', 'unlock']);
    stopSpy = jasmine.createSpy('stop');
    await TestBed.configureTestingModule({
      declarations: [BoxOfficeQrscannerPopupComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: GateFeedbackService, useValue: feedbackSpy },
        { provide: MAT_DIALOG_DATA, useValue: { mode: 'band', purpose, attendeeName: 'Arjun Mehta', passId: 'p1' } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).overrideTemplate(BoxOfficeQrscannerPopupComponent, '<div>{{ message }}</div>').compileComponents();
    component = TestBed.createComponent(BoxOfficeQrscannerPopupComponent).componentInstance;
  };

  beforeEach(async () => create('admit'));

  it('reads the dialog data and titles the dialog for the purpose', () => {
    expect(component.mode).toBe('band');
    expect(component.attendeeName).toBe('Arjun Mehta');
    expect(component.title).toBe('Admit: Scan Wrist Band');
    expect(component.confirmLabel).toBe('Admit and link band');
  });

  it('a new band: stops the camera, one Found sound, then closes with the band on confirm', () => {
    boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'unknown', code: 'E:T1' } as any));
    scan('https://wallet.example/p?eventid=E&tagid=T1');
    scan('https://wallet.example/p?eventid=E&tagid=T1');
    expect(stopSpy).toHaveBeenCalled();
    expect(boxOfficeSpy.lookupBand).toHaveBeenCalledTimes(1);
    expect(component.bandOk).toBeTrue();
    expect(feedbackSpy.found).toHaveBeenCalledTimes(1);
    expect(dialogRefSpy.close).not.toHaveBeenCalled();

    component.confirmBand();
    expect(dialogRefSpy.close).toHaveBeenCalledWith({ raw: 'https://wallet.example/p?eventid=E&tagid=T1', code: 'E:T1' });
  });

  it('a band already on someone else cannot be used', () => {
    boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'active', code: 'E:T1', owner: owner({ passId: 'other', name: 'Kabir Das', orderId: 77 }) } as any));
    scan('BAND-1');
    expect(component.bandOk).toBeFalse();
    expect(component.message).toBe('This band is already linked to Kabir Das (order 77).');
    expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);
    component.confirmBand();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('the pass\'s own band is fine for Admit', () => {
    boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'active', code: 'E:T1', owner: owner() } as any));
    scan('BAND-1');
    expect(component.isOwnBand).toBeTrue();
    expect(component.bandOk).toBeTrue();
  });

  it('a replaced band is flagged and cannot be used', () => {
    boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'replaced', code: 'E:T1', owner: owner({ passId: 'other' }) } as any));
    scan('BAND-1');
    expect(component.band?.state).toBe('replaced');
    expect(component.bandOk).toBeFalse();
    expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);
  });

  it('text that is not a band shows the reason', () => {
    boxOfficeSpy.lookupBand.and.returnValue(throwError(() => ({ status: 400, error: { message: 'This is a ticket QR code, not a band' } })));
    scan('{"_id":"t1","oid":1}');
    expect(component.message).toBe('This is a ticket QR code, not a band');
    expect(component.paused).toBeTrue();
    expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);
  });

  it('Scan again clears the band and restarts the camera', () => {
    const startSpy = jasmine.createSpy('start').and.returnValue(of(null));
    component.action = { start: startSpy } as any;
    boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'unknown', code: 'BAND-1' } as any));
    scan('BAND-1');
    component.scanBandAgain();
    expect(component.paused).toBeFalse();
    expect(component.band).toBeNull();
    expect(startSpy).toHaveBeenCalled();
    expect(feedbackSpy.unlock).toHaveBeenCalled();

    scan('BAND-2');
    expect(boxOfficeSpy.lookupBand).toHaveBeenCalledWith('BAND-2');
  });

  describe('replace', () => {
    beforeEach(async () => create('replace'));

    it('needs a reason and returns it with the new band', () => {
      boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'unknown', code: 'BAND-2' } as any));
      scan('BAND-2');
      component.confirmBand();
      expect(dialogRefSpy.close).not.toHaveBeenCalled();
      component.reason = '  Lost at the stage ';
      component.confirmBand();
      expect(dialogRefSpy.close).toHaveBeenCalledWith({ raw: 'BAND-2', code: 'BAND-2', reason: 'Lost at the stage' });
    });

    it('refuses the band they already have', () => {
      boxOfficeSpy.lookupBand.and.returnValue(of({ state: 'active', code: 'BAND-1', owner: owner() } as any));
      scan('BAND-1');
      expect(component.bandOk).toBeFalse();
      expect(component.message).toContain('already have');
    });
  });
});

describe('BoxOfficeQrscannerPopupComponent — raw mode (Workshops lists and door)', () => {
  let component: BoxOfficeQrscannerPopupComponent;
  let boxOfficeSpy: jasmine.SpyObj<BoxOfficeService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<BoxOfficeQrscannerPopupComponent>>;
  let feedbackSpy: jasmine.SpyObj<GateFeedbackService>;

  beforeEach(async () => {
    boxOfficeSpy = jasmine.createSpyObj('BoxOfficeService', ['verifyQr', 'lookupBand']);
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    feedbackSpy = jasmine.createSpyObj('GateFeedbackService', ['found', 'notFound', 'error', 'unlock']);
    await TestBed.configureTestingModule({
      declarations: [BoxOfficeQrscannerPopupComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: GateFeedbackService, useValue: feedbackSpy },
        { provide: MAT_DIALOG_DATA, useValue: { mode: 'raw', title: 'Door: Scan Wrist Band' } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).overrideTemplate(BoxOfficeQrscannerPopupComponent, '<div>{{ title }}</div>').compileComponents();
    component = TestBed.createComponent(BoxOfficeQrscannerPopupComponent).componentInstance;
  });

  it('closes with the scanned text on the first read: no Box Office lookup, no sound, camera stopped', () => {
    const stop = jasmine.createSpy('stop');
    expect(component.title).toBe('Door: Scan Wrist Band');
    component.onEvent([{ value: 'https://wallet.example/p?eventid=E&tagid=T9' } as any], { stop });
    component.onEvent([{ value: 'again' } as any], { stop });
    expect(dialogRefSpy.close).toHaveBeenCalledOnceWith('https://wallet.example/p?eventid=E&tagid=T9');
    expect(stop).toHaveBeenCalled();
    expect(boxOfficeSpy.lookupBand).not.toHaveBeenCalled();
    expect(feedbackSpy.found).not.toHaveBeenCalled();
  });
});
