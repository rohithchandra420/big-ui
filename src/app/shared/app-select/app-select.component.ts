import {
  AfterContentInit, Component, ContentChildren, ElementRef, EventEmitter, forwardRef,
  HostListener, Input, OnDestroy, Output, QueryList, TemplateRef, ViewChild, ViewContainerRef
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Subscription } from 'rxjs';

import { AppOptionComponent } from './app-option.component';

/**
 * Bug fix (2026-08-20, follow-up to Bug #3): native <select>'s dropdown
 * *panel* can't be reliably width-constrained via CSS in most browsers — it
 * auto-sizes to the widest option text, which is what kept overflowing past
 * the closed box no matter how the box itself was styled. This is a fully
 * custom-rendered replacement (not native <select> underneath, not
 * mat-select) so the panel's width is just a CSS rule tied to the trigger,
 * guaranteed to never exceed it.
 *
 * Drop-in for `formControlName` / `[(ngModel)]` via ControlValueAccessor —
 * behaves like a native select from the binding's point of view. Options are
 * written as child <app-option> tags (see that component) rather than a
 * data-array @Input, specifically so migrating an existing template is a
 * near-mechanical <select>/<option> → <app-select>/<app-option> tag rename.
 *
 * Bug fix (2026-11-03, v1.26.1): the panel opens on the CDK overlay layer
 * (attached to <body>, anchored to the trigger, same width, below — or above
 * when there's no room — and following scroll), so no container with
 * overflow hidden/auto (table boxes, side panels, dialogs) can clip it.
 */
@Component({
  selector: 'app-select',
  templateUrl: './app-select.component.html',
  styleUrls: ['./app-select.component.css'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => AppSelectComponent),
    multi: true
  }]
})
export class AppSelectComponent implements ControlValueAccessor, AfterContentInit, OnDestroy {
  @ContentChildren(AppOptionComponent, { descendants: true }) optionsList!: QueryList<AppOptionComponent>;

  @Input() placeholder = 'Select…';
  @Input() disabled = false;

  /** Mirrors a native <select>'s (change) event — fires on every value
   *  change (click or keyboard), independent of the ControlValueAccessor
   *  wiring. Needed because a plain `formControlName` binding (no ngModel)
   *  doesn't get an automatic template-level "value changed" event the way
   *  [(ngModel)] does; call sites that used (change) on a native <select>
   *  for a side effect can switch to (valueChange) here. */
  @Output() valueChange = new EventEmitter<any>();

  @ViewChild('trigger', { static: true }) triggerRef!: ElementRef<HTMLElement>;
  @ViewChild('panelTpl', { static: true }) panelTpl!: TemplateRef<unknown>;

  /** The panel is open — attaching / detaching it on the overlay layer. */
  get open(): boolean { return this._open; }
  set open(value: boolean) {
    if (value === this._open) return;
    this._open = value;
    value ? this.attachPanel() : this.detachPanel();
  }
  private _open = false;
  private overlayRef?: OverlayRef;

  value: any = null;

  private optionsSub?: Subscription;
  private onChange: (value: any) => void = () => { };
  private onTouched: () => void = () => { };

  constructor(
    private hostRef: ElementRef<HTMLElement>,
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef
  ) { }

  ngAfterContentInit(): void {
    // *ngFor-driven option lists (the common case — every real usage in this
    // app) resolve asynchronously after content init; re-render once they're
    // in so the trigger shows the right selected label instead of the
    // placeholder on first paint.
    this.optionsSub = this.optionsList.changes.subscribe(() => { });
  }

  ngOnDestroy(): void {
    this.optionsSub?.unsubscribe();
    this.overlayRef?.dispose();
  }

  // ── the panel on the overlay layer ────────────────────────────

  private attachPanel(): void {
    if (!this.panelTpl || !this.triggerRef) return;
    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        positionStrategy: this.overlay.position()
          .flexibleConnectedTo(this.triggerRef)
          .withPositions([
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
            { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
          ])
          .withFlexibleDimensions(false)
          .withPush(false),
        scrollStrategy: this.overlay.scrollStrategies.reposition(),
        panelClass: 'app-select-overlay'
      });
    }
    this.overlayRef.updateSize({ width: this.triggerRef.nativeElement.getBoundingClientRect().width });
    if (!this.overlayRef.hasAttached()) {
      this.overlayRef.attach(new TemplatePortal(this.panelTpl, this.viewContainerRef));
    }
  }

  private detachPanel(): void {
    if (this.overlayRef?.hasAttached()) this.overlayRef.detach();
  }

  /** The open panel's element (on the overlay layer, outside this component's host). */
  get panelElement(): HTMLElement | null {
    return this.overlayRef?.hasAttached() ? this.overlayRef.overlayElement : null;
  }

  get options(): AppOptionComponent[] {
    return this.optionsList ? this.optionsList.toArray() : [];
  }

  get selectedOption(): AppOptionComponent | undefined {
    return this.options.find(o => o.value === this.value);
  }

  get displayLabel(): string {
    return this.selectedOption ? this.selectedOption.label : this.placeholder;
  }

  toggle(): void {
    if (this.disabled) return;
    this.open = !this.open;
    if (this.open) this.onTouched();
  }

  close(): void {
    this.open = false;
  }

  /** Sets the value and propagates it out, without touching `open` — shared
   *  by both selectOption() (a deliberate click, which also closes) and
   *  keyboard arrow-navigation (which cycles the value while the panel
   *  stays open, same as a native <select>). */
  private commitValue(opt: AppOptionComponent): void {
    if (opt.disabled) return;
    this.value = opt.value;
    this.onChange(this.value);
    this.valueChange.emit(this.value);
  }

  /** Clicking an option in the panel — commits and closes. */
  selectOption(opt: AppOptionComponent): void {
    this.commitValue(opt);
    this.close();
  }

  // Closes on any click outside the component. The panel lives on the
  // overlay layer, not inside hostRef, so a click on it counts as inside too.
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as Node;
    if (this.open && !this.hostRef.nativeElement.contains(target) && !this.panelElement?.contains(target)) {
      this.open = false;
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.disabled) return;
    if (event.key === 'Escape') {
      this.close();
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.open) this.toggle();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open) {
        this.open = true;
        return;
      }
      const enabled = this.options.filter(o => !o.disabled);
      if (!enabled.length) return;
      const currentIndex = enabled.findIndex(o => o.value === this.value);
      const nextIndex = event.key === 'ArrowDown'
        ? (currentIndex < enabled.length - 1 ? currentIndex + 1 : 0)
        : (currentIndex > 0 ? currentIndex - 1 : enabled.length - 1);
      this.commitValue(enabled[nextIndex]);
    }
  }

  // ControlValueAccessor
  writeValue(value: any): void {
    this.value = value;
  }
  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
