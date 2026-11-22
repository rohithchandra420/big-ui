import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

import { AppToastComponent, ToastData } from './app-toast.component';

describe('AppToastComponent (B-043)', () => {
  let fixture: ComponentFixture<AppToastComponent>;
  let ref: jasmine.SpyObj<MatSnackBarRef<AppToastComponent>>;

  const make = async (data: ToastData) => {
    ref = jasmine.createSpyObj('MatSnackBarRef', ['dismiss']);
    await TestBed.configureTestingModule({
      declarations: [AppToastComponent],
      providers: [{ provide: MAT_SNACK_BAR_DATA, useValue: data }, { provide: MatSnackBarRef, useValue: ref }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(AppToastComponent);
  };
  const el = () => fixture.nativeElement as HTMLElement;

  it('success: closes by itself, with a time-left bar', fakeAsync(() => {
    make({ kind: 'success', message: 'Saved', duration: 4000 });
    tick();
    fixture.detectChanges();
    expect(el().textContent).toContain('Saved');
    expect(el().querySelector('.app-toast.ok')).not.toBeNull();
    expect(el().querySelector('.at-bar')).not.toBeNull();
    tick(3999);
    expect(ref.dismiss).not.toHaveBeenCalled();
    tick(1);
    expect(ref.dismiss).toHaveBeenCalled();
  }));

  it('hovering pauses the timer; leaving goes on with the time left', fakeAsync(() => {
    make({ kind: 'success', message: 'Saved', duration: 4000 });
    tick();
    fixture.detectChanges();
    tick(1000);
    fixture.componentInstance.pause();
    tick(10000);
    expect(ref.dismiss).not.toHaveBeenCalled();
    fixture.componentInstance.resume();
    tick(3000);
    expect(ref.dismiss).toHaveBeenCalled();
  }));

  it('error: stays until closed, no bar', fakeAsync(() => {
    make({ kind: 'error', message: 'Could not save', duration: 0 });
    tick();
    fixture.detectChanges();
    expect(el().querySelector('.app-toast.err')).not.toBeNull();
    expect(el().querySelector('.at-bar')).toBeNull();
    tick(60000);
    expect(ref.dismiss).not.toHaveBeenCalled();
    (el().querySelector('.at-x') as HTMLButtonElement).click();
    expect(ref.dismiss).toHaveBeenCalled();
  }));
});
