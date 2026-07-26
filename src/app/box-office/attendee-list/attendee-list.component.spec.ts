import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of, throwError } from 'rxjs';

import { AttendeeListComponent } from './attendee-list.component';
import { BoxOfficeService } from '../box-office.service';
import { AccomodationService } from '../../accomodation/accomodation.service';
import { NotificationService } from '../../core/notification.service';
import { Ticket } from '../../models/ticket.model';
import { Tent } from '../../models/tent.model';

const mockTicket: Ticket = new Ticket(1, 'Arjun', 'Mehta', 'arjun@example.com', '9000000001', 'TXN1', 'Yes', 100, [
  { _id: 's1', item_name: 'Festival Ticket', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: true, isActive: true, name: 'Arjun Mehta', phone_no: '9000000001', email: 'arjun@example.com' } as any,
  { _id: 's2', item_name: 'Camping', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: false, isActive: true, name: '', phone_no: '', email: '' } as any,
], 't1');

describe('AttendeeListComponent', () => {
  let component: AttendeeListComponent;
  let fixture: ComponentFixture<AttendeeListComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let accomodationServiceSpy: jasmine.SpyObj<AccomodationService>;
  let notificationSpy: jasmine.SpyObj<NotificationService>;

  const configureWith = (ticket: Ticket) => {
    TestBed.resetTestingModule();
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['checkIn']);
    accomodationServiceSpy = jasmine.createSpyObj('AccomodationService', ['getTentById', 'vacateTentSlot']);
    accomodationServiceSpy.getTentById.and.returnValue(of({} as Tent));
    notificationSpy = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);

    TestBed.configureTestingModule({
      declarations: [AttendeeListComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: AccomodationService, useValue: accomodationServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });

    fixture = TestBed.createComponent(AttendeeListComponent);
    component = fixture.componentInstance;
    component.ticket = ticket;
    fixture.detectChanges();
  };

  beforeEach(() => configureWith(mockTicket));

  it('loads tent details for any allocatedTentId on the input ticket', () => {
    // TestBed.createComponent() doesn't run through a parent template binding,
    // so plain property assignment doesn't trigger ngOnChanges the way the real
    // [ticket]="..." bindings in BookingFoundComponent/BookingsComponent do —
    // invoke it explicitly here to simulate that.
    const ticketWithTent = { ...mockTicket, shopcart: [{ ...mockTicket.shopcart![1], allocatedTentId: 'tent1' } as any] } as Ticket;
    configureWith(ticketWithTent);
    component.ngOnChanges({ ticket: {} as any });
    expect(accomodationServiceSpy.getTentById).toHaveBeenCalledWith('tent1');
  });

  describe('sortedShopcart', () => {
    it('lists Festival Pass rows before Tent Pass rows, keeping original order within each group', () => {
      const localTicket = {
        ...mockTicket,
        shopcart: [
          { _id: 'tent1', item_name: 'Camping' } as any,
          { _id: 'fest1', item_name: 'Festival Ticket' } as any,
          { _id: 'tent2', item_name: 'Solo Tent' } as any,
          { _id: 'fest2', item_name: 'Day Pass' } as any,
        ]
      } as Ticket;
      component.ticket = localTicket;

      expect(component.sortedShopcart.map(i => i._id)).toEqual(['fest1', 'fest2', 'tent1', 'tent2']);
    });
  });

  describe('isDetailsComplete()', () => {
    it('is true when name/phone/email are all present', () => {
      expect(component.isDetailsComplete(mockTicket.shopcart![0])).toBeTrue();
    });

    it('is false when any field is missing', () => {
      expect(component.isDetailsComplete(mockTicket.shopcart![1])).toBeFalse();
    });
  });

  describe('isFestivalPass()', () => {
    it('is true for Festival Ticket items', () => {
      expect(component.isFestivalPass(mockTicket.shopcart![0])).toBeTrue();
    });

    it('is false for tent pass items', () => {
      expect(component.isFestivalPass(mockTicket.shopcart![1])).toBeFalse();
    });
  });

  describe('attendeeInitials()', () => {
    it('returns the first letter of the name, uppercased', () => {
      expect(component.attendeeInitials(mockTicket.shopcart![0])).toBe('A');
    });

    it('returns "?" when there is no name', () => {
      expect(component.attendeeInitials(mockTicket.shopcart![1])).toBe('?');
    });
  });

  describe('counter form', () => {
    it('openCounterForm sets activeCounterItem', () => {
      component.openCounterForm(mockTicket.shopcart![1]);
      expect(component.activeCounterItem).toBe(mockTicket.shopcart![1]);
    });

    it('onCounterFormSaved replaces the matching shopcart item and clears activeCounterItem', () => {
      const localTicket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i })) } as Ticket;
      component.ticket = localTicket;

      const target = localTicket.shopcart![1];
      component.openCounterForm(target);

      const updated = { ...target, name: 'Kavya Reddy', phone_no: '9000000009', email: 'kavya@example.com' } as any;
      component.onCounterFormSaved(updated);

      expect(component.ticket.shopcart![1]).toEqual(updated);
      expect(component.activeCounterItem).toBeNull();
    });

    it('onCounterFormCancelled clears activeCounterItem without changing shopcart', () => {
      component.openCounterForm(mockTicket.shopcart![1]);
      component.onCounterFormCancelled();
      expect(component.activeCounterItem).toBeNull();
    });
  });

  describe('allowEdit input (Bookings-panel-only Edit action)', () => {
    const editButton = (): HTMLButtonElement | undefined =>
      (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
        .find(b => b.textContent?.trim() === 'Edit');

    it('defaults to false — no Edit button rendered, even on a row with complete details', () => {
      expect(component.allowEdit).toBeFalse();
      expect(editButton()).toBeUndefined();
    });

    it('shows an Edit button on rows with complete details when true', () => {
      component.allowEdit = true;
      fixture.detectChanges();
      expect(editButton()).toBeDefined();
    });

    it('does not show an Edit button on rows with incomplete details, even when true', () => {
      component.allowEdit = true;
      fixture.detectChanges();
      // s1 (index 0, festival, complete) sorts before s2 (index 1, tent, incomplete) —
      // only one Edit button should exist, for the complete row.
      const editButtons = (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[])
        .filter(b => b.textContent?.trim() === 'Edit');
      expect(editButtons.length).toBe(1);
    });

    it('clicking Edit opens the counter form for that item', () => {
      component.allowEdit = true;
      fixture.detectChanges();
      editButton()!.click();
      expect(component.activeCounterItem).toBe(mockTicket.shopcart![0]);
    });
  });

  describe('checkInAttendee()', () => {
    it('replaces the item with the checked-in version on success', () => {
      const localTicket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i })) } as Ticket;
      component.ticket = localTicket;

      const updated = { ...localTicket.shopcart![0], isAdmitted: true };
      boxOfficeServiceSpy.checkIn.and.returnValue(of(updated));

      component.checkInAttendee(localTicket.shopcart![0]);

      expect(boxOfficeServiceSpy.checkIn).toHaveBeenCalledWith('s1');
      expect(component.ticket.shopcart![0].isAdmitted).toBeTrue();
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalled();
    });

    it('shows an error notification on failure', () => {
      boxOfficeServiceSpy.checkIn.and.returnValue(throwError(() => ({ error: { message: 'Attendee details are incomplete' } })));

      component.checkInAttendee(mockTicket.shopcart![0]);

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Attendee details are incomplete');
    });
  });

  describe('allocate tent flow', () => {
    it('openAllocateTent sets activeAllocateItem', () => {
      component.openAllocateTent(mockTicket.shopcart![1]);
      expect(component.activeAllocateItem).toBe(mockTicket.shopcart![1]);
    });

    it('onTentAllocated caches the tent, updates both linked items, and clears activeAllocateItem', () => {
      const localTicket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i })) } as Ticket;
      component.ticket = localTicket;
      component.openAllocateTent(localTicket.shopcart![1]);

      const tent = { _id: 'tent1', tent_no: 'SH01' } as Tent;
      const updatedTentPass = { ...localTicket.shopcart![1], allocatedTentId: 'tent1', linkedPassId: 's1' };
      const updatedFestivalPass = { ...localTicket.shopcart![0], allocatedTentId: 'tent1', linkedPassId: 's2' };

      component.onTentAllocated({ tent, tentPassItem: updatedTentPass, festivalPassItem: updatedFestivalPass });

      expect(component.tentLookup['tent1']).toEqual(tent);
      expect(component.ticket.shopcart![1].allocatedTentId).toBe('tent1');
      expect(component.ticket.shopcart![0].allocatedTentId).toBe('tent1');
      expect(component.activeAllocateItem).toBeNull();
      expect(component.tentNoFor(component.ticket.shopcart![1])).toBe('SH01');
    });

    it('onAllocateCancelled clears activeAllocateItem', () => {
      component.openAllocateTent(mockTicket.shopcart![1]);
      component.onAllocateCancelled();
      expect(component.activeAllocateItem).toBeNull();
    });
  });

  describe('vacateAttendee()', () => {
    it('updates both linked items on success', () => {
      const localTicket = { ...mockTicket, shopcart: mockTicket.shopcart!.map(i => ({ ...i, allocatedTentId: 'tent1' })) } as Ticket;
      component.ticket = localTicket;

      const vacatedTentPass = { ...localTicket.shopcart![1], allocatedTentId: null, linkedPassId: null };
      const vacatedFestivalPass = { ...localTicket.shopcart![0], allocatedTentId: null, linkedPassId: null };
      accomodationServiceSpy.vacateTentSlot.and.returnValue(of({ tent: {} as Tent, tentPassItem: vacatedTentPass, festivalPassItem: vacatedFestivalPass }));

      component.vacateAttendee(localTicket.shopcart![1]);

      expect(accomodationServiceSpy.vacateTentSlot).toHaveBeenCalledWith('s2');
      expect(component.ticket.shopcart![1].allocatedTentId).toBeNull();
      expect(component.ticket.shopcart![0].allocatedTentId).toBeNull();
      expect(notificationSpy.openSucessSnackBar).toHaveBeenCalled();
    });

    it('shows an error notification on failure', () => {
      accomodationServiceSpy.vacateTentSlot.and.returnValue(throwError(() => ({ error: { message: 'Tent slot was already vacated' } })));

      component.vacateAttendee(mockTicket.shopcart![1]);

      expect(notificationSpy.openErrorSnackBar).toHaveBeenCalledWith('Tent slot was already vacated');
    });
  });
});
