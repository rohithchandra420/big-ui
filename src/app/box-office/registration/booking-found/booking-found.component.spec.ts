import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, ParamMap, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { BookingFoundComponent } from './booking-found.component';
import { BoxOfficeService } from '../../box-office.service';
import { NotificationService } from '../../../core/notification.service';
import { Ticket } from '../../../models/ticket.model';

const mockTicket: Ticket = new Ticket(1, 'Arjun', 'Mehta', 'arjun@example.com', '9000000001', 'TXN1', 'sent', 100, [
  { _id: 's1', item_name: 'Festival Ticket', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: true, isActive: true, name: 'Arjun Mehta', phone_no: '9000000001', email: 'arjun@example.com' } as any,
  { _id: 's2', item_name: 'Camping', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: false, isActive: true, name: '', phone_no: '', email: '' } as any,
], 't1');

describe('BookingFoundComponent', () => {
  let component: BookingFoundComponent;
  let fixture: ComponentFixture<BookingFoundComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let notifySpy: jasmine.SpyObj<NotificationService>;
  let params$: BehaviorSubject<ParamMap>;

  const configureWith = async (id: string | null) => {
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['getTicketById', 'searchTickets']);
    boxOfficeServiceSpy.getTicketById.and.returnValue(of(mockTicket));
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    notifySpy = jasmine.createSpyObj('NotificationService', ['openErrorSnackBar', 'openSucessSnackBar']);
    params$ = new BehaviorSubject<ParamMap>(convertToParamMap(id ? { id } : {}));

    await TestBed.configureTestingModule({
      declarations: [BookingFoundComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: Router, useValue: routerSpy },
        { provide: NotificationService, useValue: notifySpy },
        { provide: ActivatedRoute, useValue: { paramMap: params$.asObservable() } },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(BookingFoundComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('loads the ticket by the route id param', async () => {
    await configureWith('t1');
    expect(boxOfficeServiceSpy.getTicketById).toHaveBeenCalledWith('t1');
    expect(component.ticket).toEqual(mockTicket);
  });

  it('does not fetch when there is no id param', async () => {
    await configureWith(null);
    expect(boxOfficeServiceSpy.getTicketById).not.toHaveBeenCalled();
  });

  it('sets notFound when the fetch fails', async () => {
    await configureWith('t1');
    boxOfficeServiceSpy.getTicketById.and.returnValue(throwError(() => new Error('fail')));
    component.loadTicket('bad-id');
    expect(component.notFound).toBeTrue();
    expect(component.loading).toBeFalse();
  });

  it('computes admittedCount and totalCount from shopcart', async () => {
    await configureWith('t1');
    expect(component.admittedCount).toBe(1);
    expect(component.totalCount).toBe(2);
  });

  it('subtitle says "admitted", not "checked in"', async () => {
    await configureWith('t1');
    fixture.detectChanges();
    const sub = fixture.nativeElement.querySelector('.page-ph-sub')?.textContent ?? '';
    expect(sub).toContain('1 of 2 admitted');
    expect(sub).not.toContain('checked in');
  });

  it('passSummary reflects the ticket shopcart', async () => {
    await configureWith('t1');
    expect(component.passSummary).toBe('Festival Ticket, Camping');
  });

  it('reloads when the address moves to another booking', async () => {
    await configureWith('t1');
    params$.next(convertToParamMap({ id: 't2' }));
    expect(boxOfficeServiceSpy.getTicketById).toHaveBeenCalledWith('t2');
  });

  describe('linked pass Booking ID from Allocate Tent', () => {
    const linked = Object.assign(new Ticket(null as any, 'Ansel', 'Quarrie', 'ansel@example.test', '9', 'pay_Y', 'not_sent', 900, [], 't10'),
      { reference: 'TST5-LINK' }) as Ticket;
    const nearMiss = Object.assign(new Ticket(null as any, 'B', 'C', 'b@example.test', '9', 'pay_Z', 'not_sent', 1, [], 't11'),
      { reference: 'TST5-LINK-2' }) as Ticket;

    it('finds the booking with that exact Booking ID and opens it on this page', async () => {
      await configureWith('t1');
      component.ticket = Object.assign(mockTicket, { event: 'evt1' });
      boxOfficeServiceSpy.searchTickets.and.returnValue(of([nearMiss, linked]));
      component.openBooking('TST5-LINK');
      expect(boxOfficeServiceSpy.searchTickets).toHaveBeenCalledWith('TST5-LINK', 'evt1');
      expect(routerSpy.navigate).toHaveBeenCalledWith(['/box-office/registration', 't10']);
    });

    it('says so when that booking is not in BiG yet', async () => {
      await configureWith('t1');
      component.ticket = Object.assign(mockTicket, { event: 'evt1' });
      boxOfficeServiceSpy.searchTickets.and.returnValue(of([nearMiss]));
      component.openBooking('TST5-LINK');
      expect(routerSpy.navigate).not.toHaveBeenCalled();
      expect(notifySpy.openErrorSnackBar).toHaveBeenCalled();
    });
  });

  it('goBack navigates to /box-office/registration', async () => {
    await configureWith('t1');
    component.goBack();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/box-office/registration']);
  });
});
