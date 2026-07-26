import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';

import { BookingFoundComponent } from './booking-found.component';
import { BoxOfficeService } from '../../box-office.service';
import { Ticket } from '../../../models/ticket.model';

const mockTicket: Ticket = new Ticket(1, 'Arjun', 'Mehta', 'arjun@example.com', '9000000001', 'TXN1', 'Yes', 100, [
  { _id: 's1', item_name: 'Festival Ticket', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: true, isActive: true, name: 'Arjun Mehta', phone_no: '9000000001', email: 'arjun@example.com' } as any,
  { _id: 's2', item_name: 'Camping', item_quantity: 1, order_id: 1, admissionId: null as any, isAdmitted: false, isActive: true, name: '', phone_no: '', email: '' } as any,
], 't1');

describe('BookingFoundComponent', () => {
  let component: BookingFoundComponent;
  let fixture: ComponentFixture<BookingFoundComponent>;
  let boxOfficeServiceSpy: jasmine.SpyObj<BoxOfficeService>;
  let routerSpy: jasmine.SpyObj<Router>;

  const configureWith = async (id: string | null) => {
    boxOfficeServiceSpy = jasmine.createSpyObj('BoxOfficeService', ['getTicketById']);
    boxOfficeServiceSpy.getTicketById.and.returnValue(of(mockTicket));
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      declarations: [BookingFoundComponent],
      providers: [
        { provide: BoxOfficeService, useValue: boxOfficeServiceSpy },
        { provide: Router, useValue: routerSpy },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } },
        },
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

  it('passSummary reflects the ticket shopcart', async () => {
    await configureWith('t1');
    expect(component.passSummary).toBe('Festival Ticket, Camping');
  });

  it('goBack navigates to /box-office/registration', async () => {
    await configureWith('t1');
    component.goBack();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/box-office/registration']);
  });
});
