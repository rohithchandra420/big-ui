import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { MatMenuModule } from '@angular/material/menu';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { delay } from 'rxjs/operators';

import { BookingsComponent } from './bookings.component';
import { BoxOfficeService } from '../box-office.service';
import { EventService } from '../../core/event.service';
import { Ticket } from '../../models/ticket.model';
import { EventItem } from '../../models/event.model';
import { EmailBatch } from '../../models/email.model';
import { EmailService } from '../../core/email.service';
import { EmailBatchTrackerService } from '../../core/email-batch-tracker.service';
import { EmailDialogsService } from '../email/email-dialogs.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';

const mockBatch: EmailBatch = { id: 'b1', type: 'ticket', total: 1, done: 0, sent: 0, failed: 0, skipped: 0, finished: false, startedAt: '', finishedAt: null };

const mockActiveEvent = { _id: 'evt1', name: 'Test Event', description: '', status: 'active' } as EventItem;

const mockBookings: Ticket[] = [
  new Ticket(1, 'Arjun', 'Mehta', 'arjun@example.com', '9000000001', 'TXN1', 'sent', 100, [
    { item_name: 'Festival Ticket', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: true, isActive: true } as any,
    { item_name: 'Camping', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: false, isActive: true } as any,
  ], 't1'),
  new Ticket(2, 'Priya', 'Nair', 'priya@example.com', '9000000002', 'TXN2', 'not_sent', 50, [
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
  let canSend: boolean;
  let emailDialogsSpy: jasmine.SpyObj<EmailDialogsService>;
  let finished$: Subject<EmailBatch>;

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

    canSend = true;
    emailDialogsSpy = jasmine.createSpyObj('EmailDialogsService', ['openTicketEmail', 'openCustomEmail']);
    emailDialogsSpy.openTicketEmail.and.returnValue(of(mockBatch));
    emailDialogsSpy.openCustomEmail.and.returnValue(of({ ...mockBatch, type: 'custom' } as EmailBatch));
    finished$ = new Subject<EmailBatch>();

    await TestBed.configureTestingModule({
      // app-select/app-option declared for real: the Ticket Email filter binds
      // [(ngModel)] on <app-select>, which needs its value accessor.
      declarations: [BookingsComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule, MatMenuModule, NoopAnimationsModule],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: EventService, useValue: eventServiceStub },
        { provide: EmailService, useValue: { canSend: () => of(canSend), canSendTicket: () => of(canSend), canSendCustom: () => of(canSend) } },
        { provide: EmailDialogsService, useValue: emailDialogsSpy },
        { provide: EmailBatchTrackerService, useValue: { finished$: finished$.asObservable() } },
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

  it('computes emailsSentCount from the Ticket Email status', () => {
    expect(component.emailsSentCount).toBe(1);
  });

  it('computes admittedCount across all shopcart items', () => {
    expect(component.admittedCount).toBe(1);
  });

  it('computes spotRegistrationCount for tickets with a SPOT- transaction_id', () => {
    component.bookings = [
      ...mockBookings,
      new Ticket(3, 'Walkin', 'Guest', 'walkin@example.com', '9000000099', 'SPOT-123', 'not_sent', 10, [], 't3'),
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

  describe('festivalPassCount() (bug fix 2026-08-20)', () => {
    it('counts only Festival Pass items, not the whole shopcart', () => {
      // mockBookings[0]'s shopcart is 1 Festival Ticket + 1 Camping (Tent) item.
      expect(component.festivalPassCount(mockBookings[0].shopcart)).toBe(1);
    });

    it('returns 0 for an empty or undefined shopcart', () => {
      expect(component.festivalPassCount([])).toBe(0);
      expect(component.festivalPassCount(undefined)).toBe(0);
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
        new Ticket(3, 'Walkin', 'Guest', 'walkin@example.com', '9000000099', 'SPOT-123', 'not_sent', 10, [], 't3'),
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

    it('filters by Ticket Email status', () => {
      component.emailStatusFilter = 'sent';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t1']);
      component.emailStatusFilter = 'not_sent';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t2']);
      component.emailStatusFilter = 'bounced';
      expect(component.filteredBookings.length).toBe(0);
      component.emailStatusFilter = '';
      expect(component.filteredBookings.length).toBe(2);
    });

    it('combines the Ticket Email status filter with search', () => {
      component.emailStatusFilter = 'sent';
      component.searchTerm = 'priya';
      expect(component.filteredBookings.length).toBe(0);
    });

    it('offers every Ticket Email status, including Bounced, as a fixed list', () => {
      expect(component.emailStatusOptions.map(o => o.value))
        .toEqual(['not_sent', 'sending', 'sent', 'bounced', 'failed', 'no_email']);
      // Same array every change-detection pass (no re-created <app-option>s)
      expect(component.emailStatusOptions).toBe(component.emailStatusOptions);
    });

    it('shows the bounce reason for a bounced booking', () => {
      const bounced = { ...mockBookings[0], ticketEmail: { status: 'bounced', error: 'mailbox does not exist' } } as any;
      expect(component.emailStatusLabel(bounced)).toBe('Bounced');
      expect(component.emailStatusBadge(bounced)).toBe('br');
      expect(component.emailStatusError(bounced)).toBe('mailbox does not exist');
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

    it('openPanel resets the attendee list, so a previous Allocate Tent / Counter Form is not shown', () => {
      // The panel is hidden, not destroyed, on close — the attendee list survives between opens.
      const attendeeList = jasmine.createSpyObj('AttendeeListComponent', ['resetView']);
      component.attendeeList = attendeeList;
      component.openPanel(mockBookings[1]);
      expect(attendeeList.resetView).toHaveBeenCalled();
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

  describe('buildExportRows()', () => {
    it('flattens one row per shopcart item, matching the Bulk Upload import column shape', () => {
      const rows = component.buildExportRows(mockBookings);

      expect(rows).toEqual([
        { order_id: 1, item_name: 'Festival Ticket', item_quantity: 1, billing_first_name: 'Arjun', billing_last_name: 'Mehta', phone_no: '9000000001', billing_email: 'arjun@example.com', transaction_id: 'TXN1', order_total: 100 },
        { order_id: 1, item_name: 'Camping', item_quantity: 1, billing_first_name: 'Arjun', billing_last_name: 'Mehta', phone_no: '9000000001', billing_email: 'arjun@example.com', transaction_id: 'TXN1', order_total: 100 },
        { order_id: 2, item_name: 'Day Pass', item_quantity: 1, billing_first_name: 'Priya', billing_last_name: 'Nair', phone_no: '9000000002', billing_email: 'priya@example.com', transaction_id: 'TXN2', order_total: 50 },
      ]);
    });

    it('returns an empty array for a booking with no shopcart', () => {
      const ticket = new Ticket(4, 'No', 'Items', 'x@example.com', '9', 'TXN4', 'sent', 0, undefined, 't4');
      expect(component.buildExportRows([ticket])).toEqual([]);
    });

    it('falls back to passTypeName when item_name is missing (passes created via the current Box Office flow)', () => {
      const ticket = new Ticket(5, 'Kavya', 'Reddy', 'kavya@example.com', '9000000003', 'TXN5', 'sent', 200, [
        { passTypeName: 'Solo Tent', item_quantity: 1, order_id: 5, admissionId: null as any, isAdmitted: false, isActive: true } as any,
      ], 't5');

      const rows = component.buildExportRows([ticket]);

      expect(rows[0].item_name).toBe('Solo Tent');
    });
  });

  describe('exportBookings()', () => {
    it('does nothing when there are no bookings loaded', () => {
      component.bookings = [];
      expect(() => component.exportBookings()).not.toThrow();
    });
  });

  describe('emails (Email epic)', () => {
    it('shows the Email menu only to people who can send', () => {
      const btn = () => Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Email ▾'));
      expect(btn()).toBeTruthy();
      expect(btn()!.disabled).toBeTrue();
      component.toggleRow('t1');
      fixture.detectChanges();
      expect(btn()!.disabled).toBeFalse();
    });

    it('hides the Email menu when the user cannot send', () => {
      canSend = false;
      component.ngOnInit();
      fixture.detectChanges();
      const btn = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Email ▾'));
      expect(btn).toBeUndefined();
    });

    it('sends Ticket Emails for the selected bookings and reloads', () => {
      component.toggleRow('t2');
      component.toggleRow('t1');
      boxOfficeServiceSpy.getAllTickets.calls.reset();
      component.sendTicketEmails();
      const tickets = emailDialogsSpy.openTicketEmail.calls.mostRecent().args[0];
      expect(tickets.map(t => t._id)).toEqual(['t1', 't2']);
      expect(boxOfficeServiceSpy.getAllTickets).toHaveBeenCalled();
    });

    it('does nothing with no bookings selected', () => {
      component.sendTicketEmails();
      component.sendCustomEmails();
      expect(emailDialogsSpy.openTicketEmail).not.toHaveBeenCalled();
      expect(emailDialogsSpy.openCustomEmail).not.toHaveBeenCalled();
    });

    it('opens the Custom Email dialog for the selection', () => {
      component.toggleRow('t2');
      component.sendCustomEmails();
      expect(emailDialogsSpy.openCustomEmail.calls.mostRecent().args[0].map(t => t._id)).toEqual(['t2']);
    });

    it('reloads bookings when a background send finishes', () => {
      boxOfficeServiceSpy.getAllTickets.calls.reset();
      finished$.next({ ...mockBatch, finished: true });
      expect(boxOfficeServiceSpy.getAllTickets).toHaveBeenCalled();
    });

    it('keeps the open panel on the fresh copy after a reload', () => {
      component.openPanel(mockBookings[1]);
      const fresh = mockBookings.map(b => Object.assign(Object.create(Object.getPrototypeOf(b)), b));
      fresh[1].ticketEmail = { status: 'sent' };
      boxOfficeServiceSpy.getAllTickets.and.returnValue(of(fresh as any));
      component.loadBookings();
      expect(component.activeBooking).toBe(fresh[1]);
    });

    it('labels the Ticket Email status and explains failures', () => {
      const t = new Ticket(9, 'A', 'B', 'a@example.com', '9', 'TXN9', 'failed', 1, [], 't9');
      t.ticketEmail.error = 'Mailbox full';
      expect(component.emailStatusLabel(t)).toBe('Failed');
      expect(component.emailStatusBadge(t)).toBe('br');
      expect(component.emailStatusError(t)).toBe('Mailbox full');
      expect(component.emailStatusLabel(mockBookings[0])).toBe('Sent');
      expect(component.emailStatusError(mockBookings[0])).toBe('');
      expect(component.emailStatusLabel({ ticketEmail: undefined } as any)).toBe('Not sent');
    });
  });
});
