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

/**
 * fix/cafe-v2-manager-parity: the preview manager route must match the
 * demo's product-like composition - staff/recipe/shift/correction CRUD opens
 * in a dialog on demand, never as a permanently-open form taking up the main
 * dashboard. These guards prove the mutation-form islands are reachable only
 * through the dialog wrapper components, never rendered directly by the
 * action-free display component or the page itself.
 */
const MUTATION_ISLAND_COMPONENT_NAMES = [
  'PreviewStaffForm',
  'PreviewShiftEditor',
  'PreviewScheduleActions',
  'PreviewCorrectionActions',
  'PreviewRecipeKindManager',
];

const DIALOG_WRAPPER_FILES = [
  'preview-staff-recipe-management.tsx',
  'preview-schedule-card-actions.tsx',
  'preview-correction-requests-panel.tsx',
];

test('the action-free preview manager display component never renders a mutation-form island directly (they only ever open inside a dialog wrapper)', () => {
  const source = read(PREVIEW_MANAGER_VIEW);
  for (const name of MUTATION_ISLAND_COMPONENT_NAMES) {
    assert.ok(!source.includes(name), `${PREVIEW_MANAGER_VIEW} must not reference ${name} - mutation forms must open via a dialog wrapper, never render inline`);
  }
});

test('the preview manager page renders mutation-form islands only through their dialog wrapper components, never directly', () => {
  const source = read(PREVIEW_MANAGER_PAGE);
  for (const name of MUTATION_ISLAND_COMPONENT_NAMES) {
    assert.ok(!source.includes(name), `${PREVIEW_MANAGER_PAGE} must not reference ${name} directly - render it through its dialog wrapper component instead`);
  }
});

test('every manager dialog wrapper renders a shared Demo modal and imports no demo store/mock data', () => {
  for (const file of DIALOG_WRAPPER_FILES) {
    const source = read(file);
    assert.match(
      source,
      /@\/components\/demo\/cafe\/(?:Modal|AutoScheduleModal)/,
      `${file} must render a shared Demo modal`,
    );
    assert.ok(!/['"]@\/lib\/demo\/cafe\/store['"]/.test(source), `${file} must not import the demo store`);
    assert.ok(!/['"]@\/lib\/demo\/cafe\/data['"]/.test(source), `${file} must not import demo mock data`);
  }
});

test('the manager dialog wrappers that render a staff/requester name never fall back to the raw employeeId', () => {
  for (const file of ['preview-schedule-card-actions.tsx', 'preview-correction-requests-panel.tsx']) {
    const source = read(file);
    assert.ok(!/\?\?\s*r\.employeeId/.test(source), `${file} must not fall back to the raw employeeId in any rendered label`);
  }
});

/**
 * fix/cafe-v2-manager-staff-loader: the preview settings card previously
 * carried a technical "read-only, editing coming later" caveat
 * (現在は表示のみ。追加・編集は今後対応予定です) that the demo's SettingsPanel has no
 * equivalent of - Preview must read as a finished product surface, not a
 * placeholder/staging note, even where a control genuinely isn't wired up yet.
 */
test('the preview settings card never renders a technical/placeholder caveat about missing functionality', () => {
  const source = read('preview-settings-card.tsx');
  const bannedPhrases = ['現在は表示のみ', '今後対応予定', 'Read only', 'Read-only', 'Temporary', 'Future', '準備中', '未実装'];
  for (const phrase of bannedPhrases) {
    assert.ok(!source.includes(phrase), `preview-settings-card.tsx must not contain the technical caveat phrase "${phrase}"`);
  }
});

test('the preview manager restores the same customer guidance affordances as the demo manager', () => {
  const schedule = read(PREVIEW_MANAGER_VIEW);
  const management = read('preview-staff-recipe-management.tsx');
  const settings = read('preview-settings-card.tsx');
  const scheduleActions = read('preview-schedule-card-actions.tsx');

  assert.match(schedule, /HELP_MANAGER_SHIFT_TABLE/);
  assert.match(schedule, /セルをクリックして手動でシフトを編集できます/);
  assert.match(schedule, /HELP_MANAGER_MONTHLY_REPORT/);
  assert.match(scheduleActions, /HELP_MANAGER_AUTO_SCHEDULE/);
  assert.match(management, /HELP_MANAGER_STAFF_RECIPE_MANAGEMENT/);
  assert.match(settings, /HELP_MANAGER_SETTINGS/);
});

test('the preview settings summary keeps the demo manager operational fields visible', () => {
  const source = read('preview-settings-card.tsx');
  assert.match(source, /必要人数（曜日ごと）/);
  assert.match(source, /スタッフ最大勤務時間 \/ 月/);
  assert.match(source, /シフト種別/);
});
