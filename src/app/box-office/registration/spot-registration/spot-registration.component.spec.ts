import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { SpotRegistrationComponent } from './spot-registration.component';
import { BoxOfficeService } from '../../box-office.service';
import { NotificationService } from '../../../core/notification.service';
import { EventService } from '../../../core/event.service';
import { Ticket } from '../../../models/ticket.model';
import { EventDetail, EventItem } from '../../../models/event.model';
import { AppSelectComponent } from '../../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../../shared/app-select/app-option.component';

const mockActiveEvent = { _id: 'evt1', name: 'Test Event', description: '', status: 'active' } as EventItem;
const mockEventDetail: EventDetail = {
  ...mockActiveEvent,
  passTypes: [{ _id: 'pt1', event: 'evt1', name: 'Festival Ticket', category: 'festival' }],
  tents: []
};

describe('SpotRegistrationComponent', () => {
  let component: SpotRegistrationComponent;
  let fixture: ComponentFixture<SpotRegistrationComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;
  let activeEventSubject: BehaviorSubject<EventItem | null>;
  let eventServiceSpy: jasmine.SpyObj<EventService> & { activeEvent: BehaviorSubject<EventItem | null>, currentActiveEvent: EventItem | null };

  beforeEach(async () => {
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['createBoxOfficeTicket']);
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    activeEventSubject = new BehaviorSubject<EventItem | null>(mockActiveEvent);
    eventServiceSpy = jasmine.createSpyObj('EventService', ['getEventDetail']) as any;
    eventServiceSpy.activeEvent = activeEventSubject;
    Object.defineProperty(eventServiceSpy, 'currentActiveEvent', { get: () => activeEventSubject.value });
    eventServiceSpy.getEventDetail.and.returnValue(of(mockEventDetail));

    await TestBed.configureTestingModule({
      declarations: [SpotRegistrationComponent, AppSelectComponent, AppOptionComponent],
      imports: [ReactiveFormsModule],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: EventService, useValue: eventServiceSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(SpotRegistrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts with a single empty shopcart item row', () => {
    expect(component.shopcart.length).toBe(1);
  });

  it('loads pass types for the active event on init', () => {
    expect(eventServiceSpy.getEventDetail).toHaveBeenCalledWith('evt1');
    expect(component.passTypeOptions).toEqual(mockEventDetail.passTypes);
  });

  it('addItem() adds another row', () => {
    component.addItem();
    expect(component.shopcart.length).toBe(2);
  });

  it('removeItem() removes the row at the given index but never the last one', () => {
    component.addItem();
    component.removeItem(0);
    expect(component.shopcart.length).toBe(1);

    component.removeItem(0);
    expect(component.shopcart.length).toBe(1);
  });

  it('save() does nothing when the form is invalid', () => {
    component.save();
    expect(boxOfficeServiceSpy.createBoxOfficeTicket).not.toHaveBeenCalled();
  });

  it('save() trims values, includes eventId, omits order_id/transaction_id, calls createBoxOfficeTicket, and emits registered', () => {
    component.form.setValue({
      first_name: '  Walkin  ', last_name: '  Guest  ', email: 'walkin@example.com', phone_no: '  9000000099  ',
      totalPrice: 4000,
      shopcart: [{ passTypeId: 'pt1', quantity: 1 }]
    });
    const created = new Ticket(501, 'Walkin', 'Guest', 'walkin@example.com', '9000000099', 'SPOT-123', 'Not Yet', 4000, [], 't501');
    boxOfficeServiceSpy.createBoxOfficeTicket.and.returnValue(of(created));
    const registeredSpy = spyOn(component.registered, 'emit');

    component.save();

    expect(boxOfficeServiceSpy.createBoxOfficeTicket).toHaveBeenCalledWith(jasmine.objectContaining({
      eventId: 'evt1', first_name: 'Walkin', last_name: 'Guest', email: 'walkin@example.com', phone_no: '9000000099', totalPrice: 4000
    }));
    const payload = boxOfficeServiceSpy.createBoxOfficeTicket.calls.mostRecent().args[0];
    expect((payload as any).order_id).toBeUndefined();
    expect((payload as any).transaction_id).toBeUndefined();
    expect(notificationSpy.openSucessSnackBar).toHaveBeenCalled();
    expect(registeredSpy).toHaveBeenCalledWith(created);
    expect(component.saving).toBeFalse();
  });

  it('save() shows an error and does nothing without an active event', () => {
    component.form.setValue({
      first_name: 'Walkin', last_name: 'Guest', email: 'walkin@example.com', phone_no: '9000000099',
      totalPrice: 4000,
      shopcart: [{ passTypeId: 'pt1', quantity: 1 }]
    });
    activeEventSubject.next(null);

    component.save();

    expect(boxOfficeServiceSpy.createBoxOfficeTicket).not.toHaveBeenCalled();
    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('No event selected');
  });

  it('save() shows an error toast and does not emit registered on failure', () => {
    component.form.setValue({
      first_name: 'Walkin', last_name: 'Guest', email: 'walkin@example.com', phone_no: '9000000099',
      totalPrice: 4000,
      shopcart: [{ passTypeId: 'pt1', quantity: 1 }]
    });
    boxOfficeServiceSpy.createBoxOfficeTicket.and.returnValue(throwError(() => ({ error: { message: 'Server error' } })));
    const registeredSpy = spyOn(component.registered, 'emit');

    component.save();

    expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Server error');
    expect(registeredSpy).not.toHaveBeenCalled();
    expect(component.saving).toBeFalse();
  });

  it('cancel() emits cancelled', () => {
    const cancelledSpy = spyOn(component.cancelled, 'emit');
    component.cancel();
    expect(cancelledSpy).toHaveBeenCalled();
  });
});
