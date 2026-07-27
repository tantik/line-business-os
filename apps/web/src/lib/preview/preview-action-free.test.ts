import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Phase 1N-4C Slice B2a/B2b - source-text regression guards proving the Mame
 * To Cha preview dependency graph registers exactly its allowlisted preview
 * Server Actions per route, never anything else.
 *
 * Evolves the prior B1-era version of this file (which asserted every
 * preview-reachable file imported ZERO mutation Server Actions), then the
 * B2a-era version (manager route only). B2b adds the staff route's own exact
 * three-action allowlist: the check is now role-aware across three tiers -
 * the manager route/islands may import only the exact manager action set;
 * the staff route/islands may import only the exact staff action set;
 * staff actions; every other preview-reachable file (root/recipes routes, the
 * display components) must remain fully action-free, exactly as in B1.
 *
 * These are static-source checks only - the authoritative, build-verified
 * proof is `scripts/verify-preview-server-actions.mjs`, which parses
 * `.next/server/server-reference-manifest.json` after `next build` and fails
 * if any preview route registers a worker outside its exact allowlist. Run
 * both: this file catches the regression immediately during `pnpm test`
 * (fast, no build needed); the manifest script is the ground truth Next.js
 * itself compiled (`pnpm verify:preview-actions`).
 */

// Deliberately joins as a plain filesystem path (not `new URL()`), since
// `new URL()` percent-decodes `%5F` back to `_` when resolving - but the
// preview route folder is literally named `%5Fclient-preview` on disk (the
// Next.js private-folder escape hatch), not `_client-preview`.
const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));

function read(relativeToThisFile: string): string {
  return readFileSync(path.join(THIS_DIR, relativeToThisFile), 'utf8');
}

/** Only the `import ...` statement lines - so a doc comment explaining why a component must not be imported never itself trips these guards. */
function importLines(source: string): string {
  return source
    .split('\n')
    .filter((line) => /^\s*import\b/.test(line))
    .join('\n');
}

/** Action-free display components + root/recipes preview route files - must register zero Server Actions, unchanged from B1. */
const ACTION_FREE_PREVIEW_FILES = [
  'manager-view.tsx',
  'staff-view.tsx',
  '../../components/demo/cafe/CafeManagerScreen.tsx',
  '../../app/%5Fclient-preview/mame-to-cha/page.tsx',
  '../../app/%5Fclient-preview/mame-to-cha/recipes/page.tsx',
  '../../app/%5Fclient-preview/mame-to-cha/recipes/[recipeId]/page.tsx',
];

/** Manager interactive client islands - the only files where a submitted authority field could ever appear. */
const MANAGER_ACTION_ISLAND_FILES = [
  'preview-staff-form.tsx',
  'preview-shift-editor.tsx',
  'preview-schedule-actions.tsx',
  'preview-correction-actions.tsx',
  'preview-recipe-kind-manager.tsx',
  'preview-settings-card.tsx',
  'preview-shift-grid.tsx',
];

/** Dialog-trigger wrappers (fix/cafe-v2-manager-parity) - render the action islands above inside the shared `Modal`, opened on demand instead of the form being permanently open. They import no preview Server Action directly (only the island components), but must obey every other manager-route boundary the islands do. */
const MANAGER_DIALOG_WRAPPER_FILES = [
  'preview-staff-recipe-management.tsx',
  'preview-schedule-card-actions.tsx',
  'preview-correction-requests-panel.tsx',
];

/** Every manager-route client file: the action islands plus the dialog wrappers that compose them. */
const MANAGER_ISLAND_FILES = [...MANAGER_ACTION_ISLAND_FILES, ...MANAGER_DIALOG_WRAPPER_FILES];

/** The manager route page plus its interactive client islands - only exact manager allowlist imports are permitted. */
const MANAGER_PREVIEW_FILES = ['../../app/%5Fclient-preview/mame-to-cha/manager/page.tsx', ...MANAGER_ISLAND_FILES];

/** The B2b staff interactive client islands - 'use client' components that call preview staff Server Actions. */
const STAFF_ISLAND_FILES = [
  'preview-staff-actions.tsx',
  'preview-shift-preference-form.tsx',
  'preview-work-report-form.tsx',
  'preview-clock-panel.tsx',
  'preview-correction-request-form.tsx',
];

/** The staff route page plus its B2b interactive client islands - the only preview files permitted to import a preview Server Action from the staff allowlist, and only the exact three B2b exports. The page itself is a server component that legitimately resolves `tenantId`/`locationId` internally (unchanged from B1) to load read-only data - only the islands below are checked for authority-field leakage into a submittable form. */
const STAFF_PREVIEW_FILES = ['../../app/%5Fclient-preview/mame-to-cha/staff/page.tsx', ...STAFF_ISLAND_FILES];

const ALL_PREVIEW_FILES = [...ACTION_FREE_PREVIEW_FILES, ...MANAGER_PREVIEW_FILES, ...STAFF_PREVIEW_FILES];

