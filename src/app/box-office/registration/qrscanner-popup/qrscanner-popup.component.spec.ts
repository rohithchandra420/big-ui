import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
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
    boxOfficeSpy = jasmine.createSpyObj('BoxOfficeService', ['verifyQr']);
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
    scan('forged');
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
      scan('forged');
      tick(SCAN_RETRY_DELAY_MS * SCAN_MAX_RETRIES);
      expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(1);
      expect(component.isError).toBeFalse();
      expect(component.canScanAgain).toBeFalse();
      expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);
    }));
  });

  it('does not re-check the same rejected code over and over', () => {
    boxOfficeSpy.verifyQr.and.returnValue(throwError(() => ({ error: { message: 'nope' } })));
    scan('forged');
    scan('forged');
    scan('forged');
    expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(1);
    // ...and only buzzes once for it, not on every camera frame.
    expect(feedbackSpy.notFound).toHaveBeenCalledTimes(1);
  });

  it('ignores empty scans', () => {
    component.onEvent([], undefined);
    expect(boxOfficeSpy.verifyQr).not.toHaveBeenCalled();
  });
});
