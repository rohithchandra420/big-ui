import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';

import { BackClosesDirective } from './back-closes.directive';
import { panelHistory } from './panel-history';

@Component({
  template: `<div class="panel-overlay" [appBackCloses]="panelOpen" (backClose)="closePanel()"></div>`
})
class DrawerHostComponent {
  panelOpen = false;
  closes = 0;
  closePanel(): void {
    this.closes++;
    this.panelOpen = false;
  }
}

/** Stand-in for the browser history, so the tests never really navigate. */
function fakeHistory() {
  const entries: any[] = [{ navigationId: 1 }];
  spyOnProperty(history, 'state', 'get').and.callFake(() => entries[entries.length - 1]);
  spyOn(history, 'pushState').and.callFake((st: any) => { entries.push(st); });
  const pop = () => { entries.pop(); window.dispatchEvent(new PopStateEvent('popstate')); };
  spyOn(history, 'back').and.callFake(() => { setTimeout(pop); });
  return { entries, userBack: pop };
}

describe('BackClosesDirective (B-086)', () => {
  let fixture: ComponentFixture<DrawerHostComponent>;
  let host: DrawerHostComponent;
  let h: ReturnType<typeof fakeHistory>;
  const router = { getCurrentNavigation: jasmine.createSpy('getCurrentNavigation').and.returnValue(null) };

  beforeEach(async () => {
    panelHistory.reset();
    h = fakeHistory();
    router.getCurrentNavigation.and.returnValue(null);
    await TestBed.configureTestingModule({
      declarations: [BackClosesDirective, DrawerHostComponent],
      providers: [{ provide: Router, useValue: router }],
    }).compileComponents();
    fixture = TestBed.createComponent(DrawerHostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(async () => {
    fixture.destroy();
    await new Promise(r => setTimeout(r)); // let a pending fake back() land
    panelHistory.reset();
  });

  it('adds nothing to history while the drawer is closed', () => {
    expect(history.pushState).not.toHaveBeenCalled();
  });

  it('Back closes the open drawer and keeps the page', () => {
    host.panelOpen = true;
    fixture.detectChanges();
    expect(h.entries.length).toBe(2);

    h.userBack();
    fixture.detectChanges();
    expect(host.closes).toBe(1);
    expect(host.panelOpen).toBeFalse();
    expect(h.entries.length).toBe(1);
  });

  it('closing the drawer another way takes its entry back out', fakeAsync(() => {
    host.panelOpen = true;
    fixture.detectChanges();
    host.closePanel(); // ✕, Esc or a tap on the overlay
    fixture.detectChanges();
    tick();
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(h.entries.length).toBe(1);
    expect(host.closes).toBe(1);
  }));

  it('leaves history alone when a page change starts as the drawer closes', fakeAsync(() => {
    host.panelOpen = true;
    fixture.detectChanges();
    router.getCurrentNavigation.and.returnValue({} as any); // e.g. "Open registration"
    host.closePanel();
    fixture.detectChanges();
    tick();
    expect(history.back).not.toHaveBeenCalled();
  }));
});
