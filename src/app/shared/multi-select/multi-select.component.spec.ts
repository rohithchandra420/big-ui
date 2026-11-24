import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';

import { MultiSelectComponent, MultiSelectOption } from './multi-select.component';

describe('MultiSelectComponent (B-083)', () => {
  let fixture: ComponentFixture<MultiSelectComponent>;
  let c: MultiSelectComponent;
  let overlay: HTMLElement;
  const options: MultiSelectOption[] = [
    { value: 'a', label: 'Weekend Pass', group: 'Festival Passes', count: 3 },
    { value: 'b', label: 'Full Festival Pass', group: 'Festival Passes', count: 1 },
    { value: 'c', label: 'Shared Tent', group: 'Stay Passes', count: 0 }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [MultiSelectComponent], schemas: [NO_ERRORS_SCHEMA] }).compileComponents();
    fixture = TestBed.createComponent(MultiSelectComponent);
    c = fixture.componentInstance;
    c.options = options;
    c.placeholder = 'All pass types';
    c.noun = 'pass types';
    fixture.detectChanges();
    overlay = TestBed.inject(OverlayContainer).getContainerElement();
  });

  afterEach(() => { c.open = false; });

  const trigger = () => fixture.nativeElement.querySelector('.app-select-trigger') as HTMLElement;

  it('shows the placeholder, then the ticked names, then a count', () => {
    expect(c.displayLabel).toBe('All pass types');
    c.writeValue(['a']);
    expect(c.displayLabel).toBe('Weekend Pass');
    c.writeValue(['a', 'c']);
    expect(c.displayLabel).toBe('Weekend Pass, Shared Tent');
    c.writeValue(['a', 'b', 'c']);
    expect(c.displayLabel).toBe('3 pass types');
  });

  it('opens on the overlay with group headings and counts, and stays open while ticking', () => {
    const changes: string[][] = [];
    c.registerOnChange(v => changes.push(v));
    trigger().click();
    fixture.detectChanges();
    expect(c.open).toBeTrue();
    expect(Array.from(overlay.querySelectorAll('.ms-group')).map(e => e.textContent?.trim())).toEqual(['Festival Passes', 'Stay Passes']);
    const rows = overlay.querySelectorAll('.ms-opt');
    expect(rows.length).toBe(3);
    expect(rows[0].querySelector('.ms-c')?.textContent?.trim()).toBe('3');
    (rows[0] as HTMLElement).click();
    (rows[2] as HTMLElement).click();
    fixture.detectChanges();
    expect(c.open).toBeTrue();
    expect(changes[changes.length - 1]).toEqual(['a', 'c']);
    expect(overlay.querySelectorAll('.ms-opt.on').length).toBe(2);
    (rows[0] as HTMLElement).click();
    expect(c.value).toEqual(['c']);
  });

  it('"clear" unticks everything; a click outside closes', () => {
    const emitted: string[][] = [];
    c.valueChange.subscribe(v => emitted.push(v));
    c.writeValue(['a', 'b']);
    trigger().click();
    fixture.detectChanges();
    (overlay.querySelector('.ms-clear') as HTMLButtonElement).click();
    expect(c.value).toEqual([]);
    expect(emitted[emitted.length - 1]).toEqual([]);
    document.body.click();
    expect(c.open).toBeFalse();
  });

  it('does not open when disabled', () => {
    c.setDisabledState(true);
    trigger().click();
    expect(c.open).toBeFalse();
  });
});
