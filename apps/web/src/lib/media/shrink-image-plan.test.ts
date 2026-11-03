import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MIN_DIMENSION,
  PHOTO_ACCEPT,
  QUALITY_STEPS,
  SHRINK_DEFAULT_MAX_BYTES,
  SHRINK_MAX_DIMENSION,
  SHRINK_TARGET_BYTES,
  decodeResizeOption,
  firstAttempt,
  fitWithin,
  jpegFileName,
  nextAttempt,
  photoFailureMessage,
  photoPickerHint,
  type EncodeAttempt,
} from './shrink-image-plan.js';

const MB = 1024 * 1024;

test('fitWithin scales the long side of a landscape photo to the max', () => {
  assert.deepEqual(fitWithin(4032, 3024, 2048), { width: 2048, height: 1536 });
});

test('fitWithin scales the long side of a portrait photo to the max', () => {
  assert.deepEqual(fitWithin(3024, 4032, 2048), { width: 1536, height: 2048 });
});

test('fitWithin never upscales a small image', () => {
  assert.deepEqual(fitWithin(640, 480, 2048), { width: 640, height: 480 });
  assert.deepEqual(fitWithin(2048, 2048, 2048), { width: 2048, height: 2048 });
});

test('fitWithin never returns a zero side for an extreme panorama', () => {
  assert.deepEqual(fitWithin(100000, 10, 2048), { width: 2048, height: 1 });
});

test('defaults: 2048 px long side, 1.5 MB target under the 2 MB server limit', () => {
  assert.equal(SHRINK_MAX_DIMENSION, 2048);
  assert.ok(SHRINK_TARGET_BYTES < SHRINK_DEFAULT_MAX_BYTES);
  assert.equal(SHRINK_DEFAULT_MAX_BYTES, 2 * MB);
  assert.deepEqual(firstAttempt(), { quality: QUALITY_STEPS[0], maxDimension: 2048 });
});

test('nextAttempt accepts a result at or under the target', () => {
  assert.equal(nextAttempt(firstAttempt(), 1.5 * MB), 'accept');
  assert.equal(nextAttempt(firstAttempt(), 200_000), 'accept');
});

test('nextAttempt lowers quality step by step while the result is too big', () => {
  let attempt: EncodeAttempt = firstAttempt();
  const seen: number[] = [attempt.quality];
  for (let i = 1; i < QUALITY_STEPS.length; i += 1) {
    const next = nextAttempt(attempt, 3 * MB);
    assert.ok(typeof next === 'object');
    assert.equal(next.maxDimension, 2048);
    attempt = next;
    seen.push(attempt.quality);
  }
  assert.deepEqual(seen, [...QUALITY_STEPS]);
});

test('nextAttempt shrinks the dimension after the lowest quality, then gives up below the minimum', () => {
  const lowest: EncodeAttempt = { quality: QUALITY_STEPS[3], maxDimension: 2048 };
  assert.equal(QUALITY_STEPS.length, 4);
  assert.deepEqual(nextAttempt(lowest, 3 * MB), { quality: QUALITY_STEPS[1], maxDimension: 1536 });
  assert.deepEqual(nextAttempt({ ...lowest, maxDimension: 1536 }, 3 * MB), { quality: QUALITY_STEPS[1], maxDimension: 1152 });
  assert.equal(nextAttempt({ ...lowest, maxDimension: 1000 }, 3 * MB), 'give_up');
  assert.ok(Math.round(1000 * 0.75) < MIN_DIMENSION);
});

test('the quality loop always terminates', () => {
  let attempt: EncodeAttempt | 'accept' | 'give_up' = firstAttempt();
  let rounds = 0;
  while (typeof attempt === 'object') {
    attempt = nextAttempt(attempt, 10 * MB);
    rounds += 1;
    assert.ok(rounds < 16, 'loop must end within the client bound');
  }
  assert.equal(attempt, 'give_up');
});

test('jpegFileName swaps any extension for .jpg', () => {
  assert.equal(jpegFileName('IMG_0001.HEIC'), 'IMG_0001.jpg');
  assert.equal(jpegFileName('scan.final.avif'), 'scan.final.jpg');
  assert.equal(jpegFileName('photo'), 'photo.jpg');
  assert.equal(jpegFileName('.png'), 'photo.jpg');
});

test('PHOTO_ACCEPT is image/* only (explicit .heic would stop iOS converting HEIC to JPEG)', () => {
  assert.equal(PHOTO_ACCEPT, 'image/*');
});

test('decodeResizeOption downscales the long side at decode time, never upscales', () => {
  assert.deepEqual(decodeResizeOption(4032, 3024, 2048), { resizeWidth: 2048 });
  assert.deepEqual(decodeResizeOption(3024, 4032, 2048), { resizeHeight: 2048 });
  assert.deepEqual(decodeResizeOption(5000, 5000, 2048), { resizeWidth: 2048 });
  assert.equal(decodeResizeOption(2048, 1536, 2048), null);
  assert.equal(decodeResizeOption(640, 480, 2048), null);
  assert.equal(decodeResizeOption(0, 0, 2048), null);
});

test('photoFailureMessage maps each failure to JA/EN copy', () => {
  assert.equal(
    photoFailureMessage('ja', 'unreadable'),
    'この形式の画像はこのブラウザで開けません。JPEGかPNGで保存し直して、もう一度選んでください。',
  );
  assert.match(photoFailureMessage('en', 'unreadable'), /cannot open this image format/);
  assert.notEqual(photoFailureMessage('ja', 'too_large'), photoFailureMessage('ja', 'unreadable'));
  assert.match(photoFailureMessage('en', 'too_large'), /too large/);
});

test('photoPickerHint says photos are reduced automatically', () => {
  assert.equal(photoPickerHint('ja'), '写真はアップロード前に自動で縮小します。');
  assert.equal(photoPickerHint('en'), 'Photos are reduced automatically before upload.');
});
