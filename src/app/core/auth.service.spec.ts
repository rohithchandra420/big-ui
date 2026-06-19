import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService } from './auth.service';
import { NotificationService } from './notification.service';
import { User } from './user.model';

const mockNotificationService = {
    openSucessSnackBar: jasmine.createSpy('openSucessSnackBar'),
    openErrorSnackBar: jasmine.createSpy('openErrorSnackBar'),
};

describe('AuthService', () => {
    let service: AuthService;
    let httpMock: HttpTestingController;

    beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({
            imports: [
                HttpClientTestingModule,
                RouterTestingModule.withRoutes([
                    { path: 'login', redirectTo: '' },
                    { path: '', redirectTo: 'login', pathMatch: 'full' },
                ]),
            ],
            providers: [
                AuthService,
                { provide: NotificationService, useValue: mockNotificationService },
            ],
        });
        service = TestBed.inject(AuthService);
        httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
        httpMock.verify();
        localStorage.clear();
    });

    describe('handleAuthentication (via logIn)', () => {
        it('stores user in localStorage WITHOUT a token', () => {
            service.logIn({ email: 'a@b.com', password: 'Secure@123' });

            const req = httpMock.expectOne(r => r.url.includes('/login'));
            req.flush({ user: { _id: '123', name: 'Test', email: 'a@b.com', role: 'ADMIN' } });

            const stored = JSON.parse(localStorage.getItem('userData'));
            expect(stored).toBeTruthy();
            expect(stored._token).toBeFalsy();
        });

        it('sets IsLoggedIn in localStorage on successful login', () => {
            service.logIn({ email: 'a@b.com', password: 'Secure@123' });

            const req = httpMock.expectOne(r => r.url.includes('/login'));
            req.flush({ user: { _id: '123', name: 'Test', email: 'a@b.com', role: 'ADMIN' } });

            expect(localStorage.getItem('IsLoggedIn')).toBe('true');
        });

        it('updates the user BehaviorSubject on login', () => {
            service.logIn({ email: 'a@b.com', password: 'Secure@123' });

            const req = httpMock.expectOne(r => r.url.includes('/login'));
            req.flush({ user: { _id: '123', name: 'Test', email: 'a@b.com', role: 'ADMIN' } });

            expect(service.currentUser).toBeTruthy();
            expect(service.currentUser.email).toBe('a@b.com');
        });
    });

    describe('logOut', () => {
        beforeEach(() => {
            localStorage.setItem('IsLoggedIn', 'true');
            localStorage.setItem('userData', JSON.stringify({ name: 'Test', email: 'a@b.com' }));
        });

        it('removes IsLoggedIn from localStorage', () => {
            service.logOut();
            httpMock.expectOne(r => r.url.includes('/user/logout')).flush({});
            expect(localStorage.getItem('IsLoggedIn')).toBeNull();
        });

        it('removes userData from localStorage', () => {
            service.logOut();
            httpMock.expectOne(r => r.url.includes('/user/logout')).flush({});
            expect(localStorage.getItem('userData')).toBeNull();
        });

        it('calls the backend logout endpoint', () => {
            service.logOut();
            const req = httpMock.expectOne(r => r.url.includes('/user/logout'));
            expect(req.request.method).toBe('POST');
        });

        it('clears the user BehaviorSubject', () => {
            service.user.next(new User('Test', 'a@b.com', '', 'ADMIN', '', '', '123'));
            service.logOut();
            httpMock.expectOne(r => r.url.includes('/user/logout')).flush({});
            expect(service.currentUser).toBeNull();
        });
    });

    describe('autoLogin', () => {
        it('restores user from localStorage without needing a token', () => {
            const userData = { name: 'Test', email: 'a@b.com', role: 'ADMIN', bookingId: '', ticketId: '', id: '123' };
            localStorage.setItem('userData', JSON.stringify(userData));

            service.autoLogin();

            expect(service.currentUser).toBeTruthy();
            expect(service.currentUser.email).toBe('a@b.com');
        });

        it('does nothing when localStorage has no userData', () => {
            service.autoLogin();
            expect(service.currentUser).toBeNull();
        });
    });

    describe('hasPermission', () => {
        it('returns true for DEV role (all permissions)', () => {
            const user = new User('Test', 'a@b.com', '', 'DEV', '', '', '123');
            expect(service.hasPermission(user, 'any:permission')).toBeTrue();
        });

        it('returns true for ADMIN role with a valid permission', () => {
            const user = new User('Test', 'a@b.com', '', 'ADMIN', '', '', '123', undefined, [], ['general:read']);
            expect(service.hasPermission(user, 'general:read')).toBeTrue();
        });

        it('returns true when user has write and read is required (tiered)', () => {
            const user = new User('Test', 'a@b.com', '', 'ADMIN', '', '', '123', undefined, [], ['general:write']);
            expect(service.hasPermission(user, 'general:read')).toBeTrue();
        });

        it('returns false for a permission the role does not have', () => {
            const user = new User('Test', 'a@b.com', '', 'VOLUNTEER', '', '', '123');
            expect(service.hasPermission(user, 'users:write')).toBeFalse();
        });
    });

    describe('isAuthenticated', () => {
        it('returns the IsLoggedIn value from localStorage', () => {
            localStorage.setItem('IsLoggedIn', 'true');
            expect(service.isAuthenticated()).toBe('true');
        });

        it('returns null when not logged in', () => {
            expect(service.isAuthenticated()).toBeNull();
        });
    });
});
