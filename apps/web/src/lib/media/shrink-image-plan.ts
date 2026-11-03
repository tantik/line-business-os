/**
 * Pure decisions behind `shrinkImageForUpload` (no DOM), so they can be unit
 * tested: output size, the JPEG quality loop, and the user-facing copy for a
 * photo that cannot be used. Shared by every photo picker (inventory items,
 * recipes, purchase receipts).
 */

/**
 * Every photo picker uses this. Deliberately `image/*` only: listing
 * `.heic`/`.heif` makes iOS WebKit hand over the HEIC file instead of
 * converting it to JPEG, and iOS <= 16 Safari cannot decode HEIC.
 */
export const PHOTO_ACCEPT = 'image/*';

/** Long side of the uploaded photo. The server re-encodes to WebP at its own (smaller or equal) size. */
export const SHRINK_MAX_DIMENSION = 2048;
/** The quality loop stops at the first JPEG at or under this size. */
export const SHRINK_TARGET_BYTES = 1.5 * 1024 * 1024;
/** Hard ceiling for the produced file; matches the item/recipe server actions (2 MB). */
export const SHRINK_DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
/** A source above this is refused before decoding (protects phone memory); far above any camera photo. */
export const SHRINK_MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55] as const;
/** When even the lowest quality is too big, the long side shrinks by this factor and the loop restarts. */
export const DOWNSCALE_FACTOR = 0.75;
export const MIN_DIMENSION = 800;

export type ShrinkFailure = 'unreadable' | 'too_large';

export interface EncodeAttempt {
  quality: number;
  maxDimension: number;
}

/** Scales `width`x`height` so the long side is at most `maxDimension`; never upscales, never returns 0. */
export function fitWithin(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longSide = Math.max(width, height);
  const scale = longSide > maxDimension ? maxDimension / longSide : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * `createImageBitmap` resize option that downscales at decode time (so a
 * 48 MP photo is never held at full resolution), or `null` when no downscale
 * is needed (never upscale). `width`/`height` are the displayed (EXIF-
 * oriented) size. Only the long side is given so the aspect ratio is kept
 * even if a browser applies the resize before the EXIF rotation: then the
 * result is at most a little larger than `maxDimension`, never distorted or
 * smaller, and the canvas step (`fitWithin`) enforces the final size.
 */
export function decodeResizeOption(
  width: number,
  height: number,
  maxDimension: number = SHRINK_MAX_DIMENSION,
): { resizeWidth: number } | { resizeHeight: number } | null {
  if (width < 1 || height < 1 || Math.max(width, height) <= maxDimension) return null;
  return width >= height ? { resizeWidth: maxDimension } : { resizeHeight: maxDimension };
}

export function firstAttempt(maxDimension: number = SHRINK_MAX_DIMENSION): EncodeAttempt {
  return { quality: QUALITY_STEPS[0], maxDimension };
}

/**
 * Quality loop: after encoding with `previous` produced `resultBytes`, either
 * accept it, try the next lower quality, restart smaller (long side x0.75,
 * second quality step), or give up (caller then keeps the smallest result if
 * it is still under the hard maximum).
 */
export function nextAttempt(previous: EncodeAttempt, resultBytes: number, targetBytes: number = SHRINK_TARGET_BYTES): EncodeAttempt | 'accept' | 'give_up' {
  if (resultBytes <= targetBytes) return 'accept';
  const index = QUALITY_STEPS.findIndex((q) => q === previous.quality);
  const lowerQuality = index >= 0 ? QUALITY_STEPS[index + 1] : undefined;
  if (lowerQuality !== undefined) {
    return { quality: lowerQuality, maxDimension: previous.maxDimension };
  }
  const smaller = Math.round(previous.maxDimension * DOWNSCALE_FACTOR);
  if (smaller < MIN_DIMENSION) return 'give_up';
  return { quality: QUALITY_STEPS[1], maxDimension: smaller };
}

/** `.jpg` name for the re-encoded file (`IMG_0001.HEIC` -> `IMG_0001.jpg`). */
export function jpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base || 'photo'}.jpg`;
}

type PhotoLang = 'ja' | 'en';

const PHOTO_COPY = {
  ja: {
    hint: '写真はアップロード前に自動で縮小します。',
    processing: '写真を準備しています…',
    unreadable: 'この形式の画像はこのブラウザで開けません。JPEGかPNGで保存し直して、もう一度選んでください。',
    too_large: '写真が大きすぎて縮小できませんでした。別の写真を選んでください。',
  },
  en: {
    hint: 'Photos are reduced automatically before upload.',
    processing: 'Preparing the photo…',
    unreadable: 'This browser cannot open this image format. Save it as JPEG or PNG, then choose it again.',
    too_large: 'This photo is too large to reduce. Please choose another photo.',
  },
} as const satisfies Record<PhotoLang, Record<'hint' | 'processing' | ShrinkFailure, string>>;

/** User-facing message for a photo the client could not prepare. */
export function photoFailureMessage(lang: PhotoLang, reason: ShrinkFailure): string {
  return PHOTO_COPY[lang][reason];
}

/** Hint under every photo picker: any photo is fine, it is reduced automatically. */
export function photoPickerHint(lang: PhotoLang): string {
  return PHOTO_COPY[lang].hint;
}

export function photoProcessingLabel(lang: PhotoLang): string {
  return PHOTO_COPY[lang].processing;
}
