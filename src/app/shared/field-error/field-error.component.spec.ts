import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';

import { FieldErrorComponent, fieldErrorText } from './field-error.component';

describe('FieldErrorComponent (B-041)', () => {
  let fixture: ComponentFixture<FieldErrorComponent>;
  let comp: FieldErrorComponent;
  const shown = () => ((fixture.nativeElement as HTMLElement).querySelector('.field-error')?.textContent || '').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({ declarations: [FieldErrorComponent] }).compileComponents();
    fixture = TestBed.createComponent(FieldErrorComponent);
    comp = fixture.componentInstance;
  });

  it('says nothing until the field is touched or changed', () => {
    comp.control = new FormControl('', Validators.required);
    comp.label = 'Name';
    fixture.detectChanges();
    expect(shown()).toBe('');
    comp.control.markAsTouched();
    fixture.detectChanges();
    expect(shown()).toBe('Name is required');
  });

  it('says nothing for a valid or disabled field', () => {
    comp.control = new FormControl('ok', Validators.required);
    comp.control.markAsTouched();
    fixture.detectChanges();
    expect(shown()).toBe('');
    comp.control = new FormControl({ value: '', disabled: true }, Validators.required);
    comp.control.markAsTouched();
    fixture.detectChanges();
    expect(shown()).toBe('');
  });

  it('plain words for each kind of error, and a page may give its own', () => {
    expect(fieldErrorText({ minlength: { requiredLength: 2 } }, 'Name')).toBe('Name needs at least 2 characters');
    expect(fieldErrorText({ maxlength: { requiredLength: 60 } }, 'Name')).toBe('Name can have at most 60 characters');
    expect(fieldErrorText({ email: true }, 'Email')).toBe('Enter a valid email address, like name@example.com');
    expect(fieldErrorText({ pattern: {} }, 'Phone')).toBe('Phone is not valid');
    expect(fieldErrorText({ pattern: {} }, 'Phone', { pattern: '7 to 15 digits' })).toBe('7 to 15 digits');
  });
});
