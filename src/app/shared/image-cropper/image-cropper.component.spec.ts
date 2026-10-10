import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageCropperComponent } from './image-cropper.component';

/** A w×h test image: left half red, right half blue. */
const makeImageUrl = (w: number, h: number): string => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, w / 2, h);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(w / 2, 0, w / 2, h);
  return canvas.toDataURL('image/png');
};

const blobToPixel = async (blob: Blob, x: number, y: number): Promise<Uint8ClampedArray> => {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(x, y, 1, 1).data;
};

describe('ImageCropperComponent', () => {
  let fixture: ComponentFixture<ImageCropperComponent>;
  let component: ImageCropperComponent;

  const loadImage = (w: number, h: number) => new Promise<void>(resolve => {
    component.viewportSize = 200;
    component.imageSrc = makeImageUrl(w, h);
    component.ngOnChanges({ imageSrc: {} as any });
    const wait = () => component.loaded ? resolve() : setTimeout(wait, 5);
    wait();
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ImageCropperComponent] }).compileComponents();
    fixture = TestBed.createComponent(ImageCropperComponent);
    component = fixture.componentInstance;
  });

  it('fits a wide image to cover the viewport, centred', async () => {
    await loadImage(800, 400);
    // Height is the limiting side: 400px → 200px, so scale 0.5, width 400px
    expect(component.scale).toBeCloseTo(0.5);
    expect(component.offsetX).toBeCloseTo(-100);
    expect(component.offsetY).toBeCloseTo(0);
  });

  it('never lets the image be dragged off an edge', async () => {
    await loadImage(800, 400);
    component.offsetX = 500;
    component.setZoom(1);
    expect(component.offsetX).toBe(0);

    component.offsetX = -5000;
    component.setZoom(1);
    expect(component.offsetX).toBeCloseTo(-200);
  });

  it('clamps zoom between 1 and the maximum', async () => {
    await loadImage(400, 400);
    component.setZoom(0.2);
    expect(component.zoom).toBe(1);
    component.setZoom(99);
    expect(component.zoom).toBe(component.maxZoom);
  });

  it('exports a square image at the requested size', async () => {
    await loadImage(800, 400);
    const blob = await component.export({ size: 128, type: 'image/webp', quality: 0.75 });
    const bitmap = await createImageBitmap(blob);
    expect(bitmap.width).toBe(128);
    expect(bitmap.height).toBe(128);
    expect(['image/webp', 'image/jpeg']).toContain(blob.type);
  });

  it('exports exactly the visible region', async () => {
    await loadImage(800, 400);
    // Drag fully left: the viewport now shows only the right (blue) half
    component.offsetX = -5000;
    component.setZoom(1);
    const blob = await component.export({ size: 64, type: 'image/jpeg', quality: 0.9 });
    const [r, , b] = await blobToPixel(blob, 32, 32);
    expect(b).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
  });

  it('stays under maxBytes for a small avatar', async () => {
    await loadImage(1200, 900);
    const blob = await component.export({ size: 128, type: 'image/webp', quality: 0.75, maxBytes: 20 * 1024 });
    expect(blob.size).toBeLessThanOrEqual(20 * 1024);
  });

  it('moves with arrow keys', async () => {
    await loadImage(800, 400);
    const before = component.offsetX;
    component.onKeydown(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(component.offsetX).toBeCloseTo(before - 10);
  });
});
