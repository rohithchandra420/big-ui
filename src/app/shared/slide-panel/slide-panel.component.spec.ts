import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';

import { SlidePanelComponent } from './slide-panel.component';

@Component({
  template: `<app-slide-panel [open]="open" title="Unit A" subtitle="Dorm · 4 beds" (closed)="closes = closes + 1; open = false">
    <p class="inner">Hello</p>
  </app-slide-panel>`
})
class HostComponent {
  open = false;
  closes = 0;
}

describe('SlidePanelComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MatIconModule],
      declarations: [SlidePanelComponent, HostComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
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

  it('closes on ✕, on a tap outside and on Esc', () => {
    host.open = true;
    fixture.detectChanges();
    (el().querySelector('.sp-x') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.closes).toBe(1);
    expect(el().querySelector('.sp-panel')).toBeNull();

    host.open = true;
    fixture.detectChanges();
    (el().querySelector('.sp-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(host.closes).toBe(2);

    host.open = true;
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(host.closes).toBe(3);
  });

  it('ignores Esc while closed', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.closes).toBe(0);
  });
});
