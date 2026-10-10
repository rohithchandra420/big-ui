import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

export type CropShape = 'circle' | 'square';

export interface CropExportOptions {
  /** Output width/height in px (always square). */
  size: number;
  /** Preferred type; falls back to JPEG if the browser can't encode it. */
  type?: 'image/webp' | 'image/jpeg';
  quality?: number;
  /** If the first encode is bigger than this, quality is stepped down. */
  maxBytes?: number;
}

const MAX_ZOOM = 4;

/**
 * Reusable drag-to-position / zoom cropper. No library — the image is laid
 * out with a CSS transform inside a fixed square viewport, and export()
 * redraws exactly that visible square onto a canvas.
 *
 * The `shape` only changes the on-screen mask: output is always a square
 * image, so a circle crop for users and a square crop elsewhere can share the
 * same stored photo format (the round look is applied when it's displayed).
 *
 * Controls: drag (mouse / one finger), pinch (two fingers), scroll wheel, the
 * zoom slider, and arrow keys (move) / +/- (zoom) when focused.
 *
 * Standalone, so any feature can drop it in by adding it to `imports`.
 */
@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'app-image-cropper',
  templateUrl: './image-cropper.component.html',
  styleUrls: ['./image-cropper.component.css']
})
export class ImageCropperComponent implements OnChanges {

  /** Any URL an <img> can load — object URL or data URL. */
  @Input() imageSrc = '';
  @Input() shape: CropShape = 'circle';
  /** On-screen crop square, in px. */
  @Input() viewportSize = 260;

  @Output() loadError = new EventEmitter<void>();

  image: HTMLImageElement | null = null;
  loaded = false;

  /** 1 = image just covers the viewport; up to MAX_ZOOM. */
  zoom = 1;
  readonly maxZoom = MAX_ZOOM;
  offsetX = 0;
  offsetY = 0;

  private baseScale = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['imageSrc'] && this.imageSrc) {
      this.load(this.imageSrc);
    }
  }

  get scale(): number {
    return this.baseScale * this.zoom;
  }

  get transform(): string {
    return `translate(${this.offsetX}px, ${this.offsetY}px) scale(${this.scale})`;
  }

  private load(src: string) {
    this.loaded = false;
    const img = new Image();
    img.onload = () => {
      this.image = img;
      // Smallest scale where the image still covers the whole viewport
      this.baseScale = Math.max(this.viewportSize / img.naturalWidth, this.viewportSize / img.naturalHeight);
      this.zoom = 1;
      // Centre it
      this.offsetX = (this.viewportSize - img.naturalWidth * this.baseScale) / 2;
      this.offsetY = (this.viewportSize - img.naturalHeight * this.baseScale) / 2;
      this.loaded = true;
    };
    img.onerror = () => this.loadError.emit();
    img.src = src;
  }

  /** Keep the image covering the viewport — no empty edges ever. */
  private clamp() {
    if (!this.image) return;
    const w = this.image.naturalWidth * this.scale;
    const h = this.image.naturalHeight * this.scale;
    this.offsetX = Math.min(0, Math.max(this.viewportSize - w, this.offsetX));
    this.offsetY = Math.min(0, Math.max(this.viewportSize - h, this.offsetY));
  }

  /** Zoom keeping the point (cx, cy) in the viewport fixed (default: centre). */
  setZoom(next: number, cx = this.viewportSize / 2, cy = this.viewportSize / 2) {
    const clamped = Math.min(MAX_ZOOM, Math.max(1, next));
    const ratio = clamped / this.zoom;
    this.offsetX = cx - (cx - this.offsetX) * ratio;
    this.offsetY = cy - (cy - this.offsetY) * ratio;
    this.zoom = clamped;
    this.clamp();
  }

  onSlider(value: string | number) {
    this.setZoom(Number(value));
  }

  // ── Pointer: drag + pinch ────────────────────────────────

  onPointerDown(event: PointerEvent) {
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 2) {
      this.pinchStartDistance = this.pointerDistance();
      this.pinchStartZoom = this.zoom;
    }
  }

  onPointerMove(event: PointerEvent) {
    const prev = this.pointers.get(event.pointerId);
    if (!prev) return;
    event.preventDefault();
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointers.size === 1) {
      this.offsetX += event.clientX - prev.x;
      this.offsetY += event.clientY - prev.y;
      this.clamp();
    } else if (this.pointers.size === 2 && this.pinchStartDistance > 0) {
      this.setZoom(this.pinchStartZoom * (this.pointerDistance() / this.pinchStartDistance));
    }
  }

  onPointerUp(event: PointerEvent) {
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchStartDistance = 0;
  }

  private pointerDistance(): number {
    const [a, b] = Array.from(this.pointers.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.setZoom(this.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08), event.clientX - rect.left, event.clientY - rect.top);
  }

  onKeydown(event: KeyboardEvent) {
    const step = 10;
    const moves: { [key: string]: [number, number] } = {
      ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step]
    };
    if (moves[event.key]) {
      event.preventDefault();
      this.offsetX += moves[event.key][0];
      this.offsetY += moves[event.key][1];
      this.clamp();
    } else if (event.key === '+' || event.key === '=') {
      this.setZoom(this.zoom + 0.1);
    } else if (event.key === '-') {
      this.setZoom(this.zoom - 0.1);
    }
  }

  // ── Export ───────────────────────────────────────────────

  /** Renders the visible square at `size` px and encodes it, stepping quality
   *  down if needed to stay under maxBytes. */
  async export(options: CropExportOptions): Promise<Blob> {
    if (!this.image) throw new Error('No image loaded');
    const { size, type = 'image/webp', maxBytes } = options;

    const canvas = this.renderCrop(size);
    const qualities = [options.quality ?? 0.75, 0.6, 0.45, 0.3];

    let blob: Blob | null = null;
    for (const quality of qualities) {
      blob = await this.encode(canvas, type, quality);
      if (!maxBytes || blob.size <= maxBytes) break;
    }
    if (!blob) throw new Error('Could not encode image');
    return blob;
  }

  private renderCrop(size: number): HTMLCanvasElement {
    const img = this.image!;
    // Source rectangle (in original image pixels) currently in the viewport
    let sx = -this.offsetX / this.scale;
    let sy = -this.offsetY / this.scale;
    let sw = this.viewportSize / this.scale;

    // Step down by halves first — one big jump (e.g. 3000px → 128px) aliases
    // badly even with high-quality smoothing.
    let source: CanvasImageSource = img;
    while (sw / 2 > size * 2) {
      const half = Math.round(sw / 2);
      const step = document.createElement('canvas');
      step.width = step.height = half;
      const sctx = step.getContext('2d')!;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(source, sx, sy, sw, sw, 0, 0, half, half);
      source = step;
      sx = 0;
      sy = 0;
      sw = half;
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    // JPEG has no transparency — give it a white background rather than black
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, sx, sy, sw, sw, 0, 0, size, size);
    return canvas;
  }

  private encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
    const toBlob = (t: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, t, quality));
    return toBlob(type).then(async blob => {
      // Browsers that can't encode the requested type silently return PNG —
      // fall back to JPEG, which every browser can encode.
      if (!blob || blob.type !== type) {
        blob = await toBlob('image/jpeg');
      }
      if (!blob) throw new Error('Could not encode image');
      return blob;
    });
  }
}
