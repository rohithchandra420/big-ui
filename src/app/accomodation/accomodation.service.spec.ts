import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { AccomodationService, TentAllocationResult } from './accomodation.service';

describe('AccomodationService', () => {
    let service: AccomodationService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [AccomodationService],
        });
        service = TestBed.inject(AccomodationService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('getAvailableTents() hits /api/getAllVacantTentsByType/:passTypeId', () => {
        service.getAvailableTents('passtype1').subscribe();
        const req = httpMock.expectOne('/api/getAllVacantTentsByType/passtype1');
        expect(req.request.method).toBe('GET');
        req.flush([]);
    });

    it('getAllTents() sends eventId as a query param', () => {
        service.getAllTents('event1').subscribe();
        const req = httpMock.expectOne(r => r.url === '/api/getAllTents');
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('eventId')).toBe('event1');
        req.flush([]);
    });

    it('createTents() posts the batch payload to /api/createTents', () => {
        const payload = { eventId: 'event1', passTypeId: 'pt1', capacity: 2, quantity: 5 };
        service.createTents(payload).subscribe();
        const req = httpMock.expectOne('/api/createTents');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(payload);
        req.flush([]);
    });

    it('updateTent() patches /api/updateTent/:id', () => {
        service.updateTent('tent1', { tent_no: 'SO5' }).subscribe();
        const req = httpMock.expectOne('/api/updateTent/tent1');
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body).toEqual({ tent_no: 'SO5' });
        req.flush({});
    });

    it('deleteTent() sends DELETE to /api/deleteTent/:id', () => {
        service.deleteTent('tent1').subscribe();
        const req = httpMock.expectOne('/api/deleteTent/tent1');
        expect(req.request.method).toBe('DELETE');
        req.flush({ message: 'Tent deleted successfully' });
    });

    it('getTentById() hits /api/getTentById/:id', () => {
        service.getTentById('tent1').subscribe();
        const req = httpMock.expectOne('/api/getTentById/tent1');
        expect(req.request.method).toBe('GET');
        req.flush({});
    });

    it('allocateTentSlot() posts the payload to /api/allocateTentSlot', () => {
        const payload = { tentPassId: 't1', festivalPassId: 'f1', tentId: 'tent1', overrideGenderMismatch: true };
        service.allocateTentSlot(payload).subscribe();
        const req = httpMock.expectOne('/api/allocateTentSlot');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual(payload);
        req.flush({} as TentAllocationResult);
    });

    it('vacateTentSlot() posts shopcartId to /api/vacateTentSlot', () => {
        service.vacateTentSlot('s1').subscribe();
        const req = httpMock.expectOne('/api/vacateTentSlot');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ shopcartId: 's1' });
        req.flush({} as TentAllocationResult);
    });

    it('suggestFestivalPassMatches() sends eventId plus only the provided params as query params', () => {
        service.suggestFestivalPassMatches('event1', { name: 'Kavya', phone: '9000000000' }).subscribe();
        const req = httpMock.expectOne(r => r.url === '/api/suggestFestivalPassMatches');
        expect(req.request.method).toBe('GET');
        expect(req.request.params.get('eventId')).toBe('event1');
        expect(req.request.params.get('name')).toBe('Kavya');
        expect(req.request.params.get('phone')).toBe('9000000000');
        expect(req.request.params.has('email')).toBeFalse();
        req.flush([]);
    });
});
