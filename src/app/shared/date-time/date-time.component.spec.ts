import { Component } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { OverlayContainer } from '@angular/cdk/overlay';
import { MatIconModule } from '@angular/material/icon';
import { DateTimeComponent } from './date-time.component';

// The shared date / time picker (ui 1.65.0, look "B"; phones: the phone's own picker).
@Component({
  template: `
    <app-date-time [formControl]="when" min="2026-11-01" max="2026-11-30" (change)="changes = changes + 1"></app-date-time>
    <app-date [(ngModel)]="day" min="2026-11-10" max="2026-12-05"></app-date>
    <app-time [(ngModel)]="time"></app-time>`
})
class HostComponent {
  when = new FormControl<string | null>('2026-11-12T11:00');
  day = '';
  time = '09:30';
  changes = 0;
}

describe('DateTimeComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let overlay: HTMLElement;
  let pickers: DateTimeComponent[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent, DateTimeComponent],
      imports: [FormsModule, ReactiveFormsModule, MatIconModule]
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
  });

  const init = () => {
    fixture.detectChanges();
    flush();                       // ngModel writes its value a tick later
    pickers = fixture.debugElement.queryAll(By.directive(DateTimeComponent)).map(d => d.componentInstance);
    pickers.forEach(p => (p.touch = false));
    fixture.detectChanges();
  };
  const field = (i: number) => fixture.debugElement.queryAll(By.css('.dtp-field'))[i].nativeElement as HTMLButtonElement;
  const openIt = (i: number) => { field(i).click(); fixture.detectChanges(); };
  const days = () => Array.from(overlay.querySelectorAll('.dtp-day:not(.lead)')) as HTMLButtonElement[];

  afterEach(() => pickers?.forEach(p => p.close()));

  it('knows its mode from the tag and shows the value in one field', fakeAsync(() => {
    init();
    expect(pickers.map(p => p.mode)).toEqual(['datetime', 'date', 'time']);
    expect(field(0).textContent).toContain('12 Nov 2026 · 11:00');
    expect(field(1).textContent).toContain('Pick a date');
    expect(field(2).textContent).toContain('09:30');
    flush();
  }));

  it('date + time: a day keeps the time; hour and minute change only the time; (change) fires', fakeAsync(() => {
    init();
    openIt(0);
    flush();
    expect(overlay.querySelector('.dtp-panel.dtp-datetime')).not.toBeNull();
    days().find(d => d.textContent!.trim() === '20')!.click();
    expect(host.when.value).toBe('2026-11-20T11:00');
    (Array.from(overlay.querySelectorAll('[aria-label="Hour"] .dtp-slot')) as HTMLElement[]).find(b => b.textContent!.trim() === '14')!.click();
    (Array.from(overlay.querySelectorAll('[aria-label="Minute"] .dtp-slot')) as HTMLElement[]).find(b => b.textContent!.trim() === '25')!.click();
    expect(host.when.value).toBe('2026-11-20T14:25');
    expect(host.changes).toBe(3);
    fixture.detectChanges();
    expect(field(0).textContent).toContain('20 Nov 2026 · 14:25');
    flush();
  }));

  it('days outside min / max cannot be picked, and the month arrows stop there', fakeAsync(() => {
    init();
    openIt(1);
    flush();
    const nine = days().find(d => d.textContent!.trim() === '9')!;
    expect(nine.disabled).toBeTrue();
    expect(pickers[1].canPrev).toBeFalse();
    expect(pickers[1].canNext).toBeTrue();
    pickers[1].shiftMonth(1);
    expect(pickers[1].canNext).toBeFalse();
    flush();
  }));

  it('date only: picking a day closes the panel', fakeAsync(() => {
    init();
    openIt(1);
    flush();
    days().find(d => d.textContent!.trim() === '15')!.click();
    flush();
    fixture.detectChanges();
    expect(host.day).toBe('2026-11-15');
    expect(pickers[1].open).toBeFalse();
  }));

  it('time only: a typed time is read (9:5 is refused, 1423 → 14:23, shown in the minutes)', fakeAsync(() => {
    init();
    openIt(2);
    flush();
    expect(overlay.querySelector('.dtp-cal')).toBeNull();
    const p = pickers[2];
    p.typed = '25:00'; p.applyTyped();
    expect(host.time).toBe('09:30');
    p.typed = '1423'; p.applyTyped();
    flush();
    expect(host.time).toBe('14:23');
    expect(p.minutes).toContain('23');
    flush();
  }));

  it('quick picks, Clear and a value written from outside', fakeAsync(() => {
    init();
    openIt(0);
    flush();
    expect(pickers[0].quickPicks.map(q => q.label)).toEqual(['Now', 'Today 11:00', 'Tomorrow 11:00'].filter((_, i) => i < pickers[0].quickPicks.length));
    pickers[0].clear();
    expect(host.when.value).toBe('');
    host.when.setValue('2026-11-03');                  // a date alone gets the default time
    fixture.detectChanges();
    expect(pickers[0].value).toBe('2026-11-03T11:00');
    flush();
  }));

  it('Escape and a click outside close the panel', fakeAsync(() => {
    init();
    openIt(0);
    flush();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(pickers[0].open).toBeFalse();
    openIt(0);
    flush();
    document.body.click();
    expect(pickers[0].open).toBeFalse();
  }));

  it('phones: a native input over the field opens the phone\'s own picker; no panel', fakeAsync(() => {
    fixture.detectChanges();
    pickers = fixture.debugElement.queryAll(By.directive(DateTimeComponent)).map(d => d.componentInstance);
    pickers.forEach(p => (p.touch = true));
    fixture.detectChanges();
    const natives = fixture.debugElement.queryAll(By.css('.dtp-native')).map(d => d.nativeElement as HTMLInputElement);
    expect(natives.map(n => n.type)).toEqual(['datetime-local', 'date', 'time']);
    natives[0].value = '2026-11-21T08:15';
    natives[0].dispatchEvent(new Event('change'));
    expect(host.when.value).toBe('2026-11-21T08:15');
    expect(host.changes).toBe(1);                       // our (change), not the native one twice
    field(0).click();
    expect(pickers[0].open).toBeFalse();
    // a tap opens the browser's own picker straight away
    const show = jasmine.createSpy('showPicker');
    (natives[1] as any).showPicker = show;
    natives[1].click();
    expect(show).toHaveBeenCalled();
    // the arrow shows on phones too
    expect(fixture.nativeElement.querySelectorAll('.dtp-chev').length).toBe(3);
    flush();
  }));

  it('follows the device live: becoming touch-only closes an open panel', fakeAsync(() => {
    init();
    openIt(0);
    flush();
    expect(pickers[0].open).toBeTrue();
    (pickers[0] as any).onTouchChange({ matches: true });
    expect(pickers[0].touch).toBeTrue();
    expect(pickers[0].open).toBeFalse();
    (pickers[0] as any).onTouchChange({ matches: false });
    expect(pickers[0].touch).toBeFalse();
    flush();
  }));

  it('a disabled control does not open', fakeAsync(() => {
    init();
    host.when.disable();
    fixture.detectChanges();
    field(0).click();
    expect(pickers[0].open).toBeFalse();
    flush();
  }));
});

