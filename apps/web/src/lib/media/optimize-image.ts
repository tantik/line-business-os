import sharp from 'sharp';

/**
 * Shared upload-time photo optimizer (Cafe QA follow-up, 2026-08-26): every
 * module that accepts a user-uploaded photo (Recipes, Inventory, and any
 * future one) runs the raw file through this before it ever reaches Storage.
 * Root cause it closes: recipe/inventory photos were stored and served at
 * their original size (up to the 2MB/4096px client gate), so every popup
 * that showed one paid for a 300-400KB fetch. Client-side dimension/size
 * checks (`recipe-form.tsx`, `item-form.tsx`) stay as a fast-fail UX nicety;
 * this is the actual guarantee, since it runs server-side regardless of what
 * the client sent.
 *
 * WebP at 1600px is plenty for anything this UI ever displays a photo at
 * (popup detail view, list thumbnails) -- re-encoding on read via Supabase's
 * paid Image Transformation add-on would need it enabled per-project and
 * still re-serves the original bytes as the transform source each time;
 * doing it once at upload works on every plan tier and never costs a
 * transformation call again.
 */

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 82;

export interface OptimizedImage {
  buffer: Buffer;
  contentType: 'image/webp';
  extension: 'webp';
}

export async function optimizeImageForWeb(
  input: ArrayBuffer | Buffer,
  opts: { maxDimension?: number; quality?: number } = {},
): Promise<OptimizedImage> {
  const source = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const buffer = await sharp(source)
    .rotate() // apply EXIF orientation before stripping metadata, so phone photos don't come out sideways
    .resize({
      width: opts.maxDimension ?? DEFAULT_MAX_DIMENSION,
      height: opts.maxDimension ?? DEFAULT_MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: opts.quality ?? DEFAULT_QUALITY })
    .toBuffer();
  return { buffer, contentType: 'image/webp', extension: 'webp' };
}