const B2A_MANAGER_ACTION_EXPORTS = [
  'previewUpsertEmployee',
  'previewSetEmployeeActive',
  'previewCreateShiftAssignment',
  'previewUpdateShiftAssignment',
  'previewRunAutoDistribution',
  'previewPublishSchedule',
  'previewDecideCorrectionRequest',
  'previewSetRecipeContentKind',
  'previewSaveScheduleSettings',
];

const B2B_STAFF_ACTION_EXPORTS = [
  'previewSubmitShiftPreference',
  'previewSubmitWorkReport',
  'previewClockIn',
  'previewClockOut',
  'previewSubmitCorrectionRequest',
];

const DASHBOARD_MUTATION_ACTION_MODULES = ['staff-actions', 'schedule-actions', 'attendance-actions'];

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

/** Matches `@/lib/workforce/<dashboard-action-module>` or `@/lib/workforce/employee-line-links` specifically - never the preview wrapper of the same basename under `@/lib/preview/actions/`. */
function importsDashboardActionModule(importsText: string, moduleName: string): boolean {
  return new RegExp(`['"]@/lib/workforce/${moduleName}(?:\\.js)?['"]`).test(importsText);
}

for (const file of ALL_PREVIEW_FILES) {
  test(`${file}: does not import a raw dashboard action module (staff-actions/schedule-actions/attendance-actions under lib/workforce)`, () => {
    const imports = importLines(read(file));
    for (const moduleName of DASHBOARD_MUTATION_ACTION_MODULES) {
      assert.ok(
        !importsDashboardActionModule(imports, moduleName),
        `${file} must not import the dashboard action module @/lib/workforce/${moduleName}`,
      );
    }
  });

  test(`${file}: does not import the LINE bind/unbind mutation actions (a read-only import of listEmployeeLineLinks from the same module is fine and unchanged from B1)`, () => {
    const imports = importLines(read(file));
    assert.ok(!/\bbindEmployeeLineUser\b/.test(imports), `${file} must not import bindEmployeeLineUser`);
    assert.ok(!/\bunbindEmployeeLineUser\b/.test(imports), `${file} must not import unbindEmployeeLineUser`);
  });

  test(`${file}: does not import a known dashboard mutation-form component`, () => {
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
        `${file} must not import ${componentName} - preview must render only action-free display components or preview-specific islands`,
      );
    }
  });
}

