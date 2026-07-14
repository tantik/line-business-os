import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Phase 1N-4C Slice B1 - source-text regression guards proving the Mame To
 * Cha preview dependency graph is structurally action-free, not just
 * UI-hidden.
 *
 * These are static-source checks only (this repo's `node:test` suite has no
 * jsdom/RTL, and `.next` does not exist before a build) - the authoritative,
 * build-verified proof is `scripts/verify-preview-no-server-actions.mjs`,
 * which parses `.next/server/server-reference-manifest.json` after
 * `next build` and fails if any preview route registers a Server Action
 * worker. Run both: this file catches the regression immediately during
 * `pnpm test` (fast, no build needed); the manifest script is the ground
 * truth Next.js itself compiled (`pnpm verify:preview-no-actions`).
 *
 * Unlike the prior version of this file, every preview-reachable source file
 * is scanned - not only the leaf `page.tsx` routes - which is exactly the gap
 * that let the previous `readOnly`-prop approach pass this suite while still
 * registering all 12 Workforce mutation actions as callable workers for the
 * preview manager route (confirmed by inspecting the manifest directly).
 */

// Deliberately joins as a plain filesystem path (not `new URL()`), since
// `new URL()` percent-decodes `%5F` back to `_` when resolving - but the
// preview route folder is literally named `%5Fclient-preview` on disk (the
// Next.js private-folder escape hatch), not `_client-preview`.
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

function read(relativeToThisFile: string): string {
  return readFileSync(path.join(THIS_DIR, relativeToThisFile), 'utf8');
}

/**
 * Only the `import ...` statement lines, not the whole file text - so a doc
 * comment that explains *why* a component must not be imported (and
 * necessarily names it in prose) can never itself trip these guards.
 */
function importLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => /^\s*import\b/.test(line))
    .join('\n');
}

/** Every file in the preview dependency graph: the shared display components plus all five route files. */
const PREVIEW_FILES = [
  'manager-view.tsx',
  'staff-view.tsx',
  '../../app/%5Fclient-preview/mame-to-cha/page.tsx',
  '../../app/%5Fclient-preview/mame-to-cha/manager/page.tsx',
  '../../app/%5Fclient-preview/mame-to-cha/staff/page.tsx',
  '../../app/%5Fclient-preview/mame-to-cha/recipes/page.tsx',
  '../../app/%5Fclient-preview/mame-to-cha/recipes/[recipeId]/page.tsx',
];

const MUTATION_ACTION_MODULES = ['staff-actions', 'schedule-actions', 'attendance-actions'];

const MUTATION_FORM_COMPONENTS = [
  'StaffForm',
  'LineLinkForm',
  'ShiftCellEditor',
  'ShiftPreferenceForm',
  'WorkReportForm',
  'CorrectionRequestForm',
];

/** The full interactive dashboard client components must never be imported by preview - not even alongside a readOnly-style prop. */
const DASHBOARD_CLIENT_COMPONENTS = ['ManagerDashboardClient', 'StaffDashboardClient'];

for (const file of PREVIEW_FILES) {
  test(`${file}: does not import any Workforce mutation Server Action module`, () => {
    const imports = importLines(read(file));
    for (const moduleName of MUTATION_ACTION_MODULES) {
      assert.ok(
        !new RegExp(`['"][^'"]*${moduleName}(?:\\.js)?['"]`).test(imports),
        `${file} must not import from a module matching "${moduleName}"`,
      );
    }
  });

  test(`${file}: does not import a known mutation-form component`, () => {
    const imports = importLines(read(file));
    for (const componentName of MUTATION_FORM_COMPONENTS) {
      assert.ok(
        !new RegExp(`\\b${componentName}\\b`).test(imports),
        `${file} must not import the mutation-form component ${componentName}`,
      );
    }
  });

  test(`${file}: does not import the full interactive dashboard client component`, () => {
    const imports = importLines(read(file));
    for (const componentName of DASHBOARD_CLIENT_COMPONENTS) {
      assert.ok(
        !new RegExp(`\\b${componentName}\\b`).test(imports),
        `${file} must not import ${componentName} - preview must render only action-free display components`,
      );
    }
  });

  test(`${file}: contains no <form action= binding`, () => {
    const source = read(file);
    assert.ok(!/<form\s[^>]*\baction\s*=/.test(source), `${file} must not contain a <form action=...> binding`);
  });
}

test('manager-view.tsx and staff-view.tsx are not client components (no client bundle => no possible action-reference registration)', () => {
  for (const file of ['manager-view.tsx', 'staff-view.tsx']) {
    const source = read(file);
    assert.ok(!/^\s*['"]use client['"]/m.test(source), `${file} must not be a 'use client' component`);
  }
});

test('manager-view.tsx and staff-view.tsx expose no callback prop shaped like a Server Action (e.g. onSuccess/onSubmit bound to a mutation)', () => {
  for (const file of ['manager-view.tsx', 'staff-view.tsx']) {
    const source = read(file);
    assert.ok(!/formData/.test(source), `${file} must not construct FormData (a mutation-submission pattern)`);
  }
});
