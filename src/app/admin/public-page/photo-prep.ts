// Prepares a photo for the public page (PH6), in the browser: re-draws it on a
// canvas at a sensible size and re-saves it as WebP (JPEG where the browser
// can't make WebP). Re-saving drops GPS and every other piece of photo data.

export const FULL_MAX = 1600;
export const THUMB_MAX = 480;

export interface PreparedPhoto { full: Blob; thumb: Blob; type: 'image/webp' | 'image/jpeg'; }

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawTo(img: HTMLImageElement, max: number): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const toBlob = (c: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>(resolve => c.toBlob(resolve, type, quality));

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('Pick a photo (JPEG, PNG or WebP).');
  const img = await loadImage(file);
  const big = drawTo(img, FULL_MAX), small = drawTo(img, THUMB_MAX);
  let full = await toBlob(big, 'image/webp', 0.82);
  let type: PreparedPhoto['type'] = 'image/webp';
  if (!full || full.type !== 'image/webp') { full = await toBlob(big, 'image/jpeg', 0.82); type = 'image/jpeg'; }
  const thumb = await toBlob(small, type, 0.78);
  if (!full || !thumb) throw new Error('This photo could not be prepared.');
  return { full, thumb, type };
}

/** PUTs a file to a one-time R2 upload link (no cookies: plain fetch). */
export async function putToR2(url: string, blob: Blob, type: string): Promise<void> {
  const r = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': type }, credentials: 'omit' });
  if (!r.ok) throw new Error('Upload failed');
}
