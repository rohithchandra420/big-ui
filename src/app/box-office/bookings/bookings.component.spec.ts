import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';

import { BookingsComponent } from './bookings.component';
import { BoxOfficeService } from '../box-office.service';
import { EventService } from '../../core/event.service';
import { Ticket } from '../../models/ticket.model';
import { EventItem } from '../../models/event.model';

const mockActiveEvent = { _id: 'evt1', name: 'Test Event', description: '', status: 'active' } as EventItem;

const mockBookings: Ticket[] = [
  new Ticket(1, 'Arjun', 'Mehta', 'arjun@example.com', '9000000001', 'TXN1', 'Yes', 100, [
    { item_name: 'Festival Ticket', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: true, isActive: true } as any,
    { item_name: 'Camping', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: false, isActive: true } as any,
  ], 't1'),
  new Ticket(2, 'Priya', 'Nair', 'priya@example.com', '9000000002', 'TXN2', 'Not Yet', 50, [
    { item_name: 'Day Pass', item_quantity: 1, order_id: 2, admissionId: null as any, isAdmitted: false, isActive: true } as any,
  ], 't2'),
];

describe('BookingsComponent', () => {
  let component: BookingsComponent;
  let fixture: ComponentFixture<BookingsComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let activeEventSubject: BehaviorSubject<EventItem | null>;
  let eventServiceStub: { activeEvent: BehaviorSubject<EventItem | null>, currentActiveEvent: EventItem | null };

  beforeEach(async () => {
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['getAllTickets']);
    boxOfficeServiceSpy.getAllTickets.and.returnValue(of(mockBookings as any));
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    activeEventSubject = new BehaviorSubject<EventItem | null>(mockActiveEvent);
    eventServiceStub = {
      activeEvent: activeEventSubject,
      get currentActiveEvent() { return activeEventSubject.value; }
    };

    await TestBed.configureTestingModule({
      declarations: [BookingsComponent],
      imports: [FormsModule],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: EventService, useValue: eventServiceStub },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(BookingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads bookings on init', () => {
    expect(boxOfficeServiceSpy.getAllTickets).toHaveBeenCalled();
    expect(component.bookings).toEqual(mockBookings);
  });

  it('stops loading when the fetch fails', () => {
    boxOfficeServiceSpy.getAllTickets.and.returnValue(throwError(() => new Error('fail')));
    component.loadBookings();
    expect(component.loading).toBeFalse();
  });

  it('computes emailsSentCount from hasEmailSent', () => {
    expect(component.emailsSentCount).toBe(1);
  });

  it('computes admittedCount across all shopcart items', () => {
    expect(component.admittedCount).toBe(1);
  });

  it('computes spotRegistrationCount for tickets with a SPOT- transaction_id', () => {
    component.bookings = [
      ...mockBookings,
      new Ticket(3, 'Walkin', 'Guest', 'walkin@example.com', '9000000099', 'SPOT-123', 'Not Yet', 10, [], 't3'),
    ];
    expect(component.spotRegistrationCount).toBe(1);
  });

  describe('passSummary()', () => {
    it('summarises item names with counts', () => {
      expect(component.passSummary(mockBookings[0])).toBe('Festival Ticket, Camping');
    });

    it('returns an em-dash when there is no shopcart', () => {
      expect(component.passSummary({ shopcart: [] } as any)).toBe('—');
    });
  });

  describe('filteredBookings', () => {
    it('returns all bookings with no filter or search', () => {
      expect(component.filteredBookings.length).toBe(2);
    });

    it('filters to emails-sent bookings when that stat is active', () => {
      component.toggleFilter('emailSent');
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t1']);
    });

    it('filters to admitted bookings when that stat is active', () => {
      component.toggleFilter('admitted');
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t1']);
    });

    it('filters to spot-registered bookings when that stat is active', () => {
      component.bookings = [
        ...mockBookings,
        new Ticket(3, 'Walkin', 'Guest', 'walkin@example.com', '9000000099', 'SPOT-123', 'Not Yet', 10, [], 't3'),
      ];
      component.toggleFilter('spotRegistration');
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t3']);
    });

    it('toggling the same filter twice clears it', () => {
      component.toggleFilter('admitted');
      component.toggleFilter('admitted');
      expect(component.activeFilter).toBeNull();
      expect(component.filteredBookings.length).toBe(2);
    });

    it('filters by search term across name, email and ticket id', () => {
      component.searchTerm = 'priya';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t2']);
    });
  });

  describe('pagination', () => {
    it('pagedBookings slices filteredBookings by pageIndex/pageSize', () => {
      component.pageSize = 1;
      component.pageIndex = 1;
      expect(component.pagedBookings.map(b => b._id)).toEqual(['t2']);
    });

    it('onPageChange updates pageIndex and pageSize', () => {
      component.onPageChange({ pageIndex: 1, pageSize: 50, length: 2 } as any);
      expect(component.pageIndex).toBe(1);
      expect(component.pageSize).toBe(50);
    });
  });

  describe('row selection', () => {
    it('toggleRow adds and removes a booking id', () => {
      component.toggleRow('t1');
      expect(component.selectedIds.has('t1')).toBeTrue();
      component.toggleRow('t1');
      expect(component.selectedIds.has('t1')).toBeFalse();
    });

    it('allPagedSelected is true only when every paged row is selected', () => {
      expect(component.allPagedSelected).toBeFalse();
      component.toggleRow('t1');
      component.toggleRow('t2');
      expect(component.allPagedSelected).toBeTrue();
    });

    it('somePagedSelected reflects an indeterminate state', () => {
      component.toggleRow('t1');
      expect(component.somePagedSelected).toBeTrue();
      expect(component.allPagedSelected).toBeFalse();
    });

    it('toggleSelectAllPaged selects all when none are fully selected, then clears them', () => {
      component.toggleSelectAllPaged();
      expect(component.allPagedSelected).toBeTrue();
      component.toggleSelectAllPaged();
      expect(component.selectedIds.size).toBe(0);
    });
  });

  describe('detail panel', () => {
    it('openPanel sets the active booking and opens the panel', () => {
      component.openPanel(mockBookings[0]);
      expect(component.activeBooking).toBe(mockBookings[0]);
      expect(component.panelOpen).toBeTrue();
    });

    it('openPanel resets editingTicket back to false', () => {
      component.editingTicket = true;
      component.openPanel(mockBookings[0]);
      expect(component.editingTicket).toBeFalse();
    });

    it('onTicketSaved updates the active booking\'s fields in place and exits edit mode', () => {
      // Clone so this test's mutation never touches the shared mockBookings fixture.
      const localBooking = { ...mockBookings[0] } as Ticket;
      component.bookings = [localBooking];
      component.openPanel(localBooking);
      component.editingTicket = true;

      component.onTicketSaved({ ...localBooking, first_name: 'Kavya', last_name: 'Reddy', email: 'kavya@example.com', phone_no: '9000000009' } as Ticket);

      expect(component.activeBooking!.first_name).toBe('Kavya');
      expect(component.activeBooking!.last_name).toBe('Reddy');
      expect(component.activeBooking!.email).toBe('kavya@example.com');
      expect(component.activeBooking!.phone_no).toBe('9000000009');
      expect(component.editingTicket).toBeFalse();
      // Same object reference as the table row — mutation is visible there too.
      expect(component.bookings[0].first_name).toBe('Kavya');
    });

    it('goToRegistration navigates to the active booking\'s Registration page', () => {
      component.openPanel(mockBookings[0]);
      component.goToRegistration();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/box-office/registration', 't1']);
    });

    it('goToRegistration does nothing without an active booking', () => {
      component.goToRegistration();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });

    it('closePanel refreshes bookings and closes once the fetch resolves quickly', fakeAsync(() => {
      component.openPanel(mockBookings[0]);
      const refreshed = [mockBookings[0]];
      boxOfficeServiceSpy.getAllTickets.and.returnValue(of(refreshed as any));

      component.closePanel();
      tick(0);

      expect(component.bookings).toEqual(refreshed);
      expect(component.panelOpen).toBeFalse();
      expect(component.refreshing).toBeFalse();
    }));

    it('closePanel closes immediately and shows a refresh indicator if the fetch is slow', fakeAsync(() => {
      component.openPanel(mockBookings[0]);
      boxOfficeServiceSpy.getAllTickets.and.returnValue(of(mockBookings as any).pipe(delay(1000)));

      component.closePanel();
      tick(300);

      expect(component.panelOpen).toBeFalse();
      expect(component.refreshing).toBeTrue();

      tick(700);

      expect(component.refreshing).toBeFalse();
    }));

    it('closePanel closes even when the refresh fetch fails', fakeAsync(() => {
      component.openPanel(mockBookings[0]);
      boxOfficeServiceSpy.getAllTickets.and.returnValue(throwError(() => new Error('fail')));

      component.closePanel();
      tick(0);

      expect(component.panelOpen).toBeFalse();
      expect(component.refreshing).toBeFalse();
    }));

    it('Escape closes the panel when it is open', fakeAsync(() => {
      component.openPanel(mockBookings[0]);
      boxOfficeServiceSpy.getAllTickets.and.returnValue(of(mockBookings as any));

      component.onEscape();
      tick(0);

      expect(component.panelOpen).toBeFalse();
    }));

    it('Escape does nothing when the panel is already closed', () => {
      boxOfficeServiceSpy.getAllTickets.calls.reset();
      component.onEscape();
      expect(boxOfficeServiceSpy.getAllTickets).not.toHaveBeenCalled();
    });
  });

  describe('openBulkUpload()', () => {
    it('opens the bulk upload dialog and refreshes bookings when tickets were created', () => {
      const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of(3) }) as MatDialogRef<any>;
      dialogSpy.open.and.returnValue(afterClosedSpy);
      boxOfficeServiceSpy.getAllTickets.calls.reset();
      boxOfficeServiceSpy.getAllTickets.and.returnValue(of(mockBookings as any));

      component.openBulkUpload();

      expect(dialogSpy.open).toHaveBeenCalled();
      expect(boxOfficeServiceSpy.getAllTickets).toHaveBeenCalled();
    });

    it('does not refresh bookings when the dialog is cancelled', () => {
      const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of(null) }) as MatDialogRef<any>;
      dialogSpy.open.and.returnValue(afterClosedSpy);
      boxOfficeServiceSpy.getAllTickets.calls.reset();

      component.openBulkUpload();

      expect(boxOfficeServiceSpy.getAllTickets).not.toHaveBeenCalled();
    });
  });
});
