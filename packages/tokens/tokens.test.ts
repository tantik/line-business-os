import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flatTokens, color, cssVar, varName } from './src/index';

const here = dirname(fileURLToPath(import.meta.url));

test('every flat token has a non-empty string value', () => {
  for (const [name, value] of Object.entries(flatTokens)) {
    assert.match(name, /^--oruwa-[a-z0-9-]+$/, `bad var name: ${name}`);
    assert.equal(typeof value, 'string');
    assert.ok(value.length > 0, `empty value for ${name}`);
  }
});

test('semantic color tokens resolve to a hex or rgb(a) literal (never a var reference)', () => {
  for (const [key, value] of Object.entries(color)) {
    assert.match(
      value,
      /^(#[0-9A-Fa-f]{6}|rgba?\([^)]+\))$/,
      `color.${key} = ${value} is not a literal color`,
    );
  }
});

test('accent-text is darker than accent (WCAG AA fix must not regress)', () => {
  assert.notEqual(color.accent, color['accent-text']);
  assert.equal(color['accent-text'], '#3B5C3E');
});

test('committed dist/tokens.css is in sync with the token source', () => {
  const committed = readFileSync(join(here, 'dist', 'tokens.css'), 'utf8');
  for (const [name, value] of Object.entries(flatTokens)) {
    assert.ok(
      committed.includes(`${name}: ${value};`),
      `dist/tokens.css missing or stale: "${name}: ${value};" — run pnpm --filter @line-os/tokens build:css`,
    );
  }
  const declaredCount = (committed.match(/^\s*--oruwa-/gm) ?? []).length;
  assert.equal(
    declaredCount,
    Object.keys(flatTokens).length,
    'dist/tokens.css has extra/stale declarations',
  );
});

test('cssVar / varName helpers', () => {
  assert.equal(varName('color', 'bg'), '--oruwa-color-bg');
  assert.equal(cssVar('color', 'bg'), 'var(--oruwa-color-bg)');
  assert.equal(cssVar('font-size', '2xl'), 'var(--oruwa-font-size-2xl)');
  assert.equal(cssVar('color', 'bg', '#FAF3E7'), 'var(--oruwa-color-bg, #FAF3E7)');
});
