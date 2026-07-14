import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPreviewRewrites, PREVIEW_DESTINATION_BASE, PREVIEW_HOST, PREVIEW_SOURCE_BASE } from './rewrite-config.mjs';

test('buildPreviewRewrites returns exactly two rules (root + wildcard)', () => {
  const rules = buildPreviewRewrites();
  assert.equal(rules.length, 2);
});

test('every rule matches only the preview.oruwa.jp host', () => {
  for (const rule of buildPreviewRewrites()) {
    assert.deepEqual(rule.has, [{ type: 'host', value: PREVIEW_HOST }]);
  }
  assert.equal(PREVIEW_HOST, 'preview.oruwa.jp');
});

test('root rule rewrites the exact public path to the internal destination', () => {
  const rules = buildPreviewRewrites();
  const root = rules[0];
  assert.ok(root);
  assert.equal(root.source, PREVIEW_SOURCE_BASE);
  assert.equal(root.destination, PREVIEW_DESTINATION_BASE);
  assert.equal(root.source, '/mame-to-cha');
  assert.equal(root.destination, '/_client-preview/mame-to-cha');
});

test('wildcard rule rewrites every preview subpath preserving the path segment', () => {
  const rules = buildPreviewRewrites();
  const wildcard = rules[1];
  assert.ok(wildcard);
  assert.equal(wildcard.source, `${PREVIEW_SOURCE_BASE}/:path*`);
  assert.equal(wildcard.destination, `${PREVIEW_DESTINATION_BASE}/:path*`);
});

test('the rewrite rules never target the public /dashboard/workforce tree', () => {
  for (const rule of buildPreviewRewrites()) {
    assert.ok(!rule.destination.includes('/dashboard/workforce'), 'preview rewrite must never target the dashboard tree');
  }
});
