import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string) => readFileSync(path.join(THIS_DIR, relativePath), 'utf8');

const DEMO_STAFF_VIEW = '../../components/demo/cafe/views/StaffView.tsx';
const SHARED_STAFF_PRESENTATION = '../../components/demo/cafe/CafeStaffPresentation.tsx';
const DEMO_CLOCK_PANEL = '../../components/demo/cafe/ClockPanel.tsx';

test('the demo Staff screen composes the shared Cafe Staff presentation sections', () => {
  const demo = read(DEMO_STAFF_VIEW);
  const shared = read(SHARED_STAFF_PRESENTATION);
  const demoClock = read(DEMO_CLOCK_PANEL);

  assert.match(demo, /CafeStaffHeader/);
  assert.match(demoClock, /CafeStaffStatusCard/);
  assert.match(demo, /CafeStaffScheduleCard/);
  assert.match(demo, /CafeStaffReportCard/);
  assert.match(demo, /CafeStaffPreferenceCard/);
  assert.ok(!shared.includes('@/lib/demo/cafe/store'));
  assert.ok(!shared.includes('@/lib/preview/'));
});
