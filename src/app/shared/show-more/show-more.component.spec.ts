import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { ShowMoreComponent } from './show-more.component';

/** Stand-in for the browser's IntersectionObserver: the test says when the end of the list is in view. */
class FakeObserver {
  static last: FakeObserver | null = null;
  observed: Element[] = [];
  constructor(private cb: IntersectionObserverCallback) { FakeObserver.last = this; }
  observe(el: Element) { this.observed.push(el); }
  unobserve(el: Element) { this.observed = this.observed.filter(e => e !== el); }
  disconnect() { this.observed = []; }
  /** The browser reports the end of the list (in view or not). */
  report(inView: boolean) {
    this.cb(this.observed.map(target => ({ target, isIntersecting: inView } as IntersectionObserverEntry)), this as any);
  }
}

describe('ShowMoreComponent (phone cards, infinite scroll)', () => {
  let fixture: ComponentFixture<ShowMoreComponent>;
  let component: ShowMoreComponent;
  let asks: number;
  const realIO = (window as any).IntersectionObserver;
  const el = () => fixture.nativeElement as HTMLElement;

  /** Set inputs the way a parent template does (ngOnChanges runs). */
  const set = (shown: number, total: number, busy = false) => {
    fixture.componentRef.setInput('shown', shown);
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
  };

  const make = async () => {
    await TestBed.configureTestingModule({ declarations: [ShowMoreComponent], schemas: [NO_ERRORS_SCHEMA] }).compileComponents();
    fixture = TestBed.createComponent(ShowMoreComponent);
    component = fixture.componentInstance;
    asks = 0;
    component.more.subscribe(() => asks++);
  };

  afterEach(() => { (window as any).IntersectionObserver = realIO; FakeObserver.last = null; });

  describe('with infinite scroll', () => {
    beforeEach(async () => {
      (window as any).IntersectionObserver = FakeObserver;
      await make();
    });

    const spinner = () => el().querySelector('.pc-more-spin');

    it('at the end of the list: the spinner shows for a second, then it asks for more', fakeAsync(() => {
      set(25, 312);
      expect(el().textContent).toContain('Showing 25 of 312');
      expect(el().querySelector('button')).toBeNull();
      expect(spinner()).toBeNull();
      FakeObserver.last!.report(true);
      fixture.detectChanges();
      expect(spinner()?.textContent).toContain('Loading more');
      expect(asks).toBe(0);
      tick(999);
      expect(asks).toBe(0);
      tick(1);
      fixture.detectChanges();
      expect(asks).toBe(1);
      expect(spinner()).toBeNull();
    }));

    it('does not ask while the end is out of view', fakeAsync(() => {
      set(25, 312);
      FakeObserver.last!.report(false);
      tick(2000);
      expect(asks).toBe(0);
    }));

    it('asks only once per list length', fakeAsync(() => {
      set(25, 312);
      FakeObserver.last!.report(true);
      FakeObserver.last!.report(true);
      tick(1000);
      FakeObserver.last!.report(true);
      tick(1000);
      expect(asks).toBe(1);
      set(50, 312);
      FakeObserver.last!.report(true);
      tick(1000);
      expect(asks).toBe(2);
    }));

    it('after the list grows it waits for the browser to measure again (no chain loading)', fakeAsync(() => {
      set(25, 312);
      FakeObserver.last!.report(true);
      tick(1000);
      set(50, 312);
      tick(2000);
      expect(asks).toBe(1);
      expect(FakeObserver.last!.observed.length).toBe(1);
    }));

    it('waits while a server page is loading (spinner on), then goes on', fakeAsync(() => {
      set(25, 100, true);
      FakeObserver.last!.report(true);
      tick(1000);
      expect(asks).toBe(0);
      expect(spinner()).not.toBeNull();
      set(25, 100, false);
      FakeObserver.last!.report(true);
      tick(1000);
      expect(asks).toBe(1);
    }));

    it('stops at the end of the list', fakeAsync(() => {
      set(58, 58);
      FakeObserver.last!.report(true);
      tick(1000);
      fixture.detectChanges();
      expect(asks).toBe(0);
      expect(spinner()).toBeNull();
    }));

    it('a new filter drops a waiting load and may ask again', fakeAsync(() => {
      set(25, 312);
      FakeObserver.last!.report(true);
      tick(500);
      set(25, 90);
      tick(1000);
      expect(asks).toBe(0);
      FakeObserver.last!.report(true);
      tick(1000);
      expect(asks).toBe(1);
    }));

    it('a closed page drops a waiting load', fakeAsync(() => {
      set(25, 312);
      FakeObserver.last!.report(true);
      fixture.destroy();
      tick(1000);
      expect(asks).toBe(0);
    }));

    it('nothing at all for an empty list', () => {
      set(0, 0);
      expect(el().querySelector('.pc-more')).toBeNull();
    });
  });

  describe('without IntersectionObserver (fallback button)', () => {
    beforeEach(async () => {
      (window as any).IntersectionObserver = undefined;
      await make();
    });

    it('offers the next 25, or what is left', () => {
      set(25, 312);
      expect(el().querySelector('button')?.textContent?.trim()).toBe('Show 25 more');
      set(50, 58);
      expect(el().querySelector('button')?.textContent?.trim()).toBe('Show 8 more');
    });

    it('emits on tap straight away; no button once everything shows', () => {
      set(25, 100);
      (el().querySelector('button') as HTMLButtonElement).click();
      expect(asks).toBe(1);
      set(100, 100);
      expect(el().querySelector('button')).toBeNull();
    });
  });
});
