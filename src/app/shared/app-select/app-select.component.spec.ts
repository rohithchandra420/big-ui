import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { AppSelectComponent } from './app-select.component';
import { AppOptionComponent } from './app-option.component';

@Component({
  template: `
    <app-select [(ngModel)]="selected" [placeholder]="'Choose one…'" [disabled]="isDisabled">
      <app-option value="a">Alpha</app-option>
      <app-option value="b">Beta</app-option>
      <app-option value="c" [disabled]="true">Gamma (disabled)</app-option>
    </app-select>
  `
})
class HostComponent {
  selected: string | null = null;
  isDisabled = false;
}

describe('AppSelectComponent', () => {
  let hostFixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let select: AppSelectComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppSelectComponent, AppOptionComponent, HostComponent],
      imports: [FormsModule],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    hostFixture = TestBed.createComponent(HostComponent);
    host = hostFixture.componentInstance;
    hostFixture.detectChanges();

    select = hostFixture.debugElement.children[0].componentInstance;
  });

  it('shows the placeholder when nothing is selected', () => {
    expect(select.displayLabel).toBe('Choose one…');
  });

  it('writeValue() (via ngModel) sets the selected option and its label', fakeAsync(() => {
    // Standalone ngModel (no wrapping <form>) defers its first writeValue()
    // to a microtask to avoid ExpressionChangedAfterItHasBeenCheckedError —
    // tick() flushes it so the assertion sees the update.
    host.selected = 'b';
    hostFixture.detectChanges();
    tick();
    expect(select.value).toBe('b');
    expect(select.displayLabel).toBe('Beta');
  }));

  it('toggle() opens and closes the panel', () => {
    expect(select.open).toBeFalse();
    select.toggle();
    expect(select.open).toBeTrue();
    select.toggle();
    expect(select.open).toBeFalse();
  });

  it('toggle() does nothing while disabled', () => {
    select.disabled = true;
    select.toggle();
    expect(select.open).toBeFalse();
  });

  it('selectOption() sets the value, propagates it out via ngModel, and closes the panel', () => {
    select.open = true;
    const betaOption = select.options.find(o => o.value === 'b')!;

    select.selectOption(betaOption);
    hostFixture.detectChanges();

    expect(select.value).toBe('b');
    expect(host.selected).toBe('b');
    expect(select.open).toBeFalse();
  });

  it('selectOption() emits valueChange — for callers using formControlName without ngModel', () => {
    const emitted: any[] = [];
    select.valueChange.subscribe(v => emitted.push(v));
    const alphaOption = select.options.find(o => o.value === 'a')!;

    select.selectOption(alphaOption);

    expect(emitted).toEqual(['a']);
  });

  it('selectOption() does nothing for a disabled option', () => {
    const gammaOption = select.options.find(o => o.value === 'c')!;
    select.selectOption(gammaOption);
    expect(select.value).toBeNull();
  });

  describe('keyboard interaction', () => {
    it('Enter opens the panel when closed', () => {
      select.onKeydown({ key: 'Enter', preventDefault: () => { } } as any);
      expect(select.open).toBeTrue();
    });

    it('Escape closes the panel', () => {
      select.open = true;
      select.onKeydown({ key: 'Escape', preventDefault: () => { } } as any);
      expect(select.open).toBeFalse();
    });

    it('ArrowDown opens the panel first, then moves to the next enabled option on subsequent presses', () => {
      const preventDefault = () => { };
      select.onKeydown({ key: 'ArrowDown', preventDefault } as any); // opens only
      expect(select.open).toBeTrue();
      expect(select.value).toBeNull();

      select.onKeydown({ key: 'ArrowDown', preventDefault } as any); // -> Alpha (first enabled)
      expect(select.value).toBe('a');

      select.onKeydown({ key: 'ArrowDown', preventDefault } as any); // -> Beta
      expect(select.value).toBe('b');
    });

    it('ArrowDown skips a disabled option and wraps back to the first', () => {
      const preventDefault = () => { };
      select.value = 'b';
      select.open = true;
      select.onKeydown({ key: 'ArrowDown', preventDefault } as any); // Beta -> wraps past disabled Gamma -> Alpha
      expect(select.value).toBe('a');
    });

    it('does nothing on keydown while disabled', () => {
      select.disabled = true;
      select.onKeydown({ key: 'Enter', preventDefault: () => { } } as any);
      expect(select.open).toBeFalse();
    });
  });

  describe('onDocumentClick()', () => {
    it('closes the panel on a click outside the component', () => {
      select.open = true;
      const outsideEl = document.createElement('div');
      document.body.appendChild(outsideEl);

      select.onDocumentClick({ target: outsideEl } as any);

      expect(select.open).toBeFalse();
      document.body.removeChild(outsideEl);
    });

    it('leaves the panel open for a click inside the component', () => {
      select.open = true;
      const insideEl = hostFixture.debugElement.children[0].nativeElement;

      select.onDocumentClick({ target: insideEl } as any);

      expect(select.open).toBeTrue();
    });
  });
});
