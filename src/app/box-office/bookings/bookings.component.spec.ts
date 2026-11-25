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
import { AuthService } from '../../core/auth.service';
import { Ticket } from '../../models/ticket.model';
import { EventItem } from '../../models/event.model';
import { EmailBatch } from '../../models/email.model';
import { EmailService } from '../../core/email.service';
import { EmailBatchTrackerService } from '../../core/email-batch-tracker.service';
import { EmailDialogsService } from '../email/email-dialogs.service';
import { AppSelectComponent } from '../../shared/app-select/app-select.component';
import { AppOptionComponent } from '../../shared/app-select/app-option.component';
import { MultiSelectComponent } from '../../shared/multi-select/multi-select.component';
import { ViewModeService } from '../../core/view-mode.service';

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
  /** Phone cards: the stub answers "show cards?" with this (default: table, like a desktop). */
  let cardsOn: boolean;
  /** Phone width (phone toolbar instead of the filter bar), in either view. */
  let phoneOn: boolean;

  beforeEach(async () => {
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['getAllTickets', 'getTicketById', 'getPassTypes']);
    boxOfficeServiceSpy.getPassTypes.and.returnValue(of([]));
    boxOfficeServiceSpy.getAllTickets.and.returnValue(of(mockBookings as any));
    // Jumping to a linked booking re-reads it; by default the server sends nothing new.
    boxOfficeServiceSpy.getTicketById.and.returnValue(throwError(() => new Error('offline')));
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);
    activeEventSubject = new BehaviorSubject<EventItem | null>(mockActiveEvent);
    eventServiceStub = {
      activeEvent: activeEventSubject,
      get currentActiveEvent() { return activeEventSubject.value; }
    };

    canSend = true;
    emailDialogsSpy = jasmine.createSpyObj('EmailDialogsService', ['openTicketEmail', 'openCustomEmail', 'openCheckinEmail']);
    emailDialogsSpy.openTicketEmail.and.returnValue(of(mockBatch));
    emailDialogsSpy.openCustomEmail.and.returnValue(of({ ...mockBatch, type: 'custom' } as EmailBatch));
    finished$ = new Subject<EmailBatch>();
    cardsOn = false;
    phoneOn = false;

    await TestBed.configureTestingModule({
      // app-select/app-option declared for real: the Ticket Email filter binds
      // [(ngModel)] on <app-select>, which needs its value accessor.
      declarations: [BookingsComponent, AppSelectComponent, AppOptionComponent, MultiSelectComponent],
      imports: [FormsModule, MatMenuModule, NoopAnimationsModule],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: AuthService, useValue: { currentUser: null } },
        { provide: Router, useValue: routerSpy },
        { provide: MatDialog, useValue: dialogSpy },
        { provide: EventService, useValue: eventServiceStub },
        { provide: EmailService, useValue: { canSend: () => of(canSend), canSendTicket: () => of(canSend), canSendCustom: () => of(canSend), canSendCheckin: () => of(canSend) } },
        { provide: EmailDialogsService, useValue: emailDialogsSpy },
        { provide: EmailBatchTrackerService, useValue: { finished$: finished$.asObservable() } },
        { provide: ViewModeService, useValue: { cards: () => cardsOn, get isPhone() { return phoneOn; }, modeOf: () => 'table', setMode: () => {} } },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(BookingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe('External Booking Import (I2)', () => {
    const imported = Object.assign(new Ticket(null as any, 'Wren', 'Abernathy', 'wren@example.test', '919800000009', 'pay_X', 'not_sent', 1180, [], 't9'), {
      reference: 'TST5-WREN', kind: 'guest_list', paidAt: '2026-11-10T13:00:00.000Z', paymentOrderId: 'order_X', linkedReferences: ['TST5-LINK'], source: 'external'
    }) as Ticket;

    beforeEach(() => {
      component.bookings = [...mockBookings, imported];
      fixture.detectChanges();
    });

    it('shows the Booking ID (reference, else order number) and the payment method', () => {
      const rows = Array.from(fixture.nativeElement.querySelectorAll('tbody tr')) as HTMLElement[];
      const text = rows.map(r => r.textContent || '').join('|');
      expect(text).toContain('TST5-WREN');
      expect(text).toContain('Guest list');
      expect(component.bookingId(mockBookings[0])).toBe('1');
      expect(component.paymentMethod(mockBookings[0])).toBe('');
    });

    it('finds an imported booking by its reference or payment ids in the table search', () => {
      component.searchTerm = 'tst5-wren';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t9']);
      component.searchTerm = 'order_x';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t9']);
    });

    it('panel: payment ids under the Booking ID, Source box with the payment method; a link not in BiG cannot be opened', () => {
      component.openPanel(imported);
      fixture.detectChanges();
      const panel = fixture.nativeElement.querySelector('.panel') as HTMLElement;
      const head = panel.querySelector('.panel-hd') as HTMLElement;
      expect(head.textContent).toContain('Booking ID: TST5-WREN');
      expect(head.textContent).toContain('Order ID: order_X');
      expect(head.textContent).not.toContain('Payment ID:');
      const boxes = Array.from(panel.querySelectorAll('.pay-box')) as HTMLElement[];
      const sourceBox = boxes.find(b => b.textContent?.includes('Source'))!;
      expect(sourceBox.textContent).toContain('Sales system');
      expect(sourceBox.textContent).toContain('Payment method: Guest list');
      expect(sourceBox.textContent).not.toContain('order_X');
      expect(sourceBox.textContent).not.toContain('Paid');
      // TST5-LINK is not loaded: shown, not a button
      expect(panel.querySelector('button.bk-link')).toBeNull();
      const off = panel.querySelector('.bk-link-off') as HTMLElement;
      expect(off.textContent).toContain('TST5-LINK');
      expect(off.textContent).toContain('not in BiG yet');
    });

    it('shows Paid at and Source columns (I6)', () => {
      const head = (fixture.nativeElement.querySelector('thead') as HTMLElement).textContent || '';
      expect(head).toContain('Paid at');
      expect(head).toContain('Source');
      const text = (fixture.nativeElement.querySelector('tbody') as HTMLElement).textContent || '';
      expect(text).toContain('10 Nov 2026');
      expect(text).toContain('Sales system');
      expect(text).toContain('Bulk Upload');
    });

    it('labels the source: sales system, spot registration, else Bulk Upload', () => {
      expect(component.source(imported)).toBe('Sales system');
      expect(component.source(mockBookings[0])).toBe('Bulk Upload');
      const spot = new Ticket(3, 'S', 'R', 's@example.test', '9', 'SPOT-123', 'not_sent', 1, [], 't3');
      expect(component.source(spot)).toBe('Spot registration');
    });

    it('searches by payment method, source and the Paid at date (I6)', () => {
      component.searchTerm = 'guest list';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t9']);
      component.searchTerm = 'sales system';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t9']);
      component.searchTerm = '10 nov';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t9']);
      component.searchTerm = 'bulk upload';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['t1', 't2']);
    });

    it('sorts by Paid at (bookings with no date sort as empty)', () => {
      component.sort.toggle('paidAt');
      const ids = component.filteredBookings.map(b => b._id);
      expect(ids.length).toBe(3);
      expect(ids).toContain('t9');
    });

    it('names a linked booking that is loaded and lists the bookings linking back (I5)', () => {
      const target = Object.assign(new Ticket(null as any, 'Ansel', 'Quarrie', 'ansel@example.test', '919800000010', 'pay_Y', 'not_sent', 900, [], 't10'), {
        reference: 'TST5-LINK'
      }) as Ticket;
      component.bookings = [...mockBookings, imported, target];
      expect(component.linkedName('TST5-LINK')).toBe('Ansel Quarrie');
      expect(component.linkedName('NOT-HERE')).toBe('');
      expect(component.linkedFrom(target)).toEqual(['TST5-WREN']);
      expect(component.linkedFrom(imported)).toEqual([]);

      component.openPanel(target);
      fixture.detectChanges();
      const panel = fixture.nativeElement.querySelector('.panel') as HTMLElement;
      expect(panel.textContent).toContain('Linked from');
      const back = panel.querySelector('.bk-link-from') as HTMLButtonElement;
      expect(back.textContent).toContain('TST5-WREN');
      expect(back.textContent).toContain('(Wren Abernathy)');
      // Tap moves the panel to that booking (stays in place, no search)
      back.click();
      expect(component.activeBooking?._id).toBe('t9');
      expect(component.panelOpen).toBeTrue();
      expect(component.searchTerm).toBe('');

      fixture.detectChanges();
      const fwd = (fixture.nativeElement.querySelector('.panel') as HTMLElement).querySelector('button.bk-link') as HTMLButtonElement;
      expect(fwd.textContent).toContain('TST5-LINK');
      fwd.click();
      expect(component.activeBooking?._id).toBe('t10');
    });

    it('Allocate Tent: a linked pass\'s Booking ID opens that booking in the panel', () => {
      const target = Object.assign(new Ticket(null as any, 'Ansel', 'Quarrie', 'ansel@example.test', '919800000010', 'pay_Y', 'not_sent', 900, [], 't10'), {
        reference: 'TST5-LINK'
      }) as Ticket;
      component.bookings = [...mockBookings, imported, target];
      component.openPanel(imported);
      component.openByBookingId('TST5-LINK');
      expect(component.activeBooking?._id).toBe('t10');
      component.openByBookingId('2');
      expect(component.activeBooking?._id).toBe('t2');
      component.openByBookingId('NOT-HERE');
      expect(component.activeBooking?._id).toBe('t2');
    });

    it('jumping to a linked booking swaps in a fresh copy (a bed allocated / vacated since load)', () => {
      const stale = Object.assign(new Ticket(null as any, 'Ansel', 'Quarrie', 'ansel@example.test', '9', 'pay_Y', 'not_sent', 900,
        [{ _id: 'fp1', allocatedTentId: 'tentOld' } as any], 't10'), { reference: 'TST5-LINK' }) as Ticket;
      const fresh = Object.assign(new Ticket(null as any, 'Ansel', 'Quarrie', 'ansel@example.test', '9', 'pay_Y', 'not_sent', 900,
        [{ _id: 'fp1', allocatedTentId: null } as any], 't10'), { reference: 'TST5-LINK' }) as Ticket;
      component.bookings = [...mockBookings, imported, stale];
      boxOfficeServiceSpy.getTicketById.and.returnValue(of(fresh));
      component.openPanel(imported);
      component.jumpTo(stale);
      expect(boxOfficeServiceSpy.getTicketById).toHaveBeenCalledWith('t10');
      expect(component.activeBooking).toBe(fresh);
      expect(component.bookings.find(b => b._id === 't10')).toBe(fresh);
      expect(component.activeBooking!.shopcart![0].allocatedTentId).toBeNull();
    });

    it('a failed re-read keeps the list copy open', () => {
      const target = Object.assign(new Ticket(null as any, 'Ansel', 'Quarrie', 'a@example.test', '9', 'p', 'not_sent', 1, [], 't10'),
        { reference: 'TST5-LINK' }) as Ticket;
      component.bookings = [...mockBookings, imported, target];
      component.jumpTo(target);
      expect(component.activeBooking).toBe(target);
      expect(component.panelOpen).toBeTrue();
    });

    it('one Import button holds Bulk Upload and Import from sales system', () => {
      const trigger = fixture.nativeElement.querySelector('.page-ph .bk-add') as HTMLButtonElement;
      expect(trigger).toBeTruthy();
      trigger.click();
      fixture.detectChanges();
      const items = Array.from(document.querySelectorAll('.mat-mdc-menu-item')) as HTMLButtonElement[];
      expect(items.map(i => (i.textContent || '').trim())).toEqual(
        jasmine.arrayContaining([jasmine.stringMatching('Bulk Upload'), jasmine.stringMatching('Import from sales system')]));
      items.find(i => i.textContent?.includes('Import from sales system'))!.click();
      expect(component.importOpen).toBeTrue();
    });
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

  describe('who sees Bulk Upload (Box Office access rule)', () => {
    // Bulk Upload sits in the header's Import menu (I6): the menu button is the gate.
    const bulkButton = () => (fixture.nativeElement.querySelector('.page-ph .bk-add') as HTMLElement | null) || undefined;

    it('a Box Office volunteer works bookings but has no Bulk Upload', () => {
      const auth = TestBed.inject(AuthService) as any;
      auth.boxOfficeReadOnly = () => false;
      auth.canManageBoxOffice = () => false;
      fixture.detectChanges();
      expect(component.readOnly).toBeFalse();
      expect(bulkButton()).toBeUndefined();
    });

    it('the Box Office Team Lead has Bulk Upload', () => {
      const auth = TestBed.inject(AuthService) as any;
      auth.boxOfficeReadOnly = () => false;
      auth.canManageBoxOffice = () => true;
      fixture.detectChanges();
      expect(bulkButton()).toBeDefined();
    });

    it('a view-only person has neither Bulk Upload nor Export', () => {
      const auth = TestBed.inject(AuthService) as any;
      auth.boxOfficeReadOnly = () => true;
      auth.canManageBoxOffice = () => true;
      fixture.detectChanges();
      expect(component.canBulkUpload).toBeFalse();
      expect(bulkButton()).toBeUndefined();
    });
  });

  describe('Selected only chip', () => {
    it('shows just the ticked rows, and switches itself off once nothing is ticked', () => {
      const all = component.filteredBookings.length;
      expect(all).toBeGreaterThan(1);
      const [first] = component.filteredBookings;
      component.toggleSelectedOnly();
      expect(component.selectedOnly).toBeFalse();            // nothing ticked yet
      component.toggleRow(first._id!);
      component.toggleSelectedOnly();
      expect(component.selectedOnly).toBeTrue();
      expect(component.filteredBookings.map(b => b._id)).toEqual([first._id]);
      component.toggleRow(first._id!);                         // last tick removed
      expect(component.selectedOnly).toBeFalse();
      expect(component.filteredBookings.length).toBe(all);
    });

    it('still applies search on top', () => {
      const [a, b] = component.filteredBookings;
      component.toggleRow(a._id!);
      component.toggleRow(b._id!);
      component.toggleSelectedOnly();
      component.searchTerm = String(b.email);
      expect(component.filteredBookings.map(x => x._id)).toEqual([b._id]);
    });

    it('renders the chip, disabled until a row is ticked', () => {
      fixture.detectChanges();
      const input = () => (fixture.nativeElement as HTMLElement).querySelector('.bk-sel-chip input') as HTMLInputElement;
      expect(input().disabled).toBeTrue();
      component.toggleRow(component.filteredBookings[0]._id!);
      fixture.detectChanges();
      expect(input().disabled).toBeFalse();
      expect((fixture.nativeElement as HTMLElement).querySelector('.bk-sel-chip')?.textContent).toContain('Selected only (1)');
    });
  });

  describe('Pass type filter (B-083, with linked bookings)', () => {
    const item = (passType: string, extra: any = {}) => ({ passType, category: 'festival_pass', isActive: true, item_quantity: 1, isAdmitted: false, ...extra }) as any;
    let weekend: Ticket, tentOnly: Ticket, full: Ticket, plain: Ticket;

    beforeEach(() => {
      component.passTypes = [
        { _id: 'pt-full', name: 'Full Festival Pass', category: 'festival_pass' },
        { _id: 'pt-week', name: 'Weekend Pass', category: 'festival_pass' },
        { _id: 'pt-tent', name: 'Shared Tent', category: 'stay_pass' },
        { _id: 'pt-car', name: 'Car Pass', category: 'addon_pass' }
      ];
      weekend = new Ticket(41, 'Rhea', 'Moss', 'rhea@example.test', '9000000061', 'TXN41', 'not_sent', 10, [item('pt-week'), item('pt-week')], 'p1');
      weekend.reference = 'BK-41';
      tentOnly = new Ticket(42, 'Rhea', 'Moss', 'rhea@example.test', '9000000061', 'TXN42', 'not_sent', 10, [item('pt-tent', { category: 'stay_pass', beds: 2 })], 'p2');
      tentOnly.reference = 'BK-42';
      tentOnly.linkedReferences = ['BK-41'];
      full = new Ticket(43, 'Tobin', 'Ash', 'tobin@example.test', '9000000062', 'TXN43', 'not_sent', 10, [item('pt-full', { isActive: false })], 'p3');
      plain = new Ticket(44, 'Uma', 'Cole', 'uma@example.test', '9000000063', 'TXN44', 'not_sent', 10, [item('pt-full')], 'p4');
      component.bookings = [weekend, tentOnly, full, plain];
    });

    it('lists every pass type of the event, grouped by kind, with how many bookings each shows', () => {
      const opts = component.passTypeOptions;
      expect(opts.map(o => o.label)).toEqual(['Full Festival Pass', 'Weekend Pass', 'Shared Tent', 'Car Pass']);
      expect(opts.map(o => o.group)).toEqual(['Festival Passes', 'Festival Passes', 'Stay Passes', 'Add-ons']);
      expect(opts.map(o => o.count)).toEqual([2, 2, 2, 0]);
      expect(component.passTypeOptions).toBe(opts);   // same array until the data changes
    });

    it('shows a booking when it or a linked booking holds a ticked type', () => {
      component.passTypeFilter = ['pt-week'];
      expect(component.filteredBookings.map(b => b._id)).toEqual(['p1', 'p2']);
      component.passTypeFilter = ['pt-tent'];
      expect(component.filteredBookings.map(b => b._id)).toEqual(['p1', 'p2']);
    });

    it('several ticked types show bookings holding any of them; switched-off passes count', () => {
      component.passTypeFilter = ['pt-full', 'pt-car'];
      expect(component.filteredBookings.map(b => b._id)).toEqual(['p3', 'p4']);
      component.passTypeFilter = [];
      expect(component.filteredBookings.length).toBe(4);
    });

    it('loads the event pass types once per event and renders the filter', () => {
      expect(boxOfficeServiceSpy.getPassTypes).toHaveBeenCalledWith('evt1');
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('app-multi-select')).toBeTruthy();
    });
  });

  describe('Beds vs people (with linked bookings)', () => {
    const fest = () => ({ category: 'festival_pass', isActive: true, item_quantity: 1, isAdmitted: false }) as any;
    const stay = (beds: number) => ({ category: 'stay_pass', isActive: true, item_quantity: 1, isAdmitted: false, beds }) as any;
    let group1: Ticket, room1: Ticket, short: Ticket, none: Ticket;

    beforeEach(() => {
      group1 = new Ticket(31, 'Odile', 'Prask', 'odile@example.test', '9000000051', 'TXN31', 'not_sent', 10, [fest(), fest()], 'g1');
      group1.reference = 'BK-1';
      room1 = new Ticket(32, 'Odile', 'Prask', 'odile@example.test', '9000000051', 'TXN32', 'not_sent', 10, [stay(2)], 'g2');
      room1.reference = 'BK-2';
      room1.linkedReferences = ['BK-1'];
      short = new Ticket(33, 'Ferran', 'Quill', 'ferran@example.test', '9000000052', 'TXN33', 'not_sent', 10, [fest(), fest(), fest(), stay(2)], 'g3');
      none = new Ticket(34, 'Ines', 'Varga', 'ines@example.test', '9000000053', 'TXN34', 'not_sent', 0, [], 'g4');
      component.bookings = [group1, room1, short, none];
    });

    it('shows the group totals on every booking of the group, with the linked ones in the hint', () => {
      expect(component.bedsText(group1)).toBe('2 people · 2 beds');
      expect(component.bedsText(room1)).toBe('2 people · 2 beds');
      expect(component.bedsLinked(room1)).toBe(true);
      expect(component.bedsHint(group1)).toContain('With linked booking BK-2');
      expect(component.bedsBadge(group1)).toBe('bg');
      expect(component.bedsText(short)).toBe('3 people · 2 beds');
      expect(component.bedsBadge(short)).toBe('ba');
      expect(component.bedsHint(short)).toBe('1 more person than beds');
      expect(component.bedsText(none)).toBe('—');
    });

    it('counts and filters the bookings whose beds don’t match from the tile', () => {
      expect(component.bedsMismatchCount).toBe(1);
      component.toggleFilter('bedsMismatch');
      expect(component.filteredBookings.map(b => b._id)).toEqual(['g3']);
    });

    it('the search bar finds "beds"', () => {
      component.searchTerm = 'beds';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['g3']);
    });

    it('works the groups out again for a newly loaded list', () => {
      expect(component.bedsMismatchCount).toBe(1);
      component.bookings = [group1, short];   // room1 gone: group1 is now short of beds
      expect(component.bedsMismatchCount).toBe(2);
    });

    it('renders the Beds column', () => {
      fixture.detectChanges();
      const header = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('th')).map(th => th.textContent?.trim());
      expect(header).toContain('Beds');
    });
  });

  describe('Festival details (Early Check-In EC1)', () => {
    const pass = (extra: any = {}) => ({ category: 'festival_pass', item_quantity: 1, isAdmitted: false, isActive: true,
      name: 'Tamsin Orrel', phone_no: '9000000041', email: 'tamsin@example.test', gender: 'female', ...extra }) as any;
    let done: Ticket, half: Ticket, noFestival: Ticket;

    beforeEach(() => {
      done = new Ticket(21, 'Tamsin', 'Orrel', 'tamsin@example.test', '9000000041', 'TXN21', 'not_sent', 10, [pass()], 'd1');
      half = new Ticket(22, 'Bram', 'Vetch', 'bram@example.test', '9000000042', 'TXN22', 'not_sent', 20,
        [pass(), pass({ gender: null }), { category: 'stay_pass', isActive: true, item_quantity: 1 } as any], 'd2');
      noFestival = new Ticket(23, 'Cora', 'Lindqvist', 'cora@example.test', '9000000043', 'TXN23', 'not_sent', 5,
        [{ category: 'addon_pass', isActive: true, item_quantity: 1 } as any], 'd3');
      component.bookings = [done, half, noFestival];
    });

    it('shows filled / total Festival Passes, "—" with none, green when complete, amber when not', () => {
      expect(component.festivalDetailsText(done)).toBe('1 / 1');
      expect(component.festivalDetailsText(half)).toBe('1 / 2');
      expect(component.festivalDetailsText(noFestival)).toBe('—');
      expect(component.festivalDetailsBadge(done)).toBe('bg');
      expect(component.festivalDetailsBadge(half)).toBe('ba');
    });

    it('counts and filters the bookings with details missing from the tile', () => {
      expect(component.detailsMissingCount).toBe(1);
      component.toggleFilter('detailsMissing');
      expect(component.filteredBookings.map(b => b._id)).toEqual(['d2']);
    });

    it('the search bar finds "details missing"', () => {
      component.searchTerm = 'details missing';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['d2']);
      component.searchTerm = 'details';
      expect(component.filteredBookings.map(b => b._id)).toEqual(['d2']);
    });

    it('sorts by the share filled', () => {
      component.sort.toggle('details');
      const ids = component.filteredBookings.map(b => b._id);
      expect(ids.indexOf('d2')).toBeLessThan(ids.indexOf('d1'));
    });

    it('renders the column and the tile', () => {
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const heads = Array.from(el.querySelectorAll('th')).map(t => t.textContent?.trim());
      expect(heads).toContain('Festival details');
      expect(el.textContent).toContain('Details missing');
      expect(el.textContent).toContain('1 / 2');
    });
  });

  describe('Early Check-In email (EC2)', () => {
    const later = new Date(Date.now() + 5 * 86400000).toISOString();
    const earlier = new Date(Date.now() - 86400000).toISOString();
    let a: Ticket, b: Ticket, c: Ticket;

    beforeEach(() => {
      a = new Ticket(31, 'Ilsa', 'Thornbury', 'ilsa@example.test', '9000000051', 'TXN31', 'not_sent', 10, [], 'e1');
      b = new Ticket(32, 'Mateo', 'Quillfeather', 'mateo@example.test', '9000000052', 'TXN32', 'not_sent', 10, [], 'e2');
      b.earlyCheckin = { status: 'sent', expiresAt: later };
      c = new Ticket(33, 'Rosalind', 'Ebbet', 'rosalind@example.test', '9000000053', 'TXN33', 'not_sent', 10, [], 'e3');
      c.earlyCheckin = { status: 'sent', expiresAt: earlier };
      component.bookings = [a, b, c];
    });

    it('labels the status and works out Expired', () => {
      expect(component.checkinStatusLabel(a)).toBe('Not sent');
      expect(component.checkinStatusLabel(b)).toBe('Sent');
      expect(component.checkinStatusLabel(c)).toBe('Expired');
    });

    it('filters by the Early Check-In status', () => {
      component.checkinStatusFilter = 'expired';
      expect(component.filteredBookings.map(x => x._id)).toEqual(['e3']);
      component.checkinStatusFilter = 'not_sent';
      expect(component.filteredBookings.map(x => x._id)).toEqual(['e1']);
    });

    it('shows the failure reason on hover only for failed / no email', () => {
      b.earlyCheckin = { status: 'failed', error: 'SMTP said no' };
      expect(component.checkinStatusHint(b)).toBe('SMTP said no');
      expect(component.checkinStatusHint(a)).toBe('');
    });

    it('opens the Early Check-In dialog for the selected bookings', () => {
      emailDialogsSpy.openCheckinEmail.and.returnValue(of(undefined));
      component.selectedIds = new Set(['e2', 'e3']);
      component.sendCheckinEmails();
      expect(emailDialogsSpy.openCheckinEmail).toHaveBeenCalledWith([b, c]);
    });

    it('renders the column', () => {
      fixture.detectChanges();
      const heads = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('th')).map(t => t.textContent?.trim());
      expect(heads).toContain('Early Check-In');
    });
  });
  describe('Phone cards (2026-11-25)', () => {
    const el = () => fixture.nativeElement as HTMLElement;
    const many = (n: number) => Array.from({ length: n }, (_, i) =>
      new Ticket(100 + i, 'Guest', String(i), `g${i}@example.com`, '9000000000', `TXN${i}`, 'not_sent', 10, [], `c${i}`));

    it('shows the table, not cards, when the page is not in Cards mode', () => {
      expect(el().querySelector('table.tbl')).not.toBeNull();
      expect(el().querySelector('.pc-card')).toBeNull();
    });

    it('shows cards and no table in Cards mode (only one view renders)', () => {
      cardsOn = phoneOn = true;
      fixture.detectChanges();
      expect(el().querySelector('table.tbl')).toBeNull();
      expect(el().querySelectorAll('.pc-card').length).toBe(2);
      expect(el().querySelector('mat-paginator')).toBeNull();
    });

    it('tapping a card opens the panel; ticking its box selects without opening', () => {
      cardsOn = phoneOn = true;
      fixture.detectChanges();
      const card = el().querySelector('.pc-card') as HTMLElement;
      const box = card.querySelector('input[type="checkbox"]') as HTMLInputElement;
      box.click();
      fixture.detectChanges();
      expect(component.selectedIds.has('t1')).toBeTrue();
      expect(component.panelOpen).toBeFalse();
      card.click();
      expect(component.panelOpen).toBeTrue();
      expect(component.activeBooking?._id).toBe('t1');
    });

    it('shows 25 cards, then 25 more per "Show more", back to 25 on a new search', () => {
      cardsOn = phoneOn = true;
      component.bookings = many(60);
      fixture.detectChanges();
      expect(el().querySelectorAll('.pc-card').length).toBe(25);
      component.showMoreCards();
      fixture.detectChanges();
      expect(el().querySelectorAll('.pc-card').length).toBe(50);
      component.onSearchChange();
      expect(component.pagedBookings.length).toBe(25);
    });

    it('"Select all shown" ticks only the cards on screen', () => {
      cardsOn = phoneOn = true;
      component.bookings = many(30);
      fixture.detectChanges();
      component.toggleSelectAllPaged();
      expect(component.selectedIds.size).toBe(25);
    });

    it('gives a cancelled booking the red edge', () => {
      cardsOn = phoneOn = true;
      component.bookings = [Object.assign(many(1)[0], { bookingStatus: 'cancelled' })];
      fixture.detectChanges();
      expect(el().querySelector('.pc-card')?.classList).toContain('s-bad');
    });
    it('on a phone, the phone toolbar replaces the filter bar and the selection bar (table view too)', () => {
      phoneOn = true;
      fixture.detectChanges();
      expect(el().querySelector('app-list-toolbar')).not.toBeNull();
      expect(el().querySelector('.tbl-filters')).toBeNull();
      expect(el().querySelector('.seg-bar')).toBeNull();
      expect(el().querySelector('table.tbl')).not.toBeNull();
    });

    it('a card shows booking ID, phone and source, and no ticket ID', () => {
      cardsOn = phoneOn = true;
      component.bookings = [Object.assign(many(1)[0], { phone_no: '9123456780' })];
      fixture.detectChanges();
      const card = el().querySelector('.pc-card') as HTMLElement;
      expect(card.querySelector('.pc-phone')?.textContent).toContain('9123456780');
      expect(card.querySelector('.pc-id')?.textContent).toContain(component.bookingId(component.bookings[0]));
      expect(card.querySelector('.pc-meta')?.textContent).toContain(component.source(component.bookings[0]));
      expect(card.textContent).not.toContain('c0');
    });

    it('labels every status on the card', () => {
      cardsOn = phoneOn = true;
      fixture.detectChanges();
      const labels = Array.from(el().querySelectorAll('.pc-card')[0].querySelectorAll('.pc-sv i')).map(i => i.textContent);
      expect(labels).toEqual(['Admitted', 'Ticket email', 'Check-In', 'Details']);
    });

    describe('applied chips', () => {
      it('a stat tile tap shows as a chip', () => {
        component.toggleFilter('admitted');
        expect(component.appliedChips).toEqual([{ id: 'stat', label: 'Admitted' }]);
      });

      it('filters and the sort show as chips, in order', () => {
        component.emailStatusFilter = component.emailStatusOptions[0].value as any;
        component.onSearchChange();
        component.passTypeFilter = ['a', 'b'];
        component.onSearchChange();
        component.sort.set('paidAt', 'desc');
        expect(component.appliedChips.map(c => c.id)).toEqual(['email', 'pass', 'sort']);
        expect(component.appliedChips[0].label).toBe('Ticket email: ' + component.emailStatusOptions[0].label);
        expect(component.appliedChips[1].label).toBe('2 pass types');
        expect(component.appliedChips[2]).toEqual({ id: 'sort', label: 'Sort: Paid at', icon: 'arrow_downward' });
      });

      it('× removes one filter and starts again from the first cards', () => {
        component.toggleFilter('admitted');
        component.checkinStatusFilter = component.checkinStatusOptions[0].value as any;
        component.onSearchChange();
        component.showMoreCards();
        component.removeChip('stat');
        expect(component.activeFilter).toBeNull();
        expect(component.cardLimit).toBe(25);
        expect(component.appliedChips.map(c => c.id)).toEqual(['checkin']);
        component.sort.set('name', 'asc');
        component.removeChip('sort');
        expect(component.sort.key).toBeNull();
        expect(component.appliedChips.map(c => c.id)).toEqual(['checkin']);
      });

      it('Clear all resets every filter and the sort, not the search', () => {
        component.searchTerm = 'priya';
        component.toggleFilter('emailSent');
        component.passTypeFilter = ['a'];
        component.sort.set('name', 'desc');
        component.clearChips();
        expect(component.activeFilter).toBeNull();
        expect(component.passTypeFilter).toEqual([]);
        expect(component.sort.key).toBeNull();
        expect(component.appliedChips).toEqual([]);
        expect(component.searchTerm).toBe('priya');
      });
    });
  });
});