for (const file of ACTION_FREE_PREVIEW_FILES) {
  test(`${file}: registers no preview Server Action (does not import from lib/preview/actions/*)`, () => {
    const imports = importLines(read(file));
    assert.ok(!/['"]\.*\/?(?:\.\.\/)*(?:lib\/)?preview\/actions\//.test(imports), `${file} must not import from a preview/actions module`);
  });

  test(`${file}: contains no <form action= binding`, () => {
    const source = read(file);
    assert.ok(!/<form\s[^>]*\baction\s*=/.test(source), `${file} must not contain a <form action=...> binding`);
  });

  test(`${file}: does not reference any B2a manager or B2b staff preview action`, () => {
    const source = read(file);
    for (const exportName of [...B2A_MANAGER_ACTION_EXPORTS, ...B2B_STAFF_ACTION_EXPORTS]) {
      assert.ok(!source.includes(exportName), `${file} must not reference the preview action ${exportName}`);
    }
  });
}

for (const file of MANAGER_PREVIEW_FILES) {
  test(`${file}: imports only the exact allowlisted B2a manager preview actions, never any other name from lib/preview/actions/*`, () => {
    const imports = importLines(read(file));
    const actionImportLines = imports
      .split('\n')
      .filter((line) => /['"][^'"]*\/preview\/actions\/[^'"]+['"]/.test(line));

    for (const line of actionImportLines) {
      const braceMatch = line.match(/\{([^}]*)\}/);
      assert.ok(braceMatch, `${file}: expected a named import from a preview/actions module, got: ${line}`);
      const namesText: string = braceMatch?.[1] ?? '';
      const names = namesText
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      for (const name of names) {
        assert.ok(
          B2A_MANAGER_ACTION_EXPORTS.includes(name),
          `${file} imports "${name}" from a preview/actions module, which is not an allowlisted manager action`,
        );
      }
    }
  });

  test(`${file}: does not reference any B2b staff preview action`, () => {
    const source = read(file);
    for (const exportName of B2B_STAFF_ACTION_EXPORTS) {
      assert.ok(!source.includes(exportName), `${file} must not reference the B2b staff action ${exportName} - manager and staff preview actions are never interchangeable`);
    }
  });
}

for (const file of STAFF_PREVIEW_FILES) {
  test(`${file}: imports only the exact allowlisted B2b staff preview actions, never any other name from lib/preview/actions/*`, () => {
    const imports = importLines(read(file));
    const actionImportLines = imports
      .split('\n')
      .filter((line) => /['"][^'"]*\/preview\/actions\/[^'"]+['"]/.test(line));

    for (const line of actionImportLines) {
      const braceMatch = line.match(/\{([^}]*)\}/);
      assert.ok(braceMatch, `${file}: expected a named import from a preview/actions module, got: ${line}`);
      const namesText: string = braceMatch?.[1] ?? '';
      const names = namesText
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      for (const name of names) {
        assert.ok(
          B2B_STAFF_ACTION_EXPORTS.includes(name),
          `${file} imports "${name}" from a preview/actions module, which is not one of the three allowlisted B2b staff actions`,
        );
      }
    }
  });

  test(`${file}: does not reference any B2a manager preview action`, () => {
    const source = read(file);
    for (const exportName of B2A_MANAGER_ACTION_EXPORTS) {
      assert.ok(!source.includes(exportName), `${file} must not reference the B2a manager action ${exportName} - manager and staff preview actions are never interchangeable`);
    }
  });
}

test('the exact B2b staff actions are each imported by at least one staff preview file (the allowlist above is not vacuously satisfied by importing none of them)', () => {
  const combinedSource = STAFF_PREVIEW_FILES.map((file) => read(file)).join('\n');
  for (const exportName of B2B_STAFF_ACTION_EXPORTS) {
    assert.ok(combinedSource.includes(exportName), `expected some staff preview file to import ${exportName}`);
  }
});

test('the exact manager actions are each imported by at least one manager preview file (the allowlist above is not vacuously satisfied by importing none of them)', () => {
  const combinedSource = MANAGER_PREVIEW_FILES.map((file) => read(file)).join('\n');
  for (const exportName of B2A_MANAGER_ACTION_EXPORTS) {
    assert.ok(combinedSource.includes(exportName), `expected some manager preview file to import ${exportName}`);
  }
});

test('manager preview page authorizes manager access before any tenant-wide Workforce read', () => {
  const source = read('../../app/%5Fclient-preview/mame-to-cha/manager/page.tsx');
  const authorizationIndex = source.indexOf('authorizePreviewManagerPage()');
  assert.ok(authorizationIndex >= 0, 'manager page must require the manager permission before rendering');

  for (const managerRead of [
    'listWorkforceStaffForManager(',
    'listShiftRequestsForManager(',
    'listAttendanceForManager(',
  ]) {
    const readIndex = source.indexOf(managerRead, authorizationIndex);
    assert.ok(readIndex > authorizationIndex, `${managerRead} must run only after manager authorization`);
  }
});

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

test('the manager client islands are all "use client" components', () => {
  for (const file of MANAGER_ISLAND_FILES) {
    const source = read(file);
    assert.ok(/^\s*['"]use client['"]/m.test(source), `${file} must be a 'use client' component`);
  }
});

test('the B2b staff client islands are all "use client" components', () => {
  for (const file of STAFF_ISLAND_FILES) {
    const source = read(file);
    assert.ok(/^\s*['"]use client['"]/m.test(source), `${file} must be a 'use client' component`);
  }
});

test('no B2a manager preview island exposes a tenant/tenantSlug/module-enabled authority field', () => {
  const forbiddenLiterals = ['tenantId', 'tenantSlug', 'moduleEnabled'];
  for (const file of MANAGER_ISLAND_FILES) {
    const source = read(file);
    for (const literal of forbiddenLiterals) {
      assert.ok(!source.includes(literal), `${file} must not reference "${literal}" - tenant/module authority is always server-resolved`);
    }
  }
});

test('no B2a manager preview island exposes a permission-key-shaped or locationId-as-authority field', () => {
  for (const file of MANAGER_ISLAND_FILES) {
    const source = read(file);
    assert.ok(!/workforce\.[a-z]+\.[a-z]+/.test(source), `${file} must not reference a permission-key-shaped literal`);
    assert.ok(!/\blocationId\b/.test(source), `${file} must not reference "locationId" - the active location is always server-resolved, never a form field`);
  }
});

/** Every identity/authority field forbidden in a B2b staff preview form (B2b plan Section 3). */
const B2B_FORBIDDEN_STAFF_FORM_LITERALS = [
  'tenantId',
  'tenantSlug',
  'locationId',
  'employeeId',
  'staffId',
  'userId',
  'moduleEnabled',
];

test('no B2b staff preview island exposes a tenant/location/employee/staff/user/module authority field', () => {
  for (const file of STAFF_ISLAND_FILES) {
    const source = read(file);
    for (const literal of B2B_FORBIDDEN_STAFF_FORM_LITERALS) {
      assert.ok(!source.includes(literal), `${file} must not reference "${literal}" - identity/location authority is always server-resolved from the authenticated employee binding`);
    }
  }
});

test('no B2b staff preview island exposes a permission-key-shaped or role-name-as-authority field, and no name="role"/name="permission" form field', () => {
  for (const file of STAFF_ISLAND_FILES) {
    const source = read(file);
    assert.ok(!/workforce\.[a-z]+\.[a-z]+/.test(source), `${file} must not reference a permission-key-shaped literal`);
    assert.ok(!/name=["']role["']/.test(source), `${file} must not submit a "role" form field`);
    assert.ok(!/name=["']permission["']/.test(source), `${file} must not submit a "permission" form field`);
  }
});

test('no B2b staff preview island adds a hidden identity/authority input field', () => {
  for (const file of STAFF_ISLAND_FILES) {
    const source = read(file);
    assert.ok(!/<input[^>]*type=["']hidden["']/.test(source), `${file} must not contain any <input type="hidden"> field`);
  }
});