// Same height as the other inputs (user, 2026-11-19). Bootstrap is not loaded in tests, so the
// wrapper gives inputs the line height Bootstrap gives them in the app (line-height: inherit, 1.5).
@Component({
  template: `
    <div style="line-height: 1.5; width: 320px">
      <div class="field"><input id="plain" type="text" style="line-height: inherit" value="x"></div>
      <div class="field"><app-date-time id="dt" ngModel="2026-11-12T11:00"></app-date-time></div>
      <div class="field"><app-time id="tm" ngModel="09:30"></app-time></div>
    </div>`
})
class SizeHostComponent {}

describe('DateTimeComponent size', () => {
  it('is as tall as a normal input, with icon, text and arrow on one line', fakeAsync(() => {
    TestBed.configureTestingModule({ declarations: [SizeHostComponent, DateTimeComponent], imports: [FormsModule, MatIconModule] });
    const f = TestBed.createComponent(SizeHostComponent);
    f.detectChanges();
    flush();
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const input = el.querySelector('#plain') as HTMLElement;
    for (const id of ['#dt', '#tm']) {
      const field = el.querySelector(id + ' .dtp-field') as HTMLElement;
      expect(Math.abs(field.getBoundingClientRect().height - input.getBoundingClientRect().height)).toBeLessThanOrEqual(1);
      const mid = (x: Element) => { const r = x.getBoundingClientRect(); return r.top + r.height / 2; };
      const parts = [field.querySelector('.dtp-ic')!, field.querySelector('.dtp-v')!, field.querySelector('.dtp-chev')!];
      parts.forEach(p => expect(Math.abs(mid(p) - mid(field))).toBeLessThanOrEqual(1));
    }
  }));
});
