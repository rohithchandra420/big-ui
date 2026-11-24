import {
  Component, ElementRef, EventEmitter, forwardRef, HostListener, Input, OnDestroy, Output,
  TemplateRef, ViewChild, ViewContainerRef
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';

/** One choice. `group` puts it under a small heading; `count` shows on the right. */
export interface MultiSelectOption { value: string; label: string; group?: string; count?: number; }

/**
 * A multi-choice dropdown (B-083, 2026-11-24): looks like <app-select>, but
 * each row is ticked on / off and the panel stays open while picking.
 * Value = the ticked values (string[]), via [(ngModel)] / formControlName.
 * Options come as a data array: pass a STORED list, never a getter that
 * builds objects (same freeze rule as <app-option>). The panel opens on the
 * CDK overlay layer, so no container clips it.
 */
@Component({
  selector: 'app-multi-select',
  templateUrl: './multi-select.component.html',
  styleUrls: ['./multi-select.component.css'],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MultiSelectComponent), multi: true }]
})
export class MultiSelectComponent implements ControlValueAccessor, OnDestroy {
  @Input() options: MultiSelectOption[] = [];
  /** Shown when nothing is ticked, e.g. "All pass types". */
  @Input() placeholder = 'All';
  /** "3 pass types" when more than two are ticked. */
  @Input() noun = 'selected';
  @Input() panelMinWidth = 0;
  @Input() disabled = false;
  @Input() ariaLabel = '';
  @Output() valueChange = new EventEmitter<string[]>();

  @ViewChild('trigger', { static: true }) triggerRef!: ElementRef<HTMLElement>;
  @ViewChild('panelTpl', { static: true }) panelTpl!: TemplateRef<unknown>;

  value: string[] = [];
  private _open = false;
  private overlayRef?: OverlayRef;
  private onChange: (v: string[]) => void = () => { };
  private onTouched: () => void = () => { };

  constructor(private hostRef: ElementRef<HTMLElement>, private overlay: Overlay, private vcr: ViewContainerRef) { }

  get open(): boolean { return this._open; }
  set open(v: boolean) {
    if (v === this._open) return;
    this._open = v;
    v ? this.attach() : this.detach();
  }

  ngOnDestroy(): void { this.overlayRef?.dispose(); }

  private attach(): void {
    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        positionStrategy: this.overlay.position().flexibleConnectedTo(this.triggerRef)
          .withPositions([
            { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
            { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
          ])
          .withFlexibleDimensions(false).withPush(false),
        scrollStrategy: this.overlay.scrollStrategies.reposition(),
        panelClass: 'app-select-overlay'
      });
    }
    const w = this.triggerRef.nativeElement.getBoundingClientRect().width;
    this.overlayRef.updateSize({ width: Math.max(w, this.panelMinWidth || 0) });
    if (!this.overlayRef.hasAttached()) this.overlayRef.attach(new TemplatePortal(this.panelTpl, this.vcr));
  }

  private detach(): void {
    if (this.overlayRef?.hasAttached()) this.overlayRef.detach();
  }

  get panelElement(): HTMLElement | null {
    return this.overlayRef?.hasAttached() ? this.overlayRef.overlayElement : null;
  }

  /** "All pass types" / "Weekend Pass, Shared Tent" / "3 pass types". */
  get displayLabel(): string {
    if (!this.value.length) return this.placeholder;
    const labels = this.options.filter(o => this.value.includes(o.value)).map(o => o.label);
    if (!labels.length) return this.placeholder;
    return labels.length <= 2 ? labels.join(', ') : `${labels.length} ${this.noun}`;
  }

  /** True when this option starts a new group heading. */
  startsGroup(i: number): boolean {
    const g = this.options[i]?.group;
    return !!g && (i === 0 || this.options[i - 1].group !== g);
  }

  isOn(o: MultiSelectOption): boolean { return this.value.includes(o.value); }

  toggleOpen(): void {
    if (this.disabled) return;
    this.open = !this.open;
    if (this.open) this.onTouched();
  }

  toggleOption(o: MultiSelectOption): void {
    this.commit(this.isOn(o) ? this.value.filter(v => v !== o.value) : [...this.value, o.value]);
  }

  clear(): void { this.commit([]); }

  private commit(v: string[]): void {
    this.value = v;
    this.onChange(v);
    this.valueChange.emit(v);
  }

  trackValue = (_: number, o: MultiSelectOption) => o.value;

  @HostListener('document:click', ['$event'])
  onDocumentClick(e: MouseEvent): void {
    const t = e.target as Node;
    if (this.open && !this.hostRef.nativeElement.contains(t) && !this.panelElement?.contains(t)) this.open = false;
  }

  @HostListener('keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (this.disabled) return;
    if (e.key === 'Escape') { this.open = false; return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target === this.triggerRef.nativeElement) {
      e.preventDefault();
      this.toggleOpen();
    }
  }

  // ── ControlValueAccessor ──
  writeValue(v: string[] | null): void { this.value = Array.isArray(v) ? [...v] : []; }
  registerOnChange(fn: (v: string[]) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(d: boolean): void { this.disabled = d; if (d) this.open = false; }
}
