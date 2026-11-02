/**
 * Browser-side downscale before a photo is sent to a Server Action (receipts,
 * DEBT-136): a phone camera photo is 3-8 MB, above the 3 MB Server Action body
 * limit (`next.config.mjs`). Draws the image at most `maxDimension` px on the
 * long side and re-encodes it as JPEG. The server still re-encodes it with
 * `optimizeImageForWeb`, which also strips metadata (location data in EXIF).
 * Decodes with `createImageBitmap`, falling back to an `<img>` element (older
 * iOS Safari); returns the original file only when neither can decode it.
 */
export async function shrinkImageForUpload(file: File, maxDimension = 2000, quality = 0.85): Promise<File> {
  if (typeof document === 'undefined') return file;
  const source = await decode(file);
  if (!source) return file;
  try {
    const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && file.type === 'image/jpeg') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(source.image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    source.release();
  }
}

interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

async function decode(file: File): Promise<DecodedImage | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
    // <img> applies EXIF orientation by default (`image-orientation: from-image`)
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}
