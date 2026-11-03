import {
  SHRINK_DEFAULT_MAX_BYTES,
  SHRINK_MAX_DIMENSION,
  SHRINK_MAX_SOURCE_BYTES,
  SHRINK_TARGET_BYTES,
  decodeResizeOption,
  firstAttempt,
  fitWithin,
  jpegFileName,
  nextAttempt,
  type ShrinkFailure,
} from './shrink-image-plan';

export type ShrinkResult = { ok: true; file: File } | { ok: false; reason: ShrinkFailure };

export interface ShrinkOptions {
  /** Long side in px (default 2048). */
  maxDimension?: number;
  /** Quality loop target (default 1.5 MB). */
  targetBytes?: number;
  /** Hard ceiling; above it the photo is refused as `too_large` (default 2 MB, the item/recipe server limit). */
  maxBytes?: number;
}

/**
 * Browser-side preparation of EVERY picked photo before it goes to a Server
 * Action (inventory items, recipes, purchase receipts): a phone photo is
 * 3-12 MB and may be HEIC/AVIF, while the actions accept JPEG/PNG/WebP up to
 * 2-2.5 MB (and the Server Action body limit is 3 MB, `next.config.mjs`).
 *
 * Decodes with `createImageBitmap` (EXIF orientation applied), falling back
 * to an `<img>` element (older iOS Safari); draws at most `maxDimension` px on
 * the long side on a white background (transparent PNG -> JPEG) and encodes
 * JPEG through the quality loop in `shrink-image-plan.ts`. Canvas output has
 * no EXIF, so location data is dropped here; the server re-encodes with
 * `optimizeImageForWeb` regardless. Whatever the browser cannot decode (HEIC
 * on Chrome/Windows) is reported as `unreadable` -- no HEIC decoder is
 * shipped; Safari decodes HEIC natively and iOS usually hands over JPEG.
 */
export async function shrinkImageForUpload(file: File, options: ShrinkOptions = {}): Promise<ShrinkResult> {
  const maxDimension = options.maxDimension ?? SHRINK_MAX_DIMENSION;
  const targetBytes = options.targetBytes ?? SHRINK_TARGET_BYTES;
  const maxBytes = options.maxBytes ?? SHRINK_DEFAULT_MAX_BYTES;
  if (typeof document === 'undefined') return { ok: false, reason: 'unreadable' };
  if (file.size > SHRINK_MAX_SOURCE_BYTES) return { ok: false, reason: 'too_large' };

  const source = await decode(file, maxDimension);
  if (!source) return { ok: false, reason: 'unreadable' };
  const canvas = document.createElement('canvas');
  try {
    if (source.width < 1 || source.height < 1) return { ok: false, reason: 'unreadable' };
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, reason: 'unreadable' };

    let attempt = firstAttempt(maxDimension);
    let smallest: Blob | null = null;
    try {
      // bounded: 4 quality steps x a few downscale rounds
      for (let round = 0; round < 16; round += 1) {
        const size = fitWithin(source.width, source.height, attempt.maxDimension);
        if (canvas.width !== size.width || canvas.height !== size.height || round === 0) {
          canvas.width = size.width;
          canvas.height = size.height;
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, size.width, size.height);
          context.drawImage(source.image, 0, 0, size.width, size.height);
        }
        const quality = attempt.quality;
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (!blob) break;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        const next = nextAttempt(attempt, blob.size, targetBytes);
        if (next === 'accept' || next === 'give_up') break;
        attempt = next;
      }
    } catch {
      // drawImage/toBlob can throw (out of memory, broken frame): treat as unreadable
      return { ok: false, reason: 'unreadable' };
    }
    if (!smallest) return { ok: false, reason: 'unreadable' };
    if (smallest.size > maxBytes) return { ok: false, reason: 'too_large' };
    return { ok: true, file: new File([smallest], jpegFileName(file.name), { type: 'image/jpeg' }) };
  } finally {
    // free the backing store early (iOS Safari caps total canvas memory)
    canvas.width = 0;
    canvas.height = 0;
    source.release();
  }
}

interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * 1. `<img>` load gives the displayed (EXIF-oriented) size; browsers decode
 *    an off-DOM image's pixels lazily, so this is mostly a header read.
 * 2. `createImageBitmap` with a decode-time downscale (`decodeResizeOption`)
 *    so the full-resolution bitmap is not kept; if the browser rejects the
 *    resize options, again without them.
 * 3. Last resort: draw from the `<img>` itself (older iOS Safari).
 */
async function decode(file: File, maxDimension: number): Promise<DecodedImage | null> {
  const probe = await loadImageElement(file);
  if (typeof createImageBitmap === 'function') {
    const resize = probe ? decodeResizeOption(probe.img.naturalWidth, probe.img.naturalHeight, maxDimension) : null;
    const attempts: ImageBitmapOptions[] = resize
      ? [{ imageOrientation: 'from-image', resizeQuality: 'high', ...resize }, { imageOrientation: 'from-image' }]
      : [{ imageOrientation: 'from-image' }];
    for (const bitmapOptions of attempts) {
      try {
        const bitmap = await createImageBitmap(file, bitmapOptions);
        probe?.release();
        return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
      } catch {
        // next attempt, then the <img> fallback
      }
    }
  }
  if (!probe) return null;
  // <img> applies EXIF orientation by default (`image-orientation: from-image`)
  return { image: probe.img, width: probe.img.naturalWidth, height: probe.img.naturalHeight, release: probe.release };
}

async function loadImageElement(file: File): Promise<{ img: HTMLImageElement; release: () => void } | null> {
  const url = URL.createObjectURL(file);
  const release = () => URL.revokeObjectURL(url);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
    return { img, release };
  } catch {
    release();
    return null;
  }
}
