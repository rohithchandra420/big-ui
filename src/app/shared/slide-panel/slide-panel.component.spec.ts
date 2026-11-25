import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';

import { SlidePanelComponent } from './slide-panel.component';
import { panelHistory } from './panel-history';

@Component({
  template: `<app-slide-panel [open]="open" title="Unit A" subtitle="Dorm · 4 beds" (closed)="closes = closes + 1; open = false">
    <p class="inner">Hello</p>
  </app-slide-panel>`
})
class HostComponent {
  open = false;
  closes = 0;
}

@Component({
  template: `
    <app-slide-panel [open]="a" title="A" (closed)="a = false"><p>A</p></app-slide-panel>
    <app-slide-panel [open]="b" title="B" (closed)="b = false"><p>B</p></app-slide-panel>`
})
class StackHostComponent {
  a = false;
  b = false;
}

/** Stand-in for the browser history, so the tests never really navigate. */
function fakeHistory() {
  const entries: any[] = [{ navigationId: 1 }];
  spyOnProperty(history, 'state', 'get').and.callFake(() => entries[entries.length - 1]);
  spyOn(history, 'pushState').and.callFake((st: any) => { entries.push(st); });
  const pop = () => { entries.pop(); window.dispatchEvent(new PopStateEvent('popstate')); };
  // A real back() lands later, not inside the call.
  spyOn(history, 'back').and.callFake(() => { setTimeout(pop); });
  return {
    entries,
    /** The phone's Back button. */
    userBack: pop,
  };
}

describe('SlidePanelComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let h: ReturnType<typeof fakeHistory>;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    panelHistory.reset();
    h = fakeHistory();
    await TestBed.configureTestingModule({
      imports: [MatIconModule],
      declarations: [SlidePanelComponent, HostComponent, StackHostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  // A panel left open takes its entry out on destroy; let that back() land
  // before the next test, so it does not leak into it.
  afterEach(async () => {
    fixture.destroy();
    await new Promise(r => setTimeout(r)); // let a pending fake back() land
    panelHistory.reset();
  });

  it('renders nothing while closed', () => {
    expect(el().querySelector('.sp-panel')).toBeNull();
    expect(el().querySelector('.inner')).toBeNull();
  });

  it('shows the title, subtitle and projected content when open', () => {
    host.open = true;
    fixture.detectChanges();
    const panel = el().querySelector('.sp-panel')!;
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(el().querySelector('.sp-title')!.textContent!.trim()).toBe('Unit A');
    expect(el().querySelector('.sp-sub')!.textContent!.trim()).toBe('Dorm · 4 beds');
    expect(el().querySelector('.inner')!.textContent).toBe('Hello');
  });

  it('closes on ✕, on a tap outside and on Esc', fakeAsync(() => {
    host.open = true;
    fixture.detectChanges();
    (el().querySelector('.sp-x') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();
    expect(host.closes).toBe(1);
    expect(el().querySelector('.sp-panel')).toBeNull();

    host.open = true;
    fixture.detectChanges();
    (el().querySelector('.sp-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    tick();
    expect(host.closes).toBe(2);

    host.open = true;
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    tick();
    expect(host.closes).toBe(3);
  }));

  it('ignores Esc while closed', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.closes).toBe(0);
  });

  describe('Back button (B-086)', () => {
    it('adds a history entry when it opens and Back closes the panel', () => {
      host.open = true;
      fixture.detectChanges();
      expect(history.pushState).toHaveBeenCalledTimes(1);
      expect(h.entries.length).toBe(2);

      h.userBack();
      fixture.detectChanges();
      expect(host.closes).toBe(1);
      expect(el().querySelector('.sp-panel')).toBeNull();
      expect(history.back).not.toHaveBeenCalled();
      expect(h.entries.length).toBe(1);
    });

    it('takes its entry back out when closed with ✕', fakeAsync(() => {
      host.open = true;
      fixture.detectChanges();
      (el().querySelector('.sp-x') as HTMLButtonElement).click();
      fixture.detectChanges();
      tick();
      expect(history.back).toHaveBeenCalledTimes(1);
      expect(h.entries.length).toBe(1);
      expect(host.closes).toBe(1);
    }));

    it('does not undo a navigation made from inside the panel', fakeAsync(() => {
      host.open = true;
      fixture.detectChanges();
      h.entries.push({ navigationId: 2 }); // a link inside the panel opened another page
      fixture.destroy();
      tick();
      expect(history.back).not.toHaveBeenCalled();
    }));

    it('with two panels open, Back closes only the top one', () => {
      const f = TestBed.createComponent(StackHostComponent);
      f.detectChanges();
      f.componentInstance.a = true;
      f.detectChanges();
      f.componentInstance.b = true;
      f.detectChanges();
      expect(h.entries.length).toBe(3);

      h.userBack();
      f.detectChanges();
      expect(f.componentInstance.b).toBeFalse();
      expect(f.componentInstance.a).toBeTrue();

      h.userBack();
      f.detectChanges();
      expect(f.componentInstance.a).toBeFalse();
      expect(history.back).not.toHaveBeenCalled();
      f.destroy();
    });

    it('reopening right after a close waits for its own back() first', fakeAsync(() => {
      host.open = true;
      fixture.detectChanges();
      host.open = false;
      fixture.detectChanges();
      host.open = true;
      fixture.detectChanges();
      expect(history.pushState).toHaveBeenCalledTimes(1); // second push queued
      tick();
      expect(history.pushState).toHaveBeenCalledTimes(2);
      expect(h.entries.length).toBe(2);

      h.userBack();
      fixture.detectChanges();
      expect(host.open).toBeFalse();
    }));
  });
});
