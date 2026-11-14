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

        it('grants TL automatic manage access within their own department, with no explicit permission', () => {
            const user = new User('Test', 'a@b.com', '', 'TL', '', '', '123', undefined,
                [{ department: { _id: 'd1', name: 'Box Office', key: 'box-office' }, access: ['read'] }], []);
            expect(service.hasPermission(user, 'box-office:manage')).toBeTrue();
            expect(service.hasPermission(user, 'box-office:read')).toBeTrue();
        });

        it('does not grant TL access to a department they do not belong to', () => {
            const user = new User('Test', 'a@b.com', '', 'TL', '', '', '123', undefined,
                [{ department: { _id: 'd1', name: 'Box Office', key: 'box-office' }, access: ['read'] }], []);
            expect(service.hasPermission(user, 'finance:read')).toBeFalse();
        });
    });

    describe('getEffectivePermissionMap', () => {
        it('merges explicit permissions with TL auto-manage for their own department', () => {
            const user = new User('Test', 'a@b.com', '', 'TL', '', '', '123', undefined,
                [{ department: { _id: 'd1', name: 'Box Office', key: 'box-office' }, access: ['read'] }], ['general:write']);
            const map = service.getEffectivePermissionMap(user);
            expect(map['box-office']).toBe('manage');
            expect(map['general']).toBe('write');
        });

        it('TL automatically has manage-level access in their own department, even with no explicit permission string', () => {
            const user = new User('Test', 'a@b.com', '', 'TL', '', '', '123',
                undefined, [{ department: { _id: 'd1', name: 'Box Office', key: 'box-office' }, access: ['read'] }], []);
            expect(service.hasPermission(user, 'box-office:manage')).toBeTrue();
            expect(service.hasPermission(user, 'box-office:read')).toBeTrue();
        });

        it('TL auto-manage does not extend to departments they do not belong to', () => {
            const user = new User('Test', 'a@b.com', '', 'TL', '', '', '123',
                undefined, [{ department: { _id: 'd1', name: 'Box Office', key: 'box-office' }, access: ['read'] }], []);
            expect(service.hasPermission(user, 'finance:read')).toBeFalse();
        });

        it("uses the department's fixed key, so a renamed department keeps TL auto-manage", () => {
            const user = new User('Test', 'a@b.com', '', 'TL', '', '', '123',
                undefined, [{ department: { _id: 'd1', name: 'Classes', key: 'workshop' }, access: ['read'] }], []);
            expect(service.hasPermission(user, 'workshop:manage')).toBeTrue();
            expect(service.hasPermission(user, 'classes:read')).toBeFalse();
        });
    });

    describe('workshops access (by department key)', () => {
        const ws = { _id: 'd1', name: 'Classes', key: 'workshop' };
        const mk = (role: string, depts: any[] = [], perms: string[] = []) =>
            new User('Test', 'a@b.com', '', role, '', '', '123', undefined, depts.map(d => ({ department: d, access: ['read'] })), perms);

        it('Plan: top roles, the Workshop TL and workshop:manage', () => {
            expect(service.canPlanWorkshops(mk('ADMIN'))).toBeTrue();
            expect(service.canPlanWorkshops(mk('TL', [ws]))).toBeTrue();
            expect(service.canPlanWorkshops(mk('VOL', [], ['workshop:manage']))).toBeTrue();
            expect(service.canPlanWorkshops(mk('VOL', [ws]))).toBeFalse();
            expect(service.canPlanWorkshops(mk('TL', [{ _id: 'd2', name: 'Workshop', key: 'ops' }]))).toBeFalse();
            expect(service.canPlanWorkshops(null)).toBeFalse();
        });

        it('Read (reports): the Run group and any workshop grant', () => {
            expect(service.canReadWorkshops(mk('VOL', [], ['workshop:read']))).toBeTrue();
            expect(service.canReadWorkshops(mk('VOL', [ws]))).toBeTrue();
            expect(service.canReadWorkshops(mk('VOL', [], ['box-office:read']))).toBeFalse();
            expect(service.canReadWorkshops(null)).toBeFalse();
        });

        it('Run: also Workshop members and workshop:write', () => {
            expect(service.canRunWorkshops(mk('VOL', [ws]))).toBeTrue();
            expect(service.canRunWorkshops(mk('VOL', [], ['workshop:write']))).toBeTrue();
            expect(service.canRunWorkshops(mk('VOL', [], ['workshop:read']))).toBeFalse();
            expect(service.canRunWorkshops(mk('TL', [{ _id: 'd3', name: 'Ops' }]))).toBeFalse();
        });
    });

    describe('hospitality access (by department key)', () => {
        const hosp = { _id: 'd1', name: 'Food & Rest', key: 'hospitality' };
        const mk = (role: string, depts: any[] = [], perms: string[] = []) =>
            new User('Test', 'a@b.com', '', role, '', '', '123', undefined, depts.map(d => ({ department: d, access: ['read'] })), perms);

        it('top roles, the Hospitality TL and hospitality:manage only', () => {
            expect(service.canManageHospitality(mk('DIR'))).toBeTrue();
            expect(service.canManageHospitality(mk('TL', [hosp]))).toBeTrue();
            expect(service.canManageHospitality(mk('VOL', [], ['hospitality:manage']))).toBeTrue();
            expect(service.canManageHospitality(mk('VOL', [hosp]))).toBeFalse();
            expect(service.canManageHospitality(mk('VOL', [], ['hospitality:write']))).toBeFalse();
            expect(service.canManageHospitality(mk('TL', [{ _id: 'd2', name: 'Hospitality', key: 'ops' }]))).toBeFalse();
            expect(service.canManageHospitality(null)).toBeFalse();
        });
    });

    describe('deptKeyOf', () => {
        it('returns the stored built-in key, else "general" — the name is never used', () => {
            expect(service.deptKeyOf({ name: 'Front Gate', key: 'box-office' })).toBe('box-office');
            expect(service.deptKeyOf({ name: 'Box Office' })).toBe('general');
            expect(service.deptKeyOf({ name: 'Box Office', key: 'general' })).toBe('general');
            expect(service.deptKeyOf({ name: 'Finance', key: 'finance' })).toBe('general');
            expect(service.deptKeyOf(null)).toBe('');
        });
    });

    describe('Accommodation access (key `tenting`)', () => {
        const camp = { _id: 'd1', name: 'Camp Crew', key: 'tenting' };
        const lookalike = { _id: 'd2', name: 'Tenting', key: 'general' };
        const mk = (role: string, depts: any[] = [], perms: string[] = []) =>
            new User('Test', 'a@b.com', '', role, '', '', '123', undefined, depts.map(d => ({ department: d, access: ['read'] })), perms);

        it('Read: top roles, every Tenting member, any tenting grant', () => {
            expect(service.canReadTenting(mk('ADMIN'))).toBeTrue();
            expect(service.canReadTenting(mk('VOL', [camp]))).toBeTrue();
            expect(service.canReadTenting(mk('VOL', [], ['tenting:read']))).toBeTrue();
            expect(service.canReadTenting(mk('VOL', [lookalike]))).toBeFalse();
            expect(service.canReadTenting(mk('VOL', [], ['box-office:manage']))).toBeFalse();
            expect(service.canReadTenting(null)).toBeFalse();
        });

        it('Write: top roles, the Tenting TL, tenting:write and up — not a plain member', () => {
            expect(service.canWriteTenting(mk('DIR'))).toBeTrue();
            expect(service.canWriteTenting(mk('TL', [camp]))).toBeTrue();
            expect(service.canWriteTenting(mk('VOL', [], ['tenting:write']))).toBeTrue();
            expect(service.canWriteTenting(mk('VOL', [], ['tenting:manage']))).toBeTrue();
            expect(service.canWriteTenting(mk('VOL', [camp]))).toBeFalse();
            expect(service.canWriteTenting(mk('VOL', [], ['tenting:read']))).toBeFalse();
            expect(service.canWriteTenting(mk('TL', [lookalike]))).toBeFalse();
        });

        it('Manage (fields): top roles, the Tenting TL, tenting:manage only', () => {
            expect(service.canManageTentFields(mk('ADMIN'))).toBeTrue();
            expect(service.canManageTentFields(mk('TL', [camp]))).toBeTrue();
            expect(service.canManageTentFields(mk('VOL', [], ['tenting:manage']))).toBeTrue();
            expect(service.canManageTentFields(mk('VOL', [], ['tenting:write']))).toBeFalse();
            expect(service.canManageTentFields(null)).toBeFalse();
        });

        it('Vacate: the Write group, or Box Office Write as before', () => {
            expect(service.canVacateTents(mk('VOL', [], ['tenting:write']))).toBeTrue();
            expect(service.canVacateTents(mk('VOL', [], ['box-office:write']))).toBeTrue();
            expect(service.canVacateTents(mk('VOL', [], ['box-office:read']))).toBeFalse();
            expect(service.canVacateTents(mk('VOL', [camp]))).toBeFalse();
            expect(service.canVacateTents(null)).toBeFalse();
        });
    });

    describe('Box Office is matched by key, never by name', () => {
        const mk = (role: string, dept: any) =>
            new User('Test', 'a@b.com', '', role, '', '', '123', undefined, [{ department: dept, access: ['read'] }], []);

        it('a renamed Box Office department keeps its access', () => {
            const gate = { _id: 'd1', name: 'Front Gate', key: 'box-office' };
            expect(service.inDepartmentKey(mk('VOL', gate), 'box-office')).toBeTrue();
            expect(service.hasPermission(mk('TL', gate), 'box-office:manage')).toBeTrue();
        });

        it('a department merely named "Box Office" gets nothing', () => {
            const lookalike = { _id: 'd2', name: 'Box Office', key: 'general' };
            expect(service.inDepartmentKey(mk('VOL', lookalike), 'box-office')).toBeFalse();
            expect(service.hasPermission(mk('TL', lookalike), 'box-office:read')).toBeFalse();
            // No key at all (an old cached sign-in): no page access either.
            expect(service.inDepartmentKey(mk('VOL', { _id: 'd3', name: 'Box Office' }), 'box-office')).toBeFalse();
        });

        it('a Team Lead of a "general" department gets no automatic grant', () => {
            const map = service.getEffectivePermissionMap(mk('TL', { _id: 'd4', name: 'Decor', key: 'general' }));
            expect(map).toEqual({});
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
