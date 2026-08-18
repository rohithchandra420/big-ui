import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject } from 'rxjs';

import { EventService } from './event.service';
import { AuthService } from './auth.service';
import { User } from './user.model';
import { EventItem } from '../models/event.model';

const mockEvents: EventItem[] = [
    { _id: 'evt1', name: 'BiG 6.0', description: '', status: 'active' },
    { _id: 'evt2', name: 'BloomNight 01', description: '', status: 'draft' },
];

describe('EventService', () => {
    let service: EventService;
    let httpMock: HttpTestingController;
    let currentUserSubject: BehaviorSubject<User | null>;

    beforeEach(() => {
        currentUserSubject = new BehaviorSubject<User | null>(null);
        const authServiceStub = { currentUser$: currentUserSubject.asObservable() };

        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                { provide: AuthService, useValue: authServiceStub },
            ],
        });
        service = TestBed.inject(EventService);
        httpMock = TestBed.inject(HttpTestingController);
        localStorage.removeItem('activeEventId');
    });

    afterEach(() => {
        httpMock.verify();
        localStorage.removeItem('activeEventId');
    });

    it('does not load events while there is no user', () => {
        httpMock.expectNone('/api/admin/events');
        expect(service.currentEvents).toEqual([]);
    });

    it('loads events and defaults the active event to the first one when nothing is stored', () => {
        currentUserSubject.next({ name: 'Test' } as User);
        const req = httpMock.expectOne('/api/admin/events');
        req.flush(mockEvents);

        expect(service.currentEvents).toEqual(mockEvents);
        expect(service.currentActiveEvent).toEqual(mockEvents[0]);
        expect(localStorage.getItem('activeEventId')).toBe('evt1');
    });

    it('restores the previously-selected event from localStorage if it is still in the list', () => {
        localStorage.setItem('activeEventId', 'evt2');
        currentUserSubject.next({ name: 'Test' } as User);
        const req = httpMock.expectOne('/api/admin/events');
        req.flush(mockEvents);

        expect(service.currentActiveEvent).toEqual(mockEvents[1]);
    });

    it('falls back to the first event if the stored id is no longer visible (e.g. archived)', () => {
        localStorage.setItem('activeEventId', 'evt-gone');
        currentUserSubject.next({ name: 'Test' } as User);
        const req = httpMock.expectOne('/api/admin/events');
        req.flush(mockEvents);

        expect(service.currentActiveEvent).toEqual(mockEvents[0]);
        expect(localStorage.getItem('activeEventId')).toBe('evt1');
    });

    it('clears active event and stored selection when the event list comes back empty', () => {
        currentUserSubject.next({ name: 'Test' } as User);
        const req = httpMock.expectOne('/api/admin/events');
        req.flush([]);

        expect(service.currentActiveEvent).toBeNull();
        expect(localStorage.getItem('activeEventId')).toBeNull();
    });

    it('setActiveEvent() persists the selection and updates the BehaviorSubject', () => {
        currentUserSubject.next({ name: 'Test' } as User);
        httpMock.expectOne('/api/admin/events').flush(mockEvents);

        service.setActiveEvent(mockEvents[1]);

        expect(service.currentActiveEvent).toEqual(mockEvents[1]);
        expect(localStorage.getItem('activeEventId')).toBe('evt2');
    });

    it('clears everything on logout (user becomes null)', () => {
        currentUserSubject.next({ name: 'Test' } as User);
        httpMock.expectOne('/api/admin/events').flush(mockEvents);

        currentUserSubject.next(null);

        expect(service.currentEvents).toEqual([]);
        expect(service.currentActiveEvent).toBeNull();
        expect(localStorage.getItem('activeEventId')).toBeNull();
    });

    it('getEventDetail() hits GET /api/admin/events/:id', () => {
        service.getEventDetail('evt1').subscribe();
        const req = httpMock.expectOne('/api/admin/events/evt1');
        expect(req.request.method).toBe('GET');
        req.flush({ _id: 'evt1', name: 'BiG 6.0', description: '', status: 'active', passTypes: [], tents: [] });
    });

    it('createEvent() posts to /api/admin/events', () => {
        service.createEvent({ name: 'New Event' }).subscribe();
        const req = httpMock.expectOne('/api/admin/events');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({ name: 'New Event' });
        req.flush(mockEvents[0]);
    });

    it('updateEvent() patches /api/admin/events/:id', () => {
        service.updateEvent('evt1', { status: 'active' }).subscribe();
        const req = httpMock.expectOne('/api/admin/events/evt1');
        expect(req.request.method).toBe('PATCH');
        req.flush(mockEvents[0]);
    });

    it('deleteEvent() sends DELETE to /api/admin/events/:id', () => {
        service.deleteEvent('evt1').subscribe();
        const req = httpMock.expectOne('/api/admin/events/evt1');
        expect(req.request.method).toBe('DELETE');
        req.flush({ message: 'Event deleted successfully' });
    });

    it('createPassType() posts to /api/admin/events/:id/pass-types', () => {
        service.createPassType('evt1', { name: 'Solo Tent', category: 'tent' }).subscribe();
        const req = httpMock.expectOne('/api/admin/events/evt1/pass-types');
        expect(req.request.method).toBe('POST');
        req.flush({ _id: 'pt1', event: 'evt1', name: 'Solo Tent', category: 'tent' });
    });

    it('updatePassType() patches /api/admin/events/:id/pass-types/:passTypeId', () => {
        service.updatePassType('evt1', 'pt1', { name: 'Renamed' }).subscribe();
        const req = httpMock.expectOne('/api/admin/events/evt1/pass-types/pt1');
        expect(req.request.method).toBe('PATCH');
        req.flush({ _id: 'pt1', event: 'evt1', name: 'Renamed', category: 'tent' });
    });

    it('deletePassType() sends DELETE to /api/admin/events/:id/pass-types/:passTypeId', () => {
        service.deletePassType('evt1', 'pt1').subscribe();
        const req = httpMock.expectOne('/api/admin/events/evt1/pass-types/pt1');
        expect(req.request.method).toBe('DELETE');
        req.flush({ message: 'Pass type deleted successfully' });
    });
});
