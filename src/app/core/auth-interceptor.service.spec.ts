import { TestBed } from '@angular/core/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthInterceptorService } from './auth-interceptor.service';
import { AuthService } from './auth.service';
import { User } from './user.model';

describe('AuthInterceptorService', () => {
    let http: HttpClient;
    let httpMock: HttpTestingController;
    let authServiceStub: { currentUser: User | null; handleSessionExpired: jasmine.Spy };

    beforeEach(() => {
        authServiceStub = {
            currentUser: null,
            handleSessionExpired: jasmine.createSpy('handleSessionExpired'),
        };

        TestBed.configureTestingModule({
            imports: [HttpClientTestingModule],
            providers: [
                { provide: AuthService, useValue: authServiceStub },
                {
                    provide: HTTP_INTERCEPTORS,
                    useClass: AuthInterceptorService,
                    multi: true,
                },
            ],
        });
        http = TestBed.inject(HttpClient);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('adds withCredentials: true to every request', () => {
        http.get('/api/test').subscribe();
        const req = httpMock.expectOne('/api/test');
        expect(req.request.withCredentials).toBeTrue();
    });

    it('does not add an Authorization header', () => {
        http.get('/api/test').subscribe();
        const req = httpMock.expectOne('/api/test');
        expect(req.request.headers.has('Authorization')).toBeFalse();
    });

    it('preserves the original request method and URL', () => {
        http.post('/api/login', { email: 'a@b.com' }).subscribe();
        const req = httpMock.expectOne('/api/login');
        expect(req.request.method).toBe('POST');
        expect(req.request.withCredentials).toBeTrue();
    });

    it('triggers session-expired handling on a 401 when a session was active', () => {
        authServiceStub.currentUser = new User('Test', 'a@b.com', '', 'VOL', '', '');

        http.get('/api/protected').subscribe({ error: () => {} });
        const req = httpMock.expectOne('/api/protected');
        req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

        expect(authServiceStub.handleSessionExpired).toHaveBeenCalled();
    });

    it('does not trigger session-expired handling on a 401 with no active session (anonymous request)', () => {
        authServiceStub.currentUser = null;

        http.get('/api/protected').subscribe({ error: () => {} });
        const req = httpMock.expectOne('/api/protected');
        req.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

        expect(authServiceStub.handleSessionExpired).not.toHaveBeenCalled();
    });

    it('does not trigger session-expired handling on a non-401 error', () => {
        authServiceStub.currentUser = new User('Test', 'a@b.com', '', 'VOL', '', '');

        http.get('/api/protected').subscribe({ error: () => {} });
        const req = httpMock.expectOne('/api/protected');
        req.flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

        expect(authServiceStub.handleSessionExpired).not.toHaveBeenCalled();
    });
});
