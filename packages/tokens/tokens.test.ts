import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { flatTokens, color, cssVar, varName } from './src/index';

const here = dirname(fileURLToPath(import.meta.url));

/** WCAG relative luminance / contrast ratio for a `#rrggbb` literal against an opaque background. */
function relativeLuminance(hex: string): number {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const sorted = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  const [la, lb] = sorted;
  return (la + 0.05) / (lb + 0.05);
}

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

test('all "-text" color roles clear WCAG AA (4.5:1) against both surface backgrounds', () => {
  const backgrounds = [color.bg, color.surface];
  const textRoles: Array<keyof typeof color> = [
    'text-primary',
    'text-muted',
    'accent-text',
    'danger-text',
    'success-text',
    'warning-text',
    'info-text',
  ];
  for (const role of textRoles) {
    const value = color[role];
    assert.match(value, /^#[0-9A-Fa-f]{6}$/, `${role} must be an opaque hex to contrast-check`);
    for (const bg of backgrounds) {
      const ratio = contrastRatio(value, bg);
      assert.ok(
        ratio >= 4.5,
        `color.${role} (${value}) vs background ${bg} = ${ratio.toFixed(2)}:1, below WCAG AA 4.5:1`,
      );
    }
  }
});

test('text-muted is the Design System v1 AA fix, not the pre-Phase-0 value', () => {
  // Audit finding P0-1: the old `#8B7C64` failed AA at the 12-14px sizes it's
  // used at. Pinned here so this fix can't silently regress.
  assert.equal(color['text-muted'], '#6B5D48');
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
