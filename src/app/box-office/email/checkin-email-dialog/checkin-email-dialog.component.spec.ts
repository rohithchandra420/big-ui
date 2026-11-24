import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { CheckinEmailDialogComponent, CheckinEmailDialogData } from './checkin-email-dialog.component';
import { EmailService } from '../../../core/email.service';
import { NotificationService } from '../../../core/notification.service';
import { Ticket } from '../../../models/ticket.model';
import { EmailConfig } from '../../../models/email.model';

// Invented sample people only.
const full = { category: 'festival_pass', isActive: true, name: 'Halvard Penhallow', phone_no: '9000000061', email: 'halvard@example.test', gender: 'Male' } as any;
const empty = { category: 'festival_pass', isActive: true, name: '', phone_no: '', email: '', gender: null } as any;

const t = (id: string, passes: any[], extra: Partial<Ticket> = {}, email = `${id}@example.test`) =>
  Object.assign(new Ticket(1, 'Buyer', id, email, '9', 'TXN', 'not_sent', 1, passes, id), extra);

describe('CheckinEmailDialogComponent (Early Check-In EC2)', () => {
  let fixture: ComponentFixture<CheckinEmailDialogComponent>;
  let component: CheckinEmailDialogComponent;
  let emailSpy: jasmine.SpyObj<EmailService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<CheckinEmailDialogComponent>>;
  let notifySpy: jasmine.SpyObj<NotificationService>;

  const setup = async (tickets: Ticket[], config: EmailConfig = { canSend: true, canSendCheckin: true, safeMode: false, dailyCap: 300, remainingToday: 300 }) => {
    emailSpy = jasmine.createSpyObj('EmailService', ['sendCheckinEmails', 'sendTest', 'preview']);
    emailSpy.sendCheckinEmails.and.returnValue(of({ id: 'b1' } as any));
    emailSpy.sendTest.and.returnValue(of({ to: 'me@example.test' }));
    emailSpy.preview.and.returnValue(of({ to: 'a@example.test', subject: 'S', html: '<p>x</p>' }));
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    try { localStorage.removeItem('big.emailTester'); } catch { }

    await TestBed.configureTestingModule({
      declarations: [CheckinEmailDialogComponent],
      imports: [FormsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { tickets, config } as CheckinEmailDialogData },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: EmailService, useValue: emailSpy },
        { provide: NotificationService, useValue: notifySpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(CheckinEmailDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('splits the selection the way the server does', async () => {
    await setup([
      t('a', [full, empty]),
      t('b', [full]),
      t('c', [empty], { bookingStatus: 'cancelled' }),
      t('d', []),
      t('e', [empty], { earlyCheckin: { status: 'sending' } }),
      t('f', [empty], {}, '')
    ]);
    expect(component.missing.map(x => x._id)).toEqual(['a']);
    expect(component.complete.map(x => x._id)).toEqual(['b']);
    expect(component.notEligible.map(x => x._id)).toEqual(['c', 'd']);
    expect(component.inProgress.map(x => x._id)).toEqual(['e']);
    expect(component.noEmail.map(x => x._id)).toEqual(['f']);
    expect(component.mode).toBe('missing');
    expect(component.toSendCount).toBe(1);
    component.mode = 'all';
    expect(component.toSendCount).toBe(2);
  });

  it('switches to "all" when nothing is missing', async () => {
    await setup([t('b', [full])]);
    expect(component.mode).toBe('all');
    expect(component.toSendCount).toBe(1);
  });

  it('starts at 14 days and accepts only whole days from 1 to 60', async () => {
    await setup([t('a', [empty])]);
    expect(component.days).toBe(14);
    expect(component.canSend).toBeTrue();
    for (const bad of [0, 61, 2.5, null]) {
      component.days = bad as any;
      expect(component.daysValid).withContext(String(bad)).toBeFalse();
      expect(component.canSend).toBeFalse();
    }
    component.setDays(30);
    expect(component.daysValid).toBeTrue();
  });

  it('sends the ids, days and mode, and closes with the batch', async () => {
    await setup([t('a', [empty]), t('b', [full])]);
    component.setDays(7);
    component.send();
    expect(emailSpy.sendCheckinEmails).toHaveBeenCalledWith(['a', 'b'], 7, 'missing', undefined);
    expect(dialogRefSpy.close).toHaveBeenCalledWith({ id: 'b1' } as any);
  });

  it('in test mode needs a tester address and sends it along', async () => {
    await setup([t('a', [empty])], { canSend: true, canSendCheckin: true, safeMode: true, dailyCap: 300, remainingToday: 300 });
    expect(component.canSend).toBeFalse();
    component.tester = 'tester@example.test';
    expect(component.canSend).toBeTrue();
    component.send();
    expect(emailSpy.sendCheckinEmails).toHaveBeenCalledWith(['a'], 14, 'missing', 'tester@example.test');
  });

  it('will not go over the daily allowance', async () => {
    await setup([t('a', [empty]), t('b', [empty])], { canSend: true, canSendCheckin: true, safeMode: false, dailyCap: 300, remainingToday: 1 });
    expect(component.overCap).toBeTrue();
    expect(component.canSend).toBeFalse();
  });

  it('previews and sends a test copy for the first booking that gets one, with the days', async () => {
    await setup([t('c', [empty], { bookingStatus: 'cancelled' }), t('a', [empty])]);
    component.togglePreview();
    expect(emailSpy.preview).toHaveBeenCalledWith('checkin', 'a', { days: 14 });
    expect(component.previewSubject).toBe('S');
    component.sendTest();
    expect(emailSpy.sendTest).toHaveBeenCalledWith('checkin', 'a', { days: 14 });
    expect(notifySpy.openSucessSnackBar).toHaveBeenCalledWith('Test email sent to me@example.test');
  });

  it('shows the server message when sending fails', async () => {
    await setup([t('a', [empty])]);
    emailSpy.sendCheckinEmails.and.returnValue(throwError(() => ({ error: { message: 'Daily email limit reached' } })));
    component.send();
    expect(component.error).toBe('Daily email limit reached');
    expect(component.sending).toBeFalse();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });
});
