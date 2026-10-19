import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { reportNeedsManagerAttention } from '@/lib/demo/cafe/report-indicator';

/**
 * Static source-text regression guards for the shared Cafe Manager screen
 * shell (`CafeManagerScreen`) used by the frontend-only `/demo/cafe/manager`
 * page: the demo must render through the shared shell, and the shell itself
 * must stay action-free and store-free so any route can reuse it.
 *
 * Fast, no-build source checks (this repo's `node --test` runner has no
 * component-rendering harness).
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
const CAFE_MANAGER_SCREEN = '../../components/demo/cafe/CafeManagerScreen.tsx';

test('a decided correction request no longer keeps the schedule-cell attention marker', () => {
  const base = {
    hasCorrectionRequest: true,
    message: '勤務時間の修正を依頼しています。',
  };

  assert.equal(
    reportNeedsManagerAttention({ ...base, correctionRequest: { reason: '修正', status: 'pending' } }),
    true,
  );
  assert.equal(
    reportNeedsManagerAttention({ ...base, correctionRequest: { reason: '修正', status: 'approved' } }),
    false,
  );
  assert.equal(
    reportNeedsManagerAttention({ ...base, correctionRequest: { reason: '修正', status: 'rejected' } }),
    false,
  );
});

test('the demo manager screen renders through the shared CafeManagerScreen shell', () => {
  const demoImports = importLines(read(DEMO_MANAGER_VIEW));
  assert.match(demoImports, /CafeManagerScreen/, 'demo ManagerView.tsx must import CafeManagerScreen');
  assert.match(demoImports, /@\/components\/demo\/cafe\/CafeManagerScreen/, 'demo must import the shared screen from the canonical path');
});

test('the demo manager screen does not import any lib/preview module', () => {
  const source = read(DEMO_MANAGER_VIEW);
  assert.ok(!/['"]@\/lib\/preview\//.test(source), 'demo ManagerView.tsx must not import from @/lib/preview/*');
});

test('the shared CafeManagerScreen shell is itself action-free and store-free', () => {
  const source = read(CAFE_MANAGER_SCREEN);
  assert.ok(!/['"]@\/lib\/preview\//.test(source), 'CafeManagerScreen.tsx must not import from @/lib/preview/*');
  assert.ok(!/['"]@\/lib\/demo\/cafe\/store['"]/.test(source), 'CafeManagerScreen.tsx must not import the demo store');
  assert.ok(!/^\s*['"]use client['"]/m.test(source), 'CafeManagerScreen.tsx must not be a client component (usable from a server component tree too)');
});
