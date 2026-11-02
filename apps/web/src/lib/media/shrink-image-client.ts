/**
 * Browser-side downscale before a photo is sent to a Server Action (receipts,
 * DEBT-136): a phone camera photo is 3-8 MB, above the 3 MB Server Action body
 * limit (`next.config.mjs`). Draws the image at most `maxDimension` px on the
 * long side and re-encodes it as JPEG. The server still re-encodes it with
 * `optimizeImageForWeb`, which also strips metadata (location data in EXIF).
 * Falls back to the original file when the browser cannot decode it.
 */
export async function shrinkImageForUpload(file: File, maxDimension = 2000, quality = 0.85): Promise<File> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024 && file.type === 'image/jpeg') return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
