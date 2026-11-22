import { ChangeDetectorRef, Component, Input, OnDestroy, OnInit } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Subscription } from 'rxjs';

/**
 * B-041: one message under a form field saying what is wrong with it, so a
 * form never refuses to save without a visible reason. Shown once the field
 * was touched (left) or changed — `form.markAllAsTouched()` on a failed save
 * shows every message at once.
 *
 *   <app-field-error [control]="form.controls.email" label="Email"></app-field-error>
 *
 * `messages` overrides the text for one error key (e.g. { pattern: '7 to 15 digits' }).
 */
@Component({
  selector: 'app-field-error',
  template: `<div class="field-error" role="alert" *ngIf="message">{{ message }}</div>`
})
export class FieldErrorComponent implements OnInit, OnDestroy {
  @Input() control: AbstractControl | null = null;
  @Input() label = 'This field';
  @Input() messages: { [errorKey: string]: string } = {};

  private sub?: Subscription;

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit() {
    // Touched has no event in Angular 16: status / value changes cover typing,
    // and the template re-checks on blur through normal change detection.
    this.sub = this.control?.statusChanges.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy() { this.sub?.unsubscribe(); }

  get message(): string {
    const c = this.control;
    if (!c || !c.errors || c.disabled || !(c.touched || c.dirty)) return '';
    return fieldErrorText(c.errors, this.label, this.messages);
  }
}

/** The text for the first error on a field (exported for tests and other forms). */
export function fieldErrorText(errors: { [key: string]: any }, label: string, messages: { [key: string]: string } = {}): string {
  const key = Object.keys(errors)[0];
  if (!key) return '';
  if (messages[key]) return messages[key];
  const e = errors[key];
  switch (key) {
    case 'required': return `${label} is required`;
    case 'email': return 'Enter a valid email address, like name@example.com';
    case 'minlength': return `${label} needs at least ${e.requiredLength} characters`;
    case 'maxlength': return `${label} can have at most ${e.requiredLength} characters`;
    case 'min': return `${label} must be ${e.min} or more`;
    case 'max': return `${label} must be ${e.max} or less`;
    case 'whitespace': return `${label} cannot be only spaces`;
    default: return `${label} is not valid`;
  }
}
