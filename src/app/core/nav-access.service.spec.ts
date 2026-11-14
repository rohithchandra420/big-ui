import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { NavAccessService } from './nav-access.service';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { SosService } from './sos.service';
import { UatResetService } from './uat-reset.service';
import { NAV_SECTIONS } from './nav-sections';

describe('NavAccessService', () => {
  let user$: BehaviorSubject<any>;
  let auth: any;
  let svc: NavAccessService;
  let emailReport: boolean;

  const section = (key: string) => NAV_SECTIONS.find(s => s.key === key)!;
  const labels = (key: string) => svc.visibleTabs(section(key)).map(t => t.label);

  beforeEach(() => {
    user$ = new BehaviorSubject<any>(null);
    emailReport = false;
    auth = {
      user: user$,
      hasPermission: jasmine.createSpy('hasPermission').and.returnValue(false),
      inDepartmentKey: jasmine.createSpy('inDepartmentKey').and.returnValue(false),
      canPlanWorkshops: jasmine.createSpy('canPlanWorkshops').and.returnValue(false),
      canReadWorkshops: jasmine.createSpy('canReadWorkshops').and.returnValue(false),
      canManageHospitality: jasmine.createSpy('canManageHospitality').and.returnValue(false),
      canUseMedical: jasmine.createSpy('canUseMedical').and.returnValue(false),
      // Accommodation (key `tenting`): top roles by default, like the real service.
      canReadTenting: jasmine.createSpy('canReadTenting').and.callFake((u: any) => ['DEV', 'DIR', 'ADMIN'].includes(u?.role)),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: EmailService, useValue: { getConfig: () => of({ canViewReport: emailReport }) } },
        { provide: SosService, useValue: { canSee: () => of(false) } },
        { provide: UatResetService, useValue: { available: () => of(true) } },
      ],
    });
    svc = TestBed.inject(NavAccessService);
  });

  it('shows nothing when signed out', () => {
    for (const s of NAV_SECTIONS) expect(svc.canSeeSection(s.key)).withContext(s.key).toBeFalse();
  });

  it('gives a Developer every tab, incl. UAT Reset and Email Report when the server allows', () => {
    emailReport = true;
    auth.canPlanWorkshops.and.returnValue(true);
    auth.canReadWorkshops.and.returnValue(true);
    auth.canManageHospitality.and.returnValue(true);
    auth.canUseMedical.and.returnValue(true);
    user$.next({ _id: 'u1', role: 'DEV' });
    expect(labels('admin')).toEqual(['Users', 'Departments', 'Events', 'Email Report', 'Announcements', 'Public Page', 'UAT Reset']);
    expect(labels('workshops')).toEqual(['Planner', 'Reports', 'Setup']);
    expect(labels('hospitality').length).toBe(6);
    expect(svc.canSeeSection('medical')).toBeTrue();
  });

  it('a Box Office volunteer sees Box Office and only Inventory under Accommodation', () => {
    auth.inDepartmentKey.and.callFake((_u: any, k: string) => k === 'box-office');
    user$.next({ _id: 'u2', role: 'VOL' });
    expect(labels('box-office')).toEqual(['Bookings', 'Registration']);
    expect(labels('accommodation')).toEqual(['Inventory', 'Fields']);
    expect(labels('workshops')).toEqual(['Planner']);
    expect(svc.canSeeSection('admin')).toBeFalse();
    expect(svc.canSeeSection('hospitality')).toBeFalse();
  });

  it('the Tenting team sees all of Accommodation (Setup too), and nothing of Box Office', () => {
    auth.canReadTenting.and.returnValue(true);
    user$.next({ _id: 'u5', role: 'VOL' });
    expect(labels('accommodation')).toEqual(['Inventory', 'Setup', 'Fields']);
    expect(svc.canSeeSection('box-office')).toBeFalse();
  });

  it('a Team Lead sees only Users under Admin; Email Report needs an Admin-menu role too', () => {
    emailReport = true;
    user$.next({ _id: 'u3', role: 'TL' });
    expect(labels('admin')).toEqual(['Users', 'Email Report']);
    user$.next({ _id: 'u4', role: 'VOL' });
    expect(svc.canSeeSection('admin')).toBeFalse();
  });

  it('never shows UAT Reset to anyone but a Developer', () => {
    user$.next({ _id: 'u5', role: 'ADMIN' });
    expect(labels('admin')).not.toContain('UAT Reset');
  });
});
