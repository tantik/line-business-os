import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Static source-text regression guards for the Cafe Manager screen
 * unification (fix/cafe-v2-manager-screen-unification): the DB-backed
 * `_client-preview/mame-to-cha/manager` page and the frontend-only
 * `/demo/cafe/manager` page must render through the same `CafeManagerScreen`
 * shell component and must never cross-import each other's data plumbing
 * (demo's localStorage store vs. preview's Server Actions/Supabase loaders).
 *
 * Same convention as `preview-action-free.test.ts`: fast, no-build source
 * checks. The build-verified proof for the Server Action allowlist itself is
 * still `scripts/verify-preview-server-actions.mjs` (unchanged by this file).
 */

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

function read(relativeToThisFile: string): string {
  return readFileSync(path.join(THIS_DIR, relativeToThisFile), 'utf8');
}

function importLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => /^\s*import\b/.test(line))
    .join('\n');
}

const DEMO_MANAGER_VIEW = '../../components/demo/cafe/views/ManagerView.tsx';
const PREVIEW_MANAGER_PAGE = '../../app/%5Fclient-preview/mame-to-cha/manager/page.tsx';
const PREVIEW_MANAGER_VIEW = 'manager-view.tsx';
const CAFE_MANAGER_SCREEN = '../../components/demo/cafe/CafeManagerScreen.tsx';

test('the demo manager screen and the DB-backed preview manager page both render through the shared CafeManagerScreen shell', () => {
  const demoImports = importLines(read(DEMO_MANAGER_VIEW));
  const previewImports = importLines(read(PREVIEW_MANAGER_PAGE));
  assert.match(demoImports, /CafeManagerScreen/, 'demo ManagerView.tsx must import CafeManagerScreen');
  assert.match(previewImports, /CafeManagerScreen/, 'preview manager page.tsx must import CafeManagerScreen');
  assert.match(demoImports, /@\/components\/demo\/cafe\/CafeManagerScreen/, 'demo must import the shared screen from the canonical path');
  assert.match(previewImports, /@\/components\/demo\/cafe\/CafeManagerScreen/, 'preview must import the shared screen from the canonical path');
});

test('the demo manager screen does not import any Preview Server Action, loader, or lib/preview module', () => {
  const source = read(DEMO_MANAGER_VIEW);
  assert.ok(!/['"]@\/lib\/preview\//.test(source), 'demo ManagerView.tsx must not import from @/lib/preview/*');
});

test('the DB-backed preview manager page and display component do not import the demo localStorage store', () => {
  for (const file of [PREVIEW_MANAGER_PAGE, PREVIEW_MANAGER_VIEW]) {
    const source = read(file);
    assert.ok(!/['"]@\/lib\/demo\/cafe\/store['"]/.test(source), `${file} must not import @/lib/demo/cafe/store`);
    assert.ok(!/useDemoCafeStore/.test(source), `${file} must not reference useDemoCafeStore`);
  }
});

test('the DB-backed preview manager display component does not import demo mock data (STAFF/SHIFT_TYPES/etc from @/lib/demo/cafe/data)', () => {
  const source = read(PREVIEW_MANAGER_VIEW);
  assert.ok(!/['"]@\/lib\/demo\/cafe\/data['"]/.test(source), `${PREVIEW_MANAGER_VIEW} must not import @/lib/demo/cafe/data`);
});

test('the shared CafeManagerScreen shell is itself action-free and store-free (usable from both demo and preview trees)', () => {
  const source = read(CAFE_MANAGER_SCREEN);
  assert.ok(!/['"]@\/lib\/preview\//.test(source), 'CafeManagerScreen.tsx must not import from @/lib/preview/*');
  assert.ok(!/['"]@\/lib\/demo\/cafe\/store['"]/.test(source), 'CafeManagerScreen.tsx must not import the demo store');
  assert.ok(!/^\s*['"]use client['"]/m.test(source), 'CafeManagerScreen.tsx must not be a client component (usable from a server component tree too)');
});

test('the preview manager display component never falls back to the raw employeeId when rendering a staff/requester name', () => {
  const source = read(PREVIEW_MANAGER_VIEW);
  assert.ok(!/\?\?\s*r\.employeeId/.test(source), `${PREVIEW_MANAGER_VIEW} must not fall back to the raw employeeId in any rendered label`);
});

test('the preview manager display component renders the exact Japanese safe error string for a failed staff load, with no interpolated raw error/message', () => {
  const source = read(PREVIEW_MANAGER_VIEW);
  assert.ok(source.includes('スタッフ一覧を読み込めませんでした。'), 'expected the safe Japanese staff-load error string');
  assert.ok(!/\{.*(?:err|error)\.message.*\}/.test(source), `${PREVIEW_MANAGER_VIEW} must not interpolate a raw error/message into the UI`);
});

test('the preview manager page never hardcodes the internal _client-preview route segment into a rendered href or message (always via PREVIEW_BASE_PATH)', () => {
  const source = read(PREVIEW_MANAGER_PAGE);
  assert.ok(!/href=\{?["'`][^"'`]*client-preview/.test(source), 'must not hardcode the internal route segment into an href');
});
