import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { reportNeedsManagerAttention } from '@/lib/demo/cafe/report-indicator';
import { toPreviewRecipeViewModel } from '@/lib/preview/recipe-view-model';

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
/** The `'use client'` chrome `manager-view.tsx` delegates all rendering (including i18n) to -- see that file's header comment for why the split exists (the "manager-view.tsx must not be 'use client'" invariant in `preview-action-free.test.ts`). */
const PREVIEW_MANAGER_VIEW_CHROME = 'preview-manager-view-chrome.tsx';
const MANAGER_I18N_DICT = '../demo/cafe/i18n.manager.ts';
const CAFE_MANAGER_SCREEN = '../../components/demo/cafe/CafeManagerScreen.tsx';

test('inactive shift types are hidden from new assignments while retained for existing assignments', () => {
  const source = read('preview-shift-grid.tsx');
  assert.match(source, /item\.isActive \|\| item\.shiftTypeId === assignment\?\.shiftTypeId/);
  assert.match(source, /assignmentItem\.employeeId && assignmentItem\.shiftTypeId === item\.shiftTypeId/);
  assert.match(source, /toManagerViewShiftTypes\(visibleShiftTypes\)/);
  assert.match(source, /\{selectableShiftTypes\.map\(\(item\) => \(/);

  const chromeSource = read(PREVIEW_MANAGER_VIEW_CHROME);
  assert.match(chromeSource, /toManagerViewShiftTypes\(managerLegendShiftTypes\)/);
});

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

test('the Preview recipe adapter maps real detail data without demo fixtures', () => {
  const recipe = toPreviewRecipeViewModel(
    {
      recipe: {
        recipeId: 'recipe-1',
        tenantId: 'tenant-1',
        locationId: null,
        recipeCategoryId: 'category-1',
        titleJa: '抹茶ラテ',
        titleEn: 'Matcha Latte',
        descriptionJa: '説明',
        descriptionEn: 'Description',
        contentKind: 'recipe',
        isPopular: true,
        status: 'published',
        createdAt: '',
        updatedAt: '',
        originalLanguage: 'ja',
      },
      ingredients: [
        { ingredientId: 'i-1', tenantId: 'tenant-1', recipeId: 'recipe-1', labelJa: '抹茶', labelEn: 'Matcha', sortOrder: 1 },
      ],
      steps: [
        { stepId: 's-1', tenantId: 'tenant-1', recipeId: 'recipe-1', stepNumber: 1, instructionJa: '混ぜる', instructionEn: 'Mix' },
      ],
      notes: [
        { noteId: 'n-1', tenantId: 'tenant-1', recipeId: 'recipe-1', titleJa: 'ポイント', titleEn: 'Tip', bodyJa: '確認', bodyEn: 'Check' },
      ],
    },
    [
      {
        categoryId: 'category-1',
        tenantId: 'tenant-1',
        labelJa: 'ドリンク',
        labelEn: 'Drinks',
        sortOrder: 1,
        isActive: true,
      },
    ],
  );

  assert.equal(recipe.name, '抹茶ラテ');
  assert.deepEqual(recipe.badges, ['人気']);
  assert.deepEqual(recipe.ingredients, ['抹茶']);
  assert.deepEqual(recipe.steps, ['混ぜる']);
  assert.equal(recipe.memo, '確認');
});

test('the DB-backed Preview recipes page reuses the shared recipe browser and never imports demo fixtures', () => {
  const source = read('../../app/%5Fclient-preview/mame-to-cha/recipes/page.tsx');
  assert.match(source, /RecipeBrowser/);
  assert.ok(!source.includes('@/lib/demo/cafe/data'));
});

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
  const source = read(PREVIEW_MANAGER_VIEW_CHROME);
  assert.ok(!/\?\?\s*r\.employeeId/.test(source), `${PREVIEW_MANAGER_VIEW_CHROME} must not fall back to the raw employeeId in any rendered label`);
});

test('manager week navigation avoids eager adjacent-week loads, never navigates, and stops at the supported bounds', () => {
  // Preview Manager architecture (perf phase 3): plain week nav is now a
  // pure client-side date-range filter over a preloaded ±8-week
  // `allAssignments` window - the same pattern Staff already used - so it
  // makes NO network request at all, not even the scoped
  // `previewGetScheduleWeek()` Server Action perf phase 2 introduced. That
  // action is still called, but only from `navigateToWeek`'s absence and
  // from the post-mutation forced refresh (`onScheduleChanged`) - asserting
  // it never appears inside `navigateToWeek` is the stronger property.
  const source = read(PREVIEW_MANAGER_VIEW_CHROME);
  assert.ok(!source.includes('useEffect('), 'week navigation must not eagerly load both adjacent weeks');
  assert.ok(!/\brouter\.(push|replace|prefetch)\(/.test(source), 'week navigation must not use next/navigation - it must never re-run the whole Manager page or reset scroll');
  const navigateToWeekBody = source.slice(source.indexOf('function navigateToWeek'), source.indexOf('\n  }\n', source.indexOf('function navigateToWeek')));
  assert.ok(!navigateToWeekBody.includes('previewGetScheduleWeek'), 'plain week navigation must not call the scoped week-fetch Server Action - it must read from the already-preloaded window');
  assert.match(source, /activeWeekOffset <= MIN_WEEK_OFFSET/);
  assert.match(source, /activeWeekOffset >= MAX_WEEK_OFFSET/);
});

test('the preview manager display component renders the safe staff-load error via translation, with no interpolated raw error/message', () => {
  // i18n follow-up: the literal JA string moved to `../demo/cafe/i18n.manager.ts`
  // (`staffListLoadError`); the chrome file references it via `t('staffListLoadError')`.
  const source = read(PREVIEW_MANAGER_VIEW_CHROME);
  const managerDict = read(MANAGER_I18N_DICT);
  assert.match(source, /t\('staffListLoadError'\)/);
  assert.ok(managerDict.includes('スタッフ一覧を読み込めませんでした。'), 'expected the safe Japanese staff-load error string in the dictionary');
  assert.ok(!/\{.*(?:err|error)\.message.*\}/.test(source), `${PREVIEW_MANAGER_VIEW_CHROME} must not interpolate a raw error/message into the UI`);
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
  // i18n follow-up: the シフト表 card's help text now renders via
  // `tManager(lang, 'shiftTableHelp')` (from `../demo/cafe/i18n.manager.ts`)
  // instead of an inline literal, and the rendering itself moved from
  // `manager-view.tsx` into `PREVIEW_MANAGER_VIEW_CHROME` (a `'use client'`
  // sibling) so `manager-view.tsx` can stay a non-client pass-through (see
  // `preview-action-free.test.ts`). This test now checks the chrome file for
  // the HELP_* wiring and the translation key, and the dictionary file for
  // the actual JA copy, rather than a literal string inside `manager-view.tsx`.
  const schedule = read(PREVIEW_MANAGER_VIEW_CHROME);
  const managerDict = read(MANAGER_I18N_DICT);
  const management = read('preview-staff-recipe-management.tsx');
  const settings = read('preview-settings-card.tsx');
  const scheduleActions = read('preview-schedule-card-actions.tsx');

  assert.match(schedule, /HELP_MANAGER_SHIFT_TABLE/);
  assert.match(schedule, /t\('shiftTableHelp'\)/);
  assert.match(managerDict, /セルをクリックして手動でシフトを編集できます/);
  assert.match(schedule, /HELP_MANAGER_MONTHLY_REPORT/);
  assert.match(scheduleActions, /HELP_MANAGER_AUTO_SCHEDULE/);
  assert.match(management, /HELP_MANAGER_STAFF_RECIPE_MANAGEMENT/);
  assert.match(settings, /HELP_MANAGER_SETTINGS/);
});

test('the preview settings summary keeps the demo manager operational fields visible', () => {
  // Same i18n follow-up as above: these fields' JA copy now lives in
  // `../demo/cafe/i18n.manager.ts`, referenced from `preview-settings-card.tsx`
  // via translation keys rather than inline literals.
  const source = read('preview-settings-card.tsx');
  const managerDict = read(MANAGER_I18N_DICT);
  assert.match(managerDict, /曜日ごとの各シフト必要人数/);
  assert.match(managerDict, /スタッフ最大勤務時間 \/ 月/);
  assert.match(managerDict, /シフト種別/);
  assert.match(source, /t\('requiredHeadcountHeading'\)/);
  assert.match(source, /t\('maxWorkHoursLabel'\)/);
  assert.match(source, /t\('shiftTypesHeading'\)/);
  assert.match(source, /setEditStart\(st\.startsAtLocal\.slice\(0,\s*5\)\)/);
  assert.match(source, /setEditEnd\(st\.endsAtLocal\.slice\(0,\s*5\)\)/);
});

test('editing the Required-headcount inputs reads event.currentTarget synchronously, never inside the setRequirements updater', () => {
  // Regression guard for a confirmed page-crashing bug: the DOM resets a
  // native event's `currentTarget` to `null` once dispatch finishes, so
  // referencing `event.currentTarget` lazily inside a `setState` functional
  // updater -- which React invokes later, not inline with the event handler
  // -- threw `TypeError: Cannot read properties of null (reading 'value')`
  // on every single edit to any Required-headcount weekday input, crashing
  // the whole page (this preview route tree has no error boundary to contain
  // it). Reproduced live with Playwright against a running dev server before
  // the fix, and confirmed fixed after. `event` (and therefore
  // `event.currentTarget`) must never appear inside the `current.map(...)`
  // callback passed to `setRequirements` -- the parsed value must be read
  // into a local const first, outside and before the `setRequirements` call.
  const source = read('preview-settings-card.tsx');
  const start = source.indexOf("aria-label={`${label}${t('weekdayAriaSuffix')}`}");
  assert.ok(start !== -1, 'Required-headcount input not found in preview-settings-card.tsx');
  const onChangeStart = source.indexOf('onChange={(event) => {', start);
  assert.ok(onChangeStart !== -1, 'Required-headcount onChange handler not found');
  const onChangeEnd = source.indexOf('}}', onChangeStart);
  const onChangeBody = source.slice(onChangeStart, onChangeEnd);

  assert.match(
    onChangeBody,
    /const parsed = Number\(event\.currentTarget\.value\);/,
    'value must be read from event.currentTarget synchronously, before setRequirements is called',
  );
  const setRequirementsCallStart = onChangeBody.indexOf('setRequirements(');
  assert.ok(setRequirementsCallStart !== -1, 'setRequirements call not found in onChange handler');
  const setRequirementsCall = onChangeBody.slice(setRequirementsCallStart);
  assert.doesNotMatch(
    setRequirementsCall,
    /event/,
    'event must never be referenced inside the setRequirements updater -- currentTarget is null by the time React runs it',
  );
  assert.match(setRequirementsCall, /\? parsed : value/);
});

test('destructive and high-impact Manager actions require accurate copy and an explicit confirmation boundary', () => {
  const managerDict = read(MANAGER_I18N_DICT);
  const staffForm = read('preview-staff-form.tsx');
  const recipeManager = read('preview-recipe-kind-manager.tsx');
  const shiftGrid = read('preview-shift-grid.tsx');
  const scheduleActions = read('preview-schedule-card-actions.tsx');

  assert.match(managerDict, /deleteStaffButton: '削除'/);
  assert.match(managerDict, /deleteStaffButton: 'Delete'/);
  assert.match(managerDict, /staffFilterInactive: '無効化済み'/);
  assert.match(managerDict, /staffFilterInactive: 'Deactivated'/);
  assert.match(staffForm, /confirmLabel=\{t\('confirmPermanentDeleteStaffButton'\)\}/);
  assert.match(staffForm, /onClick=\{\(\) => \{\s*setPermanentDeleteError\(null\);\s*setPermanentDeleteTarget\(s\);\s*\}\}/);

  assert.match(recipeManager, /'アーカイブ' : 'Archive'/);
  assert.match(recipeManager, /title=\{lang === 'ja' \? 'このレシピをアーカイブしますか？' : 'Archive this recipe\?'\}/);
  assert.doesNotMatch(recipeManager, /Delete this recipe\?|レシピを削除しますか/);

  assert.match(shiftGrid, /open=\{confirmingUnassign && assignment !== null\}/);
  assert.match(shiftGrid, /assignment\?\.published/);
  assert.match(shiftGrid, /onConfirm=\{clearAssignment\}/);
  assert.match(scheduleActions, /onClick=\{\(\) => setPublishConfirmOpen\(true\)\}/);
  assert.match(scheduleActions, /open=\{publishConfirmOpen\}/);
  assert.match(scheduleActions, /onConfirm=\{publishSchedule\}/);
});
