import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { TicketEmailDialogComponent, TicketEmailDialogData } from './ticket-email-dialog.component';
import { EmailService } from '../../../core/email.service';
import { NotificationService } from '../../../core/notification.service';
import { Ticket, TicketEmailStatus } from '../../../models/ticket.model';
import { EmailConfig } from '../../../models/email.model';

const t = (id: string, status: TicketEmailStatus, email = `${id}@example.com`) =>
  new Ticket(1, 'Buyer', id, email, '9', 'TXN', status, 1, [], id);

describe('TicketEmailDialogComponent', () => {
  let fixture: ComponentFixture<TicketEmailDialogComponent>;
  let component: TicketEmailDialogComponent;
  let emailSpy: jasmine.SpyObj<EmailService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<TicketEmailDialogComponent>>;
  let notifySpy: jasmine.SpyObj<NotificationService>;

  const setup = async (tickets: Ticket[], config: EmailConfig = { canSend: true, safeMode: false, dailyCap: 300, remainingToday: 300 }) => {
    emailSpy = jasmine.createSpyObj('EmailService', ['sendTicketEmails', 'sendTest']);
    emailSpy.sendTicketEmails.and.returnValue(of({ id: 'b1' } as any));
    emailSpy.sendTest.and.returnValue(of({ to: 'me@example.com' }));
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    try { localStorage.removeItem('big.emailTester'); } catch { }

    await TestBed.configureTestingModule({
      declarations: [TicketEmailDialogComponent],
      imports: [FormsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { tickets, config } as TicketEmailDialogData },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: EmailService, useValue: emailSpy },
        { provide: NotificationService, useValue: notifySpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(TicketEmailDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('splits the selection into not sent, already sent, sending and no email', async () => {
    await setup([t('a', 'not_sent'), t('b', 'failed'), t('c', 'sent'), t('d', 'sending'), t('e', 'not_sent', '')]);
    expect(component.notSent.map(x => x._id)).toEqual(['a', 'b']);
    expect(component.alreadySent.map(x => x._id)).toEqual(['c']);
    expect(component.inProgress.map(x => x._id)).toEqual(['d']);
    expect(component.noEmail.map(x => x._id)).toEqual(['e']);
    expect(component.mode).toBe('unsent');
    expect(component.toSendCount).toBe(2);
    component.mode = 'all';
    expect(component.toSendCount).toBe(3);
  });

  it('defaults to resending when everything was already sent', async () => {
    await setup([t('c', 'sent')]);
    expect(component.mode).toBe('all');
    expect(component.canSend).toBeTrue();
  });

  it('sends the selection and closes with the batch', async () => {
    await setup([t('a', 'not_sent'), t('c', 'sent')]);
    component.send();
    expect(emailSpy.sendTicketEmails).toHaveBeenCalledWith(['a', 'c'], 'unsent', undefined);
    expect(dialogRefSpy.close).toHaveBeenCalledWith({ id: 'b1' } as any);
  });

  it('in test mode, requires a tester address and passes it on', async () => {
    await setup([t('a', 'not_sent')], { canSend: true, safeMode: true, dailyCap: 300, remainingToday: 300 });
    expect(component.canSend).toBeFalse();
    component.tester = 'not-an-email';
    expect(component.canSend).toBeFalse();
    component.tester = 'tester@example.com';
    expect(component.canSend).toBeTrue();
    component.send();
    expect(emailSpy.sendTicketEmails).toHaveBeenCalledWith(['a'], 'unsent', 'tester@example.com');
  });

  it('blocks sends over today\'s allowance', async () => {
    await setup([t('a', 'not_sent'), t('b', 'not_sent')], { canSend: true, safeMode: false, dailyCap: 300, remainingToday: 1 });
    expect(component.overCap).toBeTrue();
    expect(component.canSend).toBeFalse();
  });

  it('shows the server\'s message when sending fails', async () => {
    await setup([t('a', 'not_sent')]);
    emailSpy.sendTicketEmails.and.returnValue(throwError(() => ({ error: { message: 'Daily email limit reached' } })));
    component.send();
    expect(component.error).toBe('Daily email limit reached');
    expect(component.sending).toBeFalse();
    expect(dialogRefSpy.close).not.toHaveBeenCalled();
  });

  it('sends a test copy for the first booking that would get one', async () => {
    await setup([t('c', 'sent'), t('a', 'not_sent')]);
    component.sendTest();
    expect(emailSpy.sendTest).toHaveBeenCalledWith('ticket', 'a');
    expect(notifySpy.openSucessSnackBar).toHaveBeenCalledWith('Test email sent to me@example.com');
  });
});
