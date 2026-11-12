import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';

import { SectionHeaderComponent } from './section-header.component';
import { NavAccessService } from '../../core/nav-access.service';
import { NavHistoryService } from '../../core/nav-history.service';

@Component({ template: '' })
class BlankComponent {}

describe('SectionHeaderComponent (tab row)', () => {
  let fixture: ComponentFixture<SectionHeaderComponent>;
  let router: Router;
  let hidden: Set<string>;

  const el = () => fixture.nativeElement as HTMLElement;
  const go = (url: string) => { router.navigateByUrl(url); flush(); fixture.detectChanges(); flush(); fixture.detectChanges(); };

  beforeEach(async () => {
    localStorage.removeItem('navLastTab');
    hidden = new Set();
    await TestBed.configureTestingModule({
      imports: [RouterTestingModule.withRoutes([
        { path: 'hospitality', component: BlankComponent },
        { path: 'hospitality/desk', component: BlankComponent },
        { path: 'accommodation/inventory', component: BlankComponent },
        { path: 'box-office/registration', component: BlankComponent },
        { path: 'box-office/registration/:id', component: BlankComponent },
        { path: 'profile', component: BlankComponent },
      ])],
      declarations: [SectionHeaderComponent, BlankComponent],
      providers: [{
        provide: NavAccessService,
        useValue: {
          changed$: new BehaviorSubject(0),
          visibleTabs: (s: any) => s.tabs.filter((t: any) => !hidden.has(t.path)),
        },
      }],
    }).compileComponents();
    router = TestBed.inject(Router);
    TestBed.inject(NavHistoryService); // must be listening before the first navigation, as in AppComponent
    fixture = TestBed.createComponent(SectionHeaderComponent);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem('navLastTab'));

  it("shows the section's tabs with the current one lit (no section title of its own)", fakeAsync(() => {
    go('/hospitality/desk');
    const tabs = Array.from(el().querySelectorAll('.sec-tab')).map(a => a.textContent!.trim());
    expect(tabs).toEqual(['Today', 'Serving desk', 'Guests', 'Report', 'Stay', 'Setup']);
    const on = el().querySelector('.sec-tab.on')!;
    expect(on.textContent!.trim()).toBe('Serving desk');
    expect(on.getAttribute('aria-current')).toBe('page');
    expect(on.getAttribute('href')).toBe('/hospitality/desk');
    expect(el().textContent).not.toContain('Hospitality');
  }));

  it('hides Back on the first page and shows it after moving on', fakeAsync(() => {
    go('/hospitality');
    expect(el().querySelector('.sec-back')).toBeNull();
    go('/hospitality/desk');
    expect(el().querySelector('.sec-back')!.getAttribute('aria-label')).toBe('Back');
  }));

  it('on a detail page lights the parent tab and offers Back to it', fakeAsync(() => {
    go('/box-office/registration/BK-1042');
    expect(el().querySelector('.sec-tab.on')!.textContent!.trim()).toBe('Registration');
    const back = el().querySelector<HTMLButtonElement>('.sec-back')!;
    expect(back.getAttribute('aria-label')).toBe('Back to Registration');
    back.click();
    flush();
    expect(router.url).toBe('/box-office/registration');
  }));

  it('is hidden when only one tab is allowed and there is no Back', fakeAsync(() => {
    hidden.add('/accommodation/setup');
    hidden.add('/accommodation/fields');
    go('/accommodation/inventory');
    expect(el().classList).toContain('empty');
    expect(el().querySelector('.sec-row')).toBeNull();
  }));

  it('renders nothing outside the sections', fakeAsync(() => {
    go('/profile');
    expect(el().classList).toContain('empty');
    expect(el().querySelector('.sec-row')).toBeNull();
  }));
});
