import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { BoxOfficeQrscannerPopupComponent } from './qrscanner-popup.component';
import { BoxOfficeService } from '../../box-office.service';

// The camera component itself isn't rendered here (NO_ERRORS_SCHEMA + an
// overridden template) — these tests cover what happens with a scanned code.
describe('BoxOfficeQrscannerPopupComponent', () => {
  let fixture: ComponentFixture<BoxOfficeQrscannerPopupComponent>;
  let component: BoxOfficeQrscannerPopupComponent;
  let boxOfficeSpy: jasmine.SpyObj<BoxOfficeService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<BoxOfficeQrscannerPopupComponent>>;
  const scan = (value: string) => component.onEvent([{ value } as any], { stop: jasmine.createSpy('stop') });

  beforeEach(async () => {
    boxOfficeSpy = jasmine.createSpyObj('BoxOfficeService', ['verifyQr']);
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    await TestBed.configureTestingModule({
      declarations: [BoxOfficeQrscannerPopupComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeSpy },
        { provide: MatDialogRef, useValue: dialogRefSpy }
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
  });

  it('shows the reason and keeps scanning when a code is rejected', () => {
    boxOfficeSpy.verifyQr.and.returnValue(throwError(() => ({ error: { message: 'This QR code is not valid' } })));
    scan('forged');
    expect(component.message).toBe('This QR code is not valid');
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('does not re-check the same rejected code over and over', () => {
    boxOfficeSpy.verifyQr.and.returnValue(throwError(() => ({ error: { message: 'nope' } })));
    scan('forged');
    scan('forged');
    scan('forged');
    expect(boxOfficeSpy.verifyQr).toHaveBeenCalledTimes(1);
  });

  it('ignores empty scans', () => {
    component.onEvent([], undefined);
    expect(boxOfficeSpy.verifyQr).not.toHaveBeenCalled();
  });
});
