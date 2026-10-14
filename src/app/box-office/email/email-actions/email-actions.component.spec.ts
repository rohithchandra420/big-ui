import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { EmailActionsComponent } from './email-actions.component';
import { EmailService } from '../../../core/email.service';
import { EmailDialogsService } from '../email-dialogs.service';
import { Ticket } from '../../../models/ticket.model';
import { EmailBatch } from '../../../models/email.model';

const batch: EmailBatch = { id: 'b1', type: 'ticket', total: 1, done: 0, sent: 0, failed: 0, skipped: 0, finished: false, startedAt: '', finishedAt: null };

describe('EmailActionsComponent', () => {
  let fixture: ComponentFixture<EmailActionsComponent>;
  let component: EmailActionsComponent;
  let dialogsSpy: jasmine.SpyObj<EmailDialogsService>;
  let canSend: boolean;
  let canSendCustom: boolean;

  beforeEach(() => canSendCustom = true);

  const setup = async () => {
    dialogsSpy = jasmine.createSpyObj('EmailDialogsService', ['openTicketEmail', 'openCustomEmail']);
    dialogsSpy.openTicketEmail.and.returnValue(of(batch));
    dialogsSpy.openCustomEmail.and.returnValue(of(undefined));
    await TestBed.configureTestingModule({
      declarations: [EmailActionsComponent],
      providers: [
        { provide: EmailService, useValue: { canSend: () => of(canSend), canSendTicket: () => of(canSend), canSendCustom: () => of(canSendCustom) } },
        { provide: EmailDialogsService, useValue: dialogsSpy }
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(EmailActionsComponent);
    component = fixture.componentInstance;
    component.ticket = new Ticket(1, 'Asha', 'Menon', 'a@example.com', '9', 'TXN', 'not_sent', 1, [], 't1');
    fixture.detectChanges();
  };

  const buttons = () => Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'));

  it('renders nothing for people who cannot send', async () => {
    canSend = false;
    await setup();
    expect(buttons().length).toBe(0);
  });

  it('opens the Ticket Email dialog and reports the started send', async () => {
    canSend = true;
    await setup();
    const sent = spyOn(component.sent, 'emit');
    buttons()[0].click();
    expect(dialogsSpy.openTicketEmail).toHaveBeenCalledWith([component.ticket!]);
    expect(component.ticket!.ticketEmail.status).toBe('not_sent');
    expect(sent).toHaveBeenCalledWith(batch);
  });

  it('shows only the Ticket Email button to people who cannot send custom emails', async () => {
    canSend = true;
    canSendCustom = false;
    await setup();
    expect(buttons().length).toBe(1);
    expect(buttons()[0].textContent).toContain('Ticket Email');
  });

  it('labels the button "Resend" once sent', async () => {
    canSend = true;
    await setup();
    component.ticket!.ticketEmail = { status: 'sent' };
    fixture.detectChanges();
    expect(buttons()[0].textContent).toContain('Resend Ticket Email');
  });

  it('opens the Custom Email dialog; a cancel emits nothing', async () => {
    canSend = true;
    await setup();
    const sent = spyOn(component.sent, 'emit');
    buttons()[1].click();
    expect(dialogsSpy.openCustomEmail).toHaveBeenCalledWith([component.ticket!]);
    expect(sent).not.toHaveBeenCalled();
    expect(component.busy).toBeFalse();
  });
});
