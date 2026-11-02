import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';

import { AppSelectComponent } from './app-select.component';
import { AppOptionComponent } from './app-option.component';

@Component({
  // The select sits in a short box that hides overflow, like a table box with
  // one row (the Inventory bug, v1.26.1): its panel must not be clipped.
  template: `
    <div class="clip-box" style="height: 40px; overflow: hidden;">
    <app-select [(ngModel)]="selected" [placeholder]="'Choose one…'" [disabled]="isDisabled">
      <app-option value="a">Alpha</app-option>
      <app-option value="b">Beta</app-option>
      <app-option value="c" [disabled]="true">Gamma (disabled)</app-option>
    </app-select>
    </div>
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

    select = hostFixture.debugElement.query(By.directive(AppSelectComponent)).componentInstance;
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
      const insideEl = hostFixture.debugElement.query(By.directive(AppSelectComponent)).nativeElement;

      select.onDocumentClick({ target: insideEl } as any);

      expect(select.open).toBeTrue();
    });
  });

  describe('the panel on the overlay layer (never clipped)', () => {
    afterEach(() => { select.open = false; });

    it('opens outside the clipping box, as wide as the box it belongs to', () => {
      select.toggle();
      hostFixture.detectChanges();
      const panel = document.querySelector('.cdk-overlay-container .app-select-panel') as HTMLElement;
      expect(panel).toBeTruthy();
      const box = hostFixture.nativeElement.querySelector('.clip-box') as HTMLElement;
      expect(box.contains(panel)).toBeFalse();
      expect(panel.textContent).toContain('Alpha');
      const trigger = hostFixture.nativeElement.querySelector('.app-select-trigger') as HTMLElement;
      expect(Math.round(select.panelElement!.getBoundingClientRect().width))
        .toBe(Math.round(trigger.getBoundingClientRect().width));
    });

    it('a click on an option counts as inside: it selects, then closes', fakeAsync(() => {
      select.toggle();
      hostFixture.detectChanges();
      const option = Array.from(document.querySelectorAll('.cdk-overlay-container .app-select-option'))
        .find(li => li.textContent!.includes('Beta')) as HTMLElement;
      select.onDocumentClick({ target: option } as any);
      expect(select.open).toBeTrue();
      option.click();
      hostFixture.detectChanges();
      tick();
      expect(host.selected).toBe('b');
      expect(select.open).toBeFalse();
      expect(document.querySelector('.cdk-overlay-container .app-select-panel')).toBeNull();
    }));
  });
});
