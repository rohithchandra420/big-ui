import { Component, ElementRef, Inject, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { CropShape, ImageCropperComponent } from '../image-cropper/image-cropper.component';

export interface PhotoPickerData {
  title?: string;
  /** Crop mask shape. Defaults to circle. */
  shape?: CropShape;
  /** Output px (square). Defaults to 128. */
  outputSize?: number;
  /** Upper bound the export compresses under. Defaults to 20KB, matching the
   *  backend avatar limit. */
  maxBytes?: number;
}

type Step = 'choose' | 'camera' | 'crop';

// Refuse silly inputs before trying to decode them in the browser.
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/**
 * Reusable "pick a photo" dialog: Upload photo or Take photo (live camera),
 * then drag/zoom to crop, then closes with the finished, compressed Blob (or
 * undefined if cancelled). Knows nothing about avatars — the caller decides
 * what to do with the image.
 *
 *   this.dialog.open(PhotoPickerDialogComponent, { data: { title: 'Profile photo' } })
 *     .afterClosed().subscribe((blob?: Blob) => ...)
 *
 * Standalone, so any feature can open it without registering it in a module.
 */
@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, ImageCropperComponent],
  selector: 'app-photo-picker-dialog',
  templateUrl: './photo-picker-dialog.component.html',
  styleUrls: ['./photo-picker-dialog.component.css']
})
export class PhotoPickerDialogComponent implements OnDestroy {

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('video') video?: ElementRef<HTMLVideoElement>;
  @ViewChild(ImageCropperComponent) cropper?: ImageCropperComponent;

  step: Step = 'choose';
  imageSrc = '';
  error = '';
  saving = false;

  readonly shape: CropShape;
  readonly title: string;
  /** Fits a 320px-wide phone inside the dialog's padding. */
  readonly viewportSize = Math.min(260, (typeof window !== 'undefined' ? window.innerWidth : 400) - 96);

  private stream: MediaStream | null = null;
  private objectUrl: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<PhotoPickerDialogComponent, Blob>,
    @Inject(MAT_DIALOG_DATA) public data: PhotoPickerData | null
  ) {
    this.shape = data?.shape || 'circle';
    this.title = data?.title || 'Choose a photo';
  }

  get cameraSupported(): boolean {
    return !!(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);
  }

  // ── Upload ───────────────────────────────────────────────

  chooseFile() {
    this.error = '';
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow picking the same file again
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.error = 'Please choose an image file.';
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      this.error = 'That image is too large (max 15 MB).';
      return;
    }
    this.showCrop(this.makeObjectUrl(file));
  }

  // ── Camera ───────────────────────────────────────────────

  async startCamera() {
    this.error = '';
    if (!this.cameraSupported) {
      this.error = 'This browser can\'t use the camera. Upload a photo instead.';
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false
      });
      this.step = 'camera';
      // Wait for the <video> to render before attaching the stream
      setTimeout(() => {
        const el = this.video?.nativeElement;
        if (el && this.stream) {
          el.srcObject = this.stream;
          el.play().catch(() => { /* autoplay blocked — the user can still capture */ });
        }
      });
    } catch (err: any) {
      this.stopCamera();
      this.error = err?.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it in your browser settings, or upload a photo instead.'
        : 'No camera could be started. Upload a photo instead.';
    }
  }

  capture() {
    const el = this.video?.nativeElement;
    if (!el || !el.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    // The preview is mirrored like a selfie camera — save it the same way, so
    // the photo matches what the person saw while lining it up.
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(el, 0, 0);
    this.stopCamera();
    canvas.toBlob(blob => {
      if (blob) this.showCrop(this.makeObjectUrl(blob));
    }, 'image/jpeg', 0.92);
  }

  private stopCamera() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
  }

  // ── Crop + save ──────────────────────────────────────────

  private showCrop(src: string) {
    this.imageSrc = src;
    this.step = 'crop';
  }

  onCropLoadError() {
    this.step = 'choose';
    this.error = 'That image couldn\'t be opened. Try a JPEG or PNG.';
  }

  back() {
    this.stopCamera();
    this.error = '';
    this.step = 'choose';
  }

  async save() {
    if (!this.cropper || this.saving) return;
    this.saving = true;
    try {
      const blob = await this.cropper.export({
        size: this.data?.outputSize || 128,
        type: 'image/webp',
        quality: 0.75,
        maxBytes: this.data?.maxBytes || 20 * 1024
      });
      this.dialogRef.close(blob);
    } catch {
      this.error = 'Something went wrong preparing the photo. Please try again.';
      this.saving = false;
    }
  }

  cancel() {
    this.dialogRef.close();
  }

  private makeObjectUrl(blob: Blob): string {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(blob);
    return this.objectUrl;
  }

  ngOnDestroy() {
    this.stopCamera();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
  }
}
