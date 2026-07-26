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

test('preview staff uses the cafe product theme and never the legacy dark theme', () => {
  for (const file of [PREVIEW_STAFF_PAGE, PREVIEW_STAFF_VIEW, PREVIEW_STAFF_ACTIONS]) {
    const source = read(file);
    assert.ok(!source.includes('@/lib/ui/theme'), `${file} must not import the legacy dark UI theme`);
  }
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
