import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { CustomEmailDialogComponent, CustomEmailDialogData } from './custom-email-dialog.component';
import { EmailService } from '../../../core/email.service';
import { NotificationService } from '../../../core/notification.service';
import { RichTextEditorComponent } from '../../../shared/rich-text-editor/rich-text-editor.component';
import { Ticket } from '../../../models/ticket.model';
import { EmailConfig } from '../../../models/email.model';

const t = (id: string, email = `${id}@example.com`) => new Ticket(1, 'Asha', id, email, '9', 'TXN', 'not_sent', 1, [], id);

describe('CustomEmailDialogComponent', () => {
  let fixture: ComponentFixture<CustomEmailDialogComponent>;
  let component: CustomEmailDialogComponent;
  let emailSpy: jasmine.SpyObj<EmailService>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<CustomEmailDialogComponent>>;

  const setup = async (tickets: Ticket[], config: EmailConfig = { canSend: true, safeMode: false, dailyCap: 300, remainingToday: 300 }) => {
    emailSpy = jasmine.createSpyObj('EmailService', ['sendCustomEmails', 'sendTest', 'preview']);
    emailSpy.sendCustomEmails.and.returnValue(of({ id: 'b2' } as any));
    emailSpy.sendTest.and.returnValue(of({ to: 'me@example.com' }));
    emailSpy.preview.and.returnValue(of({ to: 'a@example.com', subject: 'Hi Asha', html: '<p>Hello</p>' }));
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    try { localStorage.removeItem('big.emailTester'); } catch { }

    await TestBed.configureTestingModule({
      declarations: [CustomEmailDialogComponent, RichTextEditorComponent],
      imports: [FormsModule],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { tickets, config } as CustomEmailDialogData },
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: EmailService, useValue: emailSpy },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(CustomEmailDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('counts recipients and skips bookings without an email', async () => {
    await setup([t('a'), t('b', '')]);
    expect(component.recipients.map(x => x._id)).toEqual(['a']);
    expect(component.noEmail.map(x => x._id)).toEqual(['b']);
  });

  it('needs a subject and a message with real text', async () => {
    await setup([t('a')]);
    expect(component.canSend).toBeFalse();
    component.subject = 'Gate times';
    component.bodyHtml = '<p><br></p>';
    expect(component.canSend).toBeFalse();
    component.bodyHtml = '<p>Gates open at 4</p>';
    expect(component.canSend).toBeTrue();
  });

  it('sends the content and closes with the batch', async () => {
    await setup([t('a'), t('b')]);
    component.subject = '  Update  ';
    component.bodyHtml = '<p>Hello {first_name}</p>';
    component.includeTicket = true;
    component.send();
    expect(emailSpy.sendCustomEmails).toHaveBeenCalledWith(['a', 'b'],
      { subject: 'Update', bodyHtml: '<p>Hello {first_name}</p>', includeTicket: true }, undefined);
    expect(dialogRefSpy.close).toHaveBeenCalledWith({ id: 'b2' } as any);
  });

  it('in test mode, requires and passes a tester address', async () => {
    await setup([t('a')], { canSend: true, safeMode: true, dailyCap: 300, remainingToday: 300 });
    component.subject = 'S';
    component.bodyHtml = '<p>x</p>';
    expect(component.canSend).toBeFalse();
    component.tester = 'tester@example.com';
    component.send();
    expect(emailSpy.sendCustomEmails.calls.mostRecent().args[2]).toBe('tester@example.com');
  });

  it('inserts placeholders into the subject at the caret', async () => {
    await setup([t('a')]);
    component.subject = 'Hello  welcome';
    fixture.detectChanges();
    await fixture.whenStable(); // ngModel writes the input value asynchronously
    const input: HTMLInputElement = fixture.nativeElement.querySelector('#subject');
    input.setSelectionRange(6, 6);
    component.focus('subject');
    component.insertPlaceholder('first_name');
    expect(component.subject).toBe('Hello {first_name} welcome');
  });

  it('inserts placeholders into the message by default', async () => {
    await setup([t('a')]);
    const spy = spyOn(component.editor!, 'insertText');
    component.insertPlaceholder('order_id');
    expect(spy).toHaveBeenCalledWith('{order_id}');
  });

  it('previews for the first recipient', async () => {
    await setup([t('a')]);
    component.subject = 'Hi {first_name}';
    component.bodyHtml = '<p>Hello</p>';
    component.showPreview();
    expect(emailSpy.preview).toHaveBeenCalledWith('custom', 'a', jasmine.objectContaining({ subject: 'Hi {first_name}' }));
    expect(component.previewSubject).toBe('Hi Asha');
    expect(component.previewHtml).toBeTruthy();
  });
});
