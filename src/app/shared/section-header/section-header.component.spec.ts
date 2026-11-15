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

  describe('phone scroll (tuck the tab row)', () => {
    let top: number;
    let room: number;
    let c: SectionHeaderComponent;

    /** A stand-in for the app's scroll area. */
    const useScroller = () => {
      const node = { get scrollHeight() { return room + 600; }, clientHeight: 600 };
      (c as any).scroller = { getElementRef: () => ({ nativeElement: node }), measureScrollOffset: () => top };
      (c as any).isMobile = true;
    };
    /** Scroll to y at time t (ms). */
    const at = (y: number, t: number) => { top = y; c.onScroll(t); };

    beforeEach(fakeAsync(() => {
      go('/hospitality/desk');
      c = fixture.componentInstance;
      top = 0;
      room = 3000;
      useScroller();
    }));

    it('tucks only after steady scrolling down, and comes back after steady scrolling up', () => {
      at(100, 0);                 // past the top, 100px down in one go
      expect(c.tucked).toBeTrue();
      at(130, 1000);              // a small move up/down does nothing…
      at(110, 1100);
      expect(c.tucked).toBeTrue();
      at(80, 1200);               // …50px of steady scrolling up shows it again
      expect(c.tucked).toBeFalse();
    });

    it('ignores the jump caused by its own hide/show for a moment (the flicker loop)', () => {
      at(100, 0);
      expect(c.tucked).toBeTrue();
      at(30, 100);                // the header shrank and the page jumped back 70px
      expect(c.tucked).toBeTrue();
    });

    it('does not count small back-and-forth jitter', () => {
      at(200, 0);
      expect(c.tucked).toBeTrue();
      for (let i = 1; i <= 20; i++) at(200 + (i % 2 ? -20 : 20), 1000 + i * 30);
      expect(c.tucked).toBeTrue();
    });

    it('ignores bounce past the bottom and always shows near the top', () => {
      at(200, 0);
      expect(c.tucked).toBeTrue();
      at(room - 10, 1000);
      at(room + 60, 1100);        // overscroll past the bottom
      at(room, 1200);             // and the bounce back: not a real scroll up
      expect(c.tucked).toBeTrue();
      at(10, 2000);
      expect(c.tucked).toBeFalse();
    });

    it('never tucks on a page that barely scrolls', () => {
      room = 100;
      at(80, 0);
      expect(c.tucked).toBeFalse();
    });

    it('stays put on desktop', () => {
      (c as any).isMobile = false;
      at(500, 0);
      expect(c.tucked).toBeFalse();
    });
  });
});
