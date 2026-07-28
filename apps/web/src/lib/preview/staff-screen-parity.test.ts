import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string) => readFileSync(path.join(THIS_DIR, relativePath), 'utf8');

const PREVIEW_STAFF_PAGE = '../../app/%5Fclient-preview/mame-to-cha/staff/page.tsx';
const PREVIEW_STAFF_VIEW = 'staff-view.tsx';
const PREVIEW_STAFF_ACTIONS = 'preview-staff-actions.tsx';
const PREVIEW_CAFE_LAYOUT = '../../app/%5Fclient-preview/mame-to-cha/layout.tsx';
const DEMO_STAFF_VIEW = '../../components/demo/cafe/views/StaffView.tsx';
const SHARED_STAFF_PRESENTATION = '../../components/demo/cafe/CafeStaffPresentation.tsx';
const DEMO_CLOCK_PANEL = '../../components/demo/cafe/ClockPanel.tsx';
const PREVIEW_CLOCK_PANEL = 'preview-clock-panel.tsx';
const PREVIEW_SHIFT_PREFERENCE_FORM = 'preview-shift-preference-form.tsx';

test('preview staff uses the cafe product theme and never the legacy dark theme', () => {
  for (const file of [PREVIEW_STAFF_PAGE, PREVIEW_STAFF_VIEW, PREVIEW_STAFF_ACTIONS]) {
    const source = read(file);
    assert.ok(!source.includes('@/lib/ui/theme'), `${file} must not import the legacy dark UI theme`);
  }
});

test('manager, staff, and recipes inherit one light Mame To Cha preview shell', () => {
  const layout = read(PREVIEW_CAFE_LAYOUT);
  assert.match(layout, /demoColors\.bg/);
  assert.match(layout, /minHeight:\s*'100vh'/);

  for (const route of ['manager', 'staff', 'recipes']) {
    const nestedLayout = `../../app/%5Fclient-preview/mame-to-cha/${route}/layout.tsx`;
    assert.throws(() => read(nestedLayout), `${route} must not duplicate the shared Cafe layout`);
  }
});

test('staff no-profile diagnostics expose reason categories but no identifiers or error text', () => {
  const source = read('staff-profile-diagnostic.ts');
  assert.match(source, /profile_not_bound/);
  assert.match(source, /profile_read_unauthorized/);
  assert.match(source, /profile_location_mismatch/);
  assert.ok(!source.includes('tenantId'));
  assert.ok(!source.includes('staffId'));
  assert.ok(!source.includes('userId'));
  assert.ok(!source.includes('.message'));
});

test('preview staff mutation forms open through the shared Modal instead of rendering permanently on the page', () => {
  const page = read(PREVIEW_STAFF_PAGE);
  const actions = read(PREVIEW_STAFF_ACTIONS);
  for (const component of [
    'PreviewShiftPreferenceForm',
    'PreviewWorkReportForm',
    'PreviewCorrectionRequestForm',
  ]) {
    assert.ok(!page.includes(`<${component}`), `${component} must not render directly on the staff page`);
    assert.ok(actions.includes(component), `${component} must be composed by PreviewStaffActions`);
  }
  assert.match(actions, /@\/components\/demo\/cafe\/Modal/);
});

test('preview staff adapter never imports demo mock data or localStorage state', () => {
  for (const file of [PREVIEW_STAFF_PAGE, PREVIEW_STAFF_VIEW, PREVIEW_STAFF_ACTIONS]) {
    const source = read(file);
    assert.ok(!source.includes('@/lib/demo/cafe/data'), `${file} must not import demo mock data`);
    assert.ok(!source.includes('@/lib/demo/cafe/store'), `${file} must not import the demo store`);
    assert.ok(!source.includes('localStorage'), `${file} must not use localStorage`);
  }
});

test('preview staff reuses the Demo compact schedule and removes the Preview-only profile card', () => {
  const source = read(PREVIEW_STAFF_VIEW);
  assert.match(source, /@\/components\/demo\/cafe\/ShiftTable/);
  assert.match(source, /@\/components\/demo\/cafe\/ShiftLegend/);
  assert.ok(!source.includes('プロフィール'));
  assert.ok(!source.includes('employmentType'));
  assert.ok(!source.includes('positionLabel'));
  assert.match(source, /startsAtLocal\.slice\(0,\s*5\)/);
  assert.match(source, /endsAtLocal\.slice\(0,\s*5\)/);
});

test('Demo and Preview compose the same Staff presentation sections', () => {
  const demo = read(DEMO_STAFF_VIEW);
  const page = read(PREVIEW_STAFF_PAGE);
  const view = read(PREVIEW_STAFF_VIEW);
  const actions = read(PREVIEW_STAFF_ACTIONS);
  const shared = read(SHARED_STAFF_PRESENTATION);
  const demoClock = read(DEMO_CLOCK_PANEL);
  const previewClock = read(PREVIEW_CLOCK_PANEL);

  assert.match(demo, /CafeStaffHeader/);
  assert.match(page, /CafeStaffHeader/);
  assert.match(demoClock, /CafeStaffStatusCard/);
  assert.match(previewClock, /CafeStaffStatusCard/);
  assert.match(demo, /CafeStaffScheduleCard/);
  assert.match(view, /CafeStaffScheduleCard/);
  assert.match(demo, /CafeStaffReportCard/);
  assert.match(actions, /CafeStaffReportCard/);
  assert.match(demo, /CafeStaffPreferenceCard/);
  assert.match(actions, /CafeStaffPreferenceCard/);
  assert.ok(!shared.includes('@/lib/demo/cafe/store'));
  assert.ok(!shared.includes('@/lib/preview/'));
});

test('preview staff client-facing summary has no mixed English section labels', () => {
  const source = read(PREVIEW_STAFF_VIEW);
  for (const phrase of [
    'My staff profile',
    'My published schedule',
    'My submitted shift preferences',
    'My work reports this week',
    'My correction requests this week',
    'temporarily unavailable',
  ]) {
    assert.ok(!source.includes(phrase), `staff-view.tsx must not contain "${phrase}"`);
  }
});

test('next-month preference UI uses compact HH:MM labels and a next-month default date', () => {
  const page = read(PREVIEW_STAFF_PAGE);
  const form = read(PREVIEW_SHIFT_PREFERENCE_FORM);
  assert.match(page, /Date\.UTC\(todayYear!,\s*todayMonth!,\s*1\)/);
  assert.match(form, /startsAtLocal\.slice\(0,\s*5\)/);
  assert.match(form, /endsAtLocal\.slice\(0,\s*5\)/);
});
