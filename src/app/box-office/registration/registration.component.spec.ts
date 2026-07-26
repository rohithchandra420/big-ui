import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';

import { RegistrationComponent } from './registration.component';
import { BoxOfficeService } from '../box-office.service';
import { Ticket } from '../../models/ticket.model';

const mockBookings: Ticket[] = [
  new Ticket(1, 'Arjun', 'Mehta', 'arjun@example.com', '9000000001', 'TXN1', 'Yes', 100, [
    { item_name: 'Festival Ticket', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: true, isActive: true, name: 'Arjun Mehta', phone_no: '9000000001', email: 'arjun@example.com' } as any,
    { item_name: 'Camping', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: false, isActive: true, name: '', phone_no: '', email: '' } as any,
  ], 't1'),
  new Ticket(2, 'Priya', 'Nair', 'priya@example.com', '9000000002', 'TXN2', 'Not Yet', 50, [
    { item_name: 'Day Pass', item_quantity: 1, order_id: 2, admissionId: null as any, isAdmitted: false, isActive: true, name: 'Priya Nair', phone_no: '9000000002', email: '' } as any,
  ], 't2'),
];

describe('RegistrationComponent', () => {
  let component: RegistrationComponent;
  let fixture: ComponentFixture<RegistrationComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  beforeEach(async () => {
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['getAllTickets', 'searchTickets']);
    boxOfficeServiceSpy.getAllTickets.and.returnValue(of(mockBookings as any));
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      declarations: [RegistrationComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: MatDialog, useValue: dialogSpy },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(RegistrationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads bookings on init', () => {
    expect(boxOfficeServiceSpy.getAllTickets).toHaveBeenCalled();
    expect(component.bookings).toEqual(mockBookings);
  });

  it('computes totalAttendees across all bookings', () => {
    expect(component.totalAttendees).toBe(3);
  });

  it('computes admittedCount', () => {
    expect(component.admittedCount).toBe(1);
  });

  it('computes pendingAdmitsCount', () => {
    expect(component.pendingAdmitsCount).toBe(2);
  });

  it('computes incompleteDetailsCount for items missing name/phone/email', () => {
    expect(component.incompleteDetailsCount).toBe(2);
  });

  it('computes spotRegistrationsCount for tickets with a SPOT- transaction_id', () => {
    component.bookings = [
      ...mockBookings,
      new Ticket(3, 'Walkin', 'Guest', 'walkin@example.com', '9000000099', 'SPOT-123', 'Not Yet', 10, [], 't3'),
    ];
    expect(component.spotRegistrationsCount).toBe(1);
  });

  it('passChips() groups a booking\'s shopcart item names, tagged by pass type, for the Look Up result cards', () => {
    expect(component.passChips(mockBookings[0])).toEqual([
      { label: 'Festival Ticket', festival: true },
      { label: 'Camping', festival: false },
    ]);
  });

  describe('lookUp()', () => {
    it('does nothing when the search term is empty', () => {
      component.searchTerm = '   ';
      component.lookUp();
      expect(boxOfficeServiceSpy.searchTickets).not.toHaveBeenCalled();
    });

    it('navigates straight to the booking when exactly one result comes back', () => {
      boxOfficeServiceSpy.searchTickets.and.returnValue(of([mockBookings[0]] as any));
      component.searchTerm = 'Arjun';

      component.lookUp();

      expect(boxOfficeServiceSpy.searchTickets).toHaveBeenCalledWith('Arjun');
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/box-office/registration', 't1']);
      expect(component.searching).toBeFalse();
      expect(component.searched).toBeTrue();
    });

    it('shows a result list when there are multiple matches', () => {
      boxOfficeServiceSpy.searchTickets.and.returnValue(of(mockBookings as any));
      component.searchTerm = 'a';

      component.lookUp();
      fixture.detectChanges();

      expect(routerSpy.navigate).not.toHaveBeenCalled();
      expect(component.searchResults).toEqual(mockBookings);
    });

    it('leaves searchResults empty and marks searched when nothing matches', () => {
      boxOfficeServiceSpy.searchTickets.and.returnValue(of([]));
      component.searchTerm = 'nobody';

      component.lookUp();

      expect(component.searchResults).toEqual([]);
      expect(component.searched).toBeTrue();
    });

    it('marks searched (with no results) when the request fails', () => {
      boxOfficeServiceSpy.searchTickets.and.returnValue(throwError(() => new Error('fail')));
      component.searchTerm = 'anything';

      component.lookUp();

      expect(component.searching).toBeFalse();
      expect(component.searched).toBeTrue();
      expect(component.searchResults).toEqual([]);
    });
  });

  it('goToBooking navigates to /box-office/registration/:id', () => {
    component.goToBooking('t1');
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/box-office/registration', 't1']);
  });

  describe('spot registration', () => {
    it('openSpotRegistration shows the form', () => {
      component.openSpotRegistration();
      expect(component.showSpotRegistration).toBeTrue();
    });

    it('onSpotRegistrationRegistered hides the form and navigates to the new booking', () => {
      component.openSpotRegistration();
      component.onSpotRegistrationRegistered(mockBookings[0]);
      expect(component.showSpotRegistration).toBeFalse();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/box-office/registration', 't1']);
    });

    it('onSpotRegistrationCancelled hides the form without navigating', () => {
      component.openSpotRegistration();
      component.onSpotRegistrationCancelled();
      expect(component.showSpotRegistration).toBeFalse();
      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });
  });

  describe('openScanner()', () => {
    it('opens the scanner dialog and navigates to the scanned booking on close', () => {
      const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of('t1') }) as MatDialogRef<any>;
      dialogSpy.open.and.returnValue(afterClosedSpy);

      component.openScanner();

      expect(dialogSpy.open).toHaveBeenCalled();
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/box-office/registration', 't1']);
    });

    it('does not navigate when the dialog closes without a scan result', () => {
      const afterClosedSpy = jasmine.createSpyObj({ afterClosed: of(null) }) as MatDialogRef<any>;
      dialogSpy.open.and.returnValue(afterClosedSpy);

      component.openScanner();

      expect(routerSpy.navigate).not.toHaveBeenCalled();
    });
  });
});
