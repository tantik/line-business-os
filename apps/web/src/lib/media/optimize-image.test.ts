import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { optimizeImageForWeb } from './optimize-image.js';

async function pngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } } }).png().toBuffer();
}

test('optimizeImageForWeb re-encodes to WebP', async () => {
  const source = await pngBuffer(100, 100);
  const result = await optimizeImageForWeb(source);
  assert.equal(result.contentType, 'image/webp');
  assert.equal(result.extension, 'webp');
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.format, 'webp');
});

test('optimizeImageForWeb downscales an oversized image to the max dimension, preserving aspect ratio', async () => {
  const source = await pngBuffer(4000, 2000);
  const result = await optimizeImageForWeb(source, { maxDimension: 1600 });
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
});

test('optimizeImageForWeb never upscales an image already smaller than the max dimension', async () => {
  const source = await pngBuffer(300, 200);
  const result = await optimizeImageForWeb(source, { maxDimension: 1600 });
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.width, 300);
  assert.equal(metadata.height, 200);
});

test('optimizeImageForWeb produces a materially smaller buffer for a large source', async () => {
  const source = await pngBuffer(4000, 4000);
  const result = await optimizeImageForWeb(source);
  assert.ok(result.buffer.length < source.length);
});
