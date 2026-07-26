import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { BoxOfficeService } from './box-office.service';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { Shopcart, Ticket } from '../models/ticket.model';

const mockNotificationService = {
    openSucessSnackBar: jasmine.createSpy('openSucessSnackBar'),
    openErrorSnackBar: jasmine.createSpy('openErrorSnackBar'),
};

describe('BoxOfficeService', () => {
    let service: BoxOfficeService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [
                HttpClientTestingModule,
                RouterTestingModule.withRoutes([]),
            ],
            providers: [
                BoxOfficeService,
                AuthService,
                { provide: NotificationService, useValue: mockNotificationService },
            ],
        });
        service = TestBed.inject(BoxOfficeService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('getAllTickets() hits /api/box-office/getalltickets', () => {
        service.getAllTickets().subscribe();
        const req = httpMock.expectOne('/api/box-office/getalltickets');
        expect(req.request.method).toBe('GET');
        req.flush([]);
    });

    it('getTicketById() hits /api/box-office/tickets/:id', () => {
        service.getTicketById('abc123').subscribe();
        const req = httpMock.expectOne('/api/box-office/tickets/abc123');
        expect(req.request.method).toBe('GET');
        req.flush({} as Ticket);
    });

    it('updateTicketDetails() posts to /api/box-office/updateTicketDetails', () => {
        const ticket = { _id: 't1' } as Ticket;
        service.updateTicketDetails(ticket).subscribe();
        const req = httpMock.expectOne('/api/box-office/updateTicketDetails');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toBe(ticket);
        req.flush(ticket);
    });

    it('updateTicketToAdmit() posts to /api/box-office/admitTicket', () => {
        const shopItem = { _id: 's1' } as Shopcart;
        service.updateTicketToAdmit(shopItem).subscribe();
        const req = httpMock.expectOne('/api/box-office/admitTicket');
        expect(req.request.method).toBe('POST');
        req.flush(shopItem);
    });

    it('toggleShopItemActive() posts _id to /api/box-office/toggleShopItemActive', () => {
        service.toggleShopItemActive('s1').subscribe();
        const req = httpMock.expectOne('/api/box-office/toggleShopItemActive');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ _id: 's1' });
        req.flush({} as Shopcart);
    });

    it('deleteTicketById() sends DELETE to /api/box-office/deleteTicket/:id', () => {
        service.deleteTicketById('t1').subscribe();
        const req = httpMock.expectOne('/api/box-office/deleteTicket/t1');
        expect(req.request.method).toBe('DELETE');
        req.flush({});
    });

    it('searchTickets() sends q as a GET query param to /api/box-office/search', () => {
        service.searchTickets('Arjun Mehta').subscribe();
        const req = httpMock.expectOne(r => r.url === '/api/box-office/search');
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('q')).toBe('Arjun Mehta');
        req.flush([]);
    });

    it('updateShopcartDetails() posts _id + details to /api/box-office/updateShopcartDetails', () => {
        service.updateShopcartDetails('s1', { name: 'Kavya Reddy', phone_no: '9000000009', email: 'kavya@example.com' }).subscribe();
        const req = httpMock.expectOne('/api/box-office/updateShopcartDetails');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
            _id: 's1', name: 'Kavya Reddy', phone_no: '9000000009', email: 'kavya@example.com'
        });
        req.flush({} as Shopcart);
    });
});
