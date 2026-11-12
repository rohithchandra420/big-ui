import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { NavHistoryService } from './nav-history.service';
import { NavAccessService } from './nav-access.service';
import { NAV_SECTIONS } from './nav-sections';

describe('NavHistoryService', () => {
  let events$: Subject<any>;
  let router: any;
  let location: any;
  let allowed: Set<string>;
  let svc: NavHistoryService;
  let id = 0;

  const hosp = NAV_SECTIONS.find(s => s.key === 'hospitality')!;
  const visit = (url: string, trigger: 'imperative' | 'popstate' = 'imperative') => {
    id++;
    events$.next(new NavigationStart(id, url, trigger));
    events$.next(new NavigationEnd(id, url, url));
  };

  beforeEach(() => {
    localStorage.removeItem('navLastTab');
    events$ = new Subject();
    router = { events: events$, getCurrentNavigation: () => null, navigateByUrl: jasmine.createSpy('navigateByUrl') };
    location = { back: jasmine.createSpy('back') };
    allowed = new Set(hosp.tabs.map(t => t.path));
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: Location, useValue: location },
        { provide: NavAccessService, useValue: { visibleTabs: (s: any) => s.tabs.filter((t: any) => allowed.has(t.path)) } },
      ],
    });
    svc = TestBed.inject(NavHistoryService);
  });

  afterEach(() => localStorage.removeItem('navLastTab'));

  it('hides Back on the first page and after going back to it', () => {
    visit('/hospitality');
    expect(svc.canGoBack('/hospitality')).toBeFalse();
    visit('/hospitality/desk');
    expect(svc.canGoBack('/hospitality/desk')).toBeTrue();
    svc.back('/hospitality/desk');
    expect(location.back).toHaveBeenCalled();
    visit('/hospitality', 'popstate');
    expect(svc.canGoBack('/hospitality')).toBeFalse();
  });

  it('always offers Back on a detail page and goes up to its parent tab', () => {
    visit('/box-office/registration/BK-1');
    expect(svc.canGoBack('/box-office/registration/BK-1')).toBeTrue();
    svc.back('/box-office/registration/BK-1');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/box-office/registration');
    expect(location.back).not.toHaveBeenCalled();
  });

  it('opens a section on its last used tab, kept in this browser', () => {
    visit('/hospitality/desk');
    expect(svc.sectionLink(hosp)).toBe('/hospitality/desk');
    expect(JSON.parse(localStorage.getItem('navLastTab')!)).toEqual({ hospitality: '/hospitality/desk' });
  });

  it('falls back to the first allowed tab when the remembered one is not allowed', () => {
    visit('/hospitality/setup');
    allowed.delete('/hospitality/setup');
    allowed.delete('/hospitality');
    expect(svc.sectionLink(hosp)).toBe('/hospitality/desk');
  });

  it('does not remember detail pages as the last tab', () => {
    visit('/workshops/reports');
    visit('/workshops/sessions/s-1');
    const ws = NAV_SECTIONS.find(s => s.key === 'workshops')!;
    allowed = new Set(ws.tabs.map(t => t.path));
    expect(svc.sectionLink(ws)).toBe('/workshops/reports');
  });
});
