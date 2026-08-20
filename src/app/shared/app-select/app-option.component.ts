import { Component, ElementRef, Input } from '@angular/core';

/**
 * Data-carrier for one <app-select> option — written the same way a native
 * <option> would be (value + projected text label), so migrating an existing
 * <select><option *ngFor="...">{{ x.name }}</option></select> to
 * <app-select><app-option *ngFor="...">{{ x.name }}</app-option></app-select>
 * is a near-mechanical tag rename, not a data-shape rewrite.
 *
 * Renders nothing itself (host is display:none) — AppSelectComponent reads
 * this instance's `value`/`disabled`/`label` via @ContentChildren and does
 * all the actual visible rendering in its own trigger + panel.
 */
@Component({
  selector: 'app-option',
  template: '<ng-content></ng-content>',
  host: { style: 'display:none' }
})
export class AppOptionComponent {
  @Input() value: any = null;
  @Input() disabled = false;

  constructor(private elementRef: ElementRef<HTMLElement>) { }

  /** The option's display text — whatever was projected inside the tag,
   *  same as reading a native <option>'s textContent. */
  get label(): string {
    return (this.elementRef.nativeElement.textContent || '').trim();
  }
}
