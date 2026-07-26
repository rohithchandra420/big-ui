import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';

import { TicketEditFormComponent } from './ticket-edit-form.component';
import { BoxOfficeService } from '../box-office.service';
import { NotificationService } from '../../core/notification.service';
import { Ticket } from '../../models/ticket.model';

const mockTicket: Ticket = new Ticket(1, 'Arjun', 'Mehta', 'arjun@example.com', '9000000001', 'TXN1', 'Yes', 100, [], 't1');

describe('TicketEditFormComponent', () => {
  let component: TicketEditFormComponent;
  let fixture: ComponentFixture<TicketEditFormComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['updateTicketDetails']);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);

    await TestBed.configureTestingModule({
      declarations: [TicketEditFormComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(TicketEditFormComponent);
    component = fixture.componentInstance;
    component.ticket = mockTicket;
    fixture.detectChanges();
  });

  it('pre-fills the form from the input ticket', () => {
    expect(component.form.value).toEqual({
      first_name: 'Arjun', last_name: 'Mehta', email: 'arjun@example.com', phone_no: '9000000001'
    });
  });

  it('save() does nothing when the form is invalid', () => {
    component.form.get('email')?.setValue('not-an-email');
    component.save();
    expect(boxOfficeServiceSpy.updateTicketDetails).not.toHaveBeenCalled();
  });

  it('save() trims values, calls updateTicketDetails, and emits saved', () => {
    component.form.setValue({
      first_name: '  Kavya  ', last_name: '  Reddy  ', email: 'kavya@example.com', phone_no: '  9000000009  '
    });
    const updated = { ...mockTicket, first_name: 'Kavya', last_name: 'Reddy', email: 'kavya@example.com', phone_no: '9000000009' };
    boxOfficeServiceSpy.updateTicketDetails.and.returnValue(of(updated));
    const savedSpy = spyOn(component.saved, 'emit');

    component.save();

    expect(boxOfficeServiceSpy.updateTicketDetails).toHaveBeenCalledWith(jasmine.objectContaining({
      first_name: 'Kavya', last_name: 'Reddy', email: 'kavya@example.com', phone_no: '9000000009', _id: 't1'
    }));
    expect(notificationSpy.openSucessSnackBar).toHaveBeenCalled();
    expect(savedSpy).toHaveBeenCalledWith(updated);
    expect(component.saving).toBeFalse();
  });

  it('save() shows an error toast and does not emit saved on failure', () => {
    boxOfficeServiceSpy.updateTicketDetails.and.returnValue(throwError(() => new Error('fail')));
    const savedSpy = spyOn(component.saved, 'emit');

    component.save();

    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalled();
    expect(savedSpy).not.toHaveBeenCalled();
    expect(component.saving).toBeFalse();
  });

  it('cancel() emits cancelled', () => {
    const cancelledSpy = spyOn(component.cancelled, 'emit');
    component.cancel();
    expect(cancelledSpy).toHaveBeenCalled();
  });
});
