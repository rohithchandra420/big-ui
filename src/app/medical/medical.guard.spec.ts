import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { MedicalGuard } from './medical.guard';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';

describe('MedicalGuard / AuthService.canUseMedical', () => {
  let guard: MedicalGuard;
  let auth: AuthService;
  let router: Router;

  const user = (role: string, extra: any = {}) => ({ _id: 'u', name: 'X', email: 'x@x', role, departments: [], permissions: [], ...extra } as any);
  const medicalDept = { department: { _id: 'd1', name: 'Medical Team', key: 'medical' } };
  const kitchenDept = { department: { _id: 'd2', name: 'Kitchen', key: 'kitchen' } };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule, HttpClientTestingModule],
      providers: [AuthService, MedicalGuard, { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) }]
    });
    guard = TestBed.inject(MedicalGuard);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  it('follows the server rule: DEV, DIR, Medical department, medical grants — never ADMIN', () => {
    expect(auth.canUseMedical(user('DEV'))).toBeTrue();
    expect(auth.canUseMedical(user('DIR'))).toBeTrue();
    expect(auth.canUseMedical(user('VOL', { departments: [medicalDept] }))).toBeTrue();
    expect(auth.canUseMedical(user('TL', { departments: [medicalDept] }))).toBeTrue();
    expect(auth.canUseMedical(user('VOL', { departments: [kitchenDept], permissions: ['medical:read'] }))).toBeTrue();
    expect(auth.canUseMedical(user('ADMIN'))).toBeFalse();
    expect(auth.canUseMedical(user('ADMIN', { departments: [medicalDept] }))).toBeFalse();
    expect(auth.canUseMedical(user('TL', { departments: [kitchenDept] }))).toBeFalse();
    expect(auth.canUseMedical(null)).toBeFalse();
  });

  it('sends others home and signed-out people to login', async () => {
    auth.user.next(user('ADMIN'));
    expect(router.serializeUrl(await firstValueFrom(guard.canActivate()) as UrlTree)).toBe('/');
    auth.user.next(user('VOL', { departments: [medicalDept] }));
    expect(await firstValueFrom(guard.canActivate())).toBeTrue();
    auth.user.next(null);
    expect(router.serializeUrl(await firstValueFrom(guard.canActivate()) as UrlTree)).toBe('/login');
  });
});
