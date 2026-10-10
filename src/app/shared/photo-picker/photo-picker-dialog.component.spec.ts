import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { PhotoPickerDialogComponent } from './photo-picker-dialog.component';

describe('PhotoPickerDialogComponent', () => {
  let fixture: ComponentFixture<PhotoPickerDialogComponent>;
  let component: PhotoPickerDialogComponent;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<PhotoPickerDialogComponent>>;

  beforeEach(async () => {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    await TestBed.configureTestingModule({
      imports: [PhotoPickerDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: { title: 'Profile photo' } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(PhotoPickerDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const pick = (file: File) => {
    const input = { files: [file], value: 'x' } as any;
    component.onFileSelected({ target: input } as any);
    return input;
  };

  it('defaults to a circle crop and uses the given title', () => {
    expect(component.shape).toBe('circle');
    expect(component.title).toBe('Profile photo');
    expect(component.step).toBe('choose');
  });

  it('moves to the crop step for an image file', () => {
    const input = pick(new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
    expect(component.step).toBe('crop');
    expect(component.imageSrc).toMatch(/^blob:/);
    expect(input.value).toBe('');
  });

  it('rejects a non-image file', () => {
    pick(new File(['x'], 'notes.pdf', { type: 'application/pdf' }));
    expect(component.step).toBe('choose');
    expect(component.error).toContain('image');
  });

  it('rejects an oversized file', () => {
    const big = new File([new Uint8Array(16 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
    pick(big);
    expect(component.step).toBe('choose');
    expect(component.error).toContain('too large');
  });

  it('goes back to the choose step if the image cannot be opened', () => {
    pick(new File(['x'], 'me.jpg', { type: 'image/jpeg' }));
    component.onCropLoadError();
    expect(component.step).toBe('choose');
    expect(component.error).toBeTruthy();
  });

  it('explains when camera access is blocked', async () => {
    if (!component.cameraSupported) {
      pending('No mediaDevices in this browser');
      return;
    }
    spyOn(navigator.mediaDevices, 'getUserMedia').and.returnValue(
      Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
    );
    await component.startCamera();
    expect(component.step).toBe('choose');
    expect(component.error).toContain('blocked');
  });

  it('closes with nothing when cancelled', () => {
    component.cancel();
    expect(dialogRefSpy.close).toHaveBeenCalledWith();
  });
});
