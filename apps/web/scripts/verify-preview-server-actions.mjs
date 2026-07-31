#!/usr/bin/env node
/**
 * Phase 1N-4C Slice B2a/B2b - post-build, role-aware verification that every
 * Mame To Cha preview route registers only its exact allowlisted Server
 * Action workers, never anything else.
 *
 * Evolves the prior B1 zero-tolerance script
 * (`verify-preview-no-server-actions.mjs`, `verify:preview-no-actions`): B1's
 * "every preview route registers zero Server Actions" check is now a special
 * case of this script's per-route allowlist (an allowlist of length zero).
 *
 * CONFIRMED MANIFEST FACT (do not re-assume): despite the on-disk preview
 * route folder being named `%5Fclient-preview` (Next.js's private-folder
 * escape for a leading underscore), the *manifest's* route keys use the
 * plain, already-decoded `app/_client-preview/...` form - not the
 * percent-encoded `app/%5Fclient-preview/...` form the B1-era script assumed
 * and this script's first B2a draft copied unchanged. That mismatch made
 * every preview-route check in this script silently vacuous (`isPreviewRoute`
 * never matched any real entry, so the allowlist/forbidden-module checks had
 * zero entries to evaluate and printed a false "OK"). Confirmed by directly
 * inspecting `.next/server/server-reference-manifest.json` after a clean
 * `next build` - see `docs/` history for this slice's verification fix.
 * `normalizeRouteKey` below defends against either encoding appearing (this
 * repo's Next.js version emits the decoded form; a different version could
 * still emit the encoded form) rather than hardcoding only the one literal
 * this run happened to observe.
 *
 * Run this AFTER `next build` (it reads `.next/server/server-reference-manifest.json`,
 * which does not exist before a build) - see the `verify:preview-actions`
 * package script, which does not depend on unit tests running against `.next`.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const APPS_WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = path.join(APPS_WEB_DIR, '.next', 'server', 'server-reference-manifest.json');

/** Canonical (already-decoded) route-key prefixes/keys used everywhere below - `normalizeRouteKey` maps any manifest key onto this form before comparison. */
const MANAGER_ROUTE = 'app/_client-preview/mame-to-cha/manager/page';
const STAFF_ROUTE = 'app/_client-preview/mame-to-cha/page';
const LEGACY_STAFF_ROUTE = 'app/_client-preview/mame-to-cha/staff/page';
const RECIPES_ROUTE = 'app/_client-preview/mame-to-cha/recipes/page';
const RECIPE_DETAIL_ROUTE = 'app/_client-preview/mame-to-cha/recipes/[recipeId]/page';
const PREVIEW_ROUTE_PREFIX = 'app/_client-preview/mame-to-cha';

/**
 * Closed allowlists, per preview route (canonical/decoded route-key form).
 * Any worker `exportedName` registered for a preview route that is not in
 * that route's own list below is a failure - these are exact subsets, not
 * "at least these" (B2 plan Section 5).
 */
const PREVIEW_ROUTE_ALLOWLISTS = new Map([
  [
    MANAGER_ROUTE,
    new Set([
      'previewUpsertEmployee',
      'previewSetEmployeeActive',
      'previewCreateShiftAssignment',
      'previewUpdateShiftAssignment',
      'previewRunAutoDistribution',
      'previewPublishSchedule',
      'previewDecideCorrectionRequest',
      'previewSetRecipeContentKind',
      'previewSaveScheduleSettings',
      'previewUpsertShiftType',
      'previewSetShiftTypeActive',
      'previewUpsertInventoryItem',
      'previewSetInventoryItemActive',
      'previewDecideShiftExchange',
      'previewSignOut',
    ]),
  ],
  [
    STAFF_ROUTE,
    new Set([
      'previewSubmitShiftPreference',
      'previewSubmitWorkReport',
        'previewClockIn',
        'previewClockOut',
        'previewResetTodayClock',
      'previewSubmitCorrectionRequest',
      'previewSubmitInventoryStockCount',
      'previewRequestShiftExchange',
      'previewAcceptShiftExchange',
      'previewCancelShiftExchange',
      'previewStartInventorySession',
      'previewRecordInventorySessionItem',
      'previewCompleteInventorySession',
      'previewSignOut',
    ]),
  ],
  [LEGACY_STAFF_ROUTE, new Set()],
  [RECIPES_ROUTE, new Set()],
  [RECIPE_DETAIL_ROUTE, new Set()],
]);

/**
 * Positive control: these dashboard routes MUST still show at least one
 * Workforce mutation Server Action worker after this script's preview checks
 * pass - otherwise a preview check could pass vacuously because a regression
 * deleted the actions everywhere, not because the preview boundary is
 * correctly enforced. Confirmed against the actual manifest: dashboard route
 * keys use the literal `(protected)` route-group segment unencoded (no
 * percent-escaping applies to parentheses), so no normalization is needed
 * for these two keys specifically - `normalizeRouteKey` is still applied
 * uniformly below for consistency, but is a no-op here.
 */
const DASHBOARD_MUTATION_ROUTES = ['app/(protected)/dashboard/workforce/manager/page', 'app/(protected)/dashboard/workforce/staff/page'];

/** Filenames (suffix-matched) of dashboard-only action modules. Never a valid worker for any preview route, regardless of that route's allowlist. */
const FORBIDDEN_PREVIEW_ACTION_FILE_SUFFIXES = [
  'lib/workforce/staff-actions.ts',
  'lib/workforce/schedule-actions.ts',
  'lib/workforce/attendance-actions.ts',
  'lib/workforce/employee-line-links.ts',
];

/** Filenames (suffix-matched) of the three Workforce dashboard mutation Server Action modules (positive control only). */
const MUTATION_ACTION_FILE_SUFFIXES = ['lib/workforce/staff-actions.ts', 'lib/workforce/schedule-actions.ts', 'lib/workforce/attendance-actions.ts'];

/**
 * Maps a manifest route key onto its canonical, already-decoded form.
 * `%5f`/`%5F` (Next.js's private-folder percent-escape for a leading
 * underscore) is folded to `_` - handles either encoding a given Next.js
 * version might emit, rather than assuming only the one this repo's current
 * build happens to produce.
 */
export function normalizeRouteKey(routeKey) {
  return routeKey.replace(/%5f/gi, '_');
}

export function isPreviewRoute(routeKey) {
  const normalized = normalizeRouteKey(routeKey);
  return normalized === PREVIEW_ROUTE_PREFIX || normalized.startsWith(`${PREVIEW_ROUTE_PREFIX}/`);
}

/** Normalizes Windows backslashes to POSIX slashes before a suffix match - manifest filenames on Windows builds are backslash-separated. */
export function matchesAnySuffix(filename, suffixes) {
  const normalized = filename.replaceAll('\\', '/');
  return suffixes.some((suffix) => normalized.endsWith(suffix));
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      `verify-preview-server-actions: manifest not found at ${MANIFEST_PATH}.\n` +
        'Run `pnpm --filter @line-os/web build` first, then re-run this script.',
    );
    process.exit(2);
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

/**
 * Flattens the manifest's `{ node: {...}, edge: {...} }` shape into a flat
 * list of `{ runtime, actionId, exportedName, filename, workers }` entries.
 * Fails closed (throws) on a manifest shape this script does not recognize,
 * rather than silently treating an unexpected structure as "zero entries,
 * therefore OK".
 */
export function collectActionEntries(manifest) {
  if (typeof manifest !== 'object' || manifest === null) {
    throw new Error('verify-preview-server-actions: manifest root is not an object - unknown schema, failing closed.');
  }
  const entries = [];
  // Both `node` and `edge` runtimes register actions the same way; this repo
  // only uses the `node` runtime for Workforce actions, but check both so a
  // future edge-runtime action can never slip past this guard unnoticed.
  for (const runtime of ['node', 'edge']) {
    const table = manifest[runtime];
    if (table === undefined) continue;
    if (typeof table !== 'object' || table === null) {
      throw new Error(`verify-preview-server-actions: manifest.${runtime} is present but not an object - unknown schema, failing closed.`);
    }
    for (const [actionId, info] of Object.entries(table)) {
      if (typeof info !== 'object' || info === null || typeof info.exportedName !== 'string' || typeof info.filename !== 'string') {
        throw new Error(
          `verify-preview-server-actions: manifest.${runtime}["${actionId}"] is missing exportedName/filename - unknown schema, failing closed.`,
        );
      }
      entries.push({ runtime, actionId, exportedName: info.exportedName, filename: info.filename, workers: info.workers ?? {} });
    }
  }
  return entries;
}

/**
 * Pure evaluation of a flat entry list against the allowlists/forbidden-file
 * rules/positive control. Extracted from `main()` so it is unit-testable
 * against synthetic fixtures without touching the real `.next` folder.
 */
export function evaluateManifestEntries(entries) {
  const forbiddenModuleViolations = [];
  const allowlistViolations = [];
  const unknownRouteViolations = [];

  for (const entry of entries) {
    const workerRoutes = Object.keys(entry.workers ?? {});
    for (const routeKey of workerRoutes) {
      if (!isPreviewRoute(routeKey)) continue;

      if (matchesAnySuffix(entry.filename, FORBIDDEN_PREVIEW_ACTION_FILE_SUFFIXES)) {
        forbiddenModuleViolations.push({ route: routeKey, exportedName: entry.exportedName, filename: entry.filename, runtime: entry.runtime });
        continue;
      }

      const allowlist = PREVIEW_ROUTE_ALLOWLISTS.get(normalizeRouteKey(routeKey));
      if (!allowlist) {
        // A preview route this script does not recognize at all - fail
        // closed rather than silently allowing an unreviewed new route.
        unknownRouteViolations.push({ route: routeKey, exportedName: entry.exportedName, filename: entry.filename, runtime: entry.runtime });
        continue;
      }

      if (!allowlist.has(entry.exportedName)) {
        allowlistViolations.push({ route: routeKey, exportedName: entry.exportedName, filename: entry.filename, runtime: entry.runtime });
      }
    }
  }

  const dashboardCoverage = new Map(DASHBOARD_MUTATION_ROUTES.map((route) => [route, false]));
  for (const entry of entries) {
    if (!matchesAnySuffix(entry.filename, MUTATION_ACTION_FILE_SUFFIXES)) continue;
    for (const routeKey of Object.keys(entry.workers ?? {})) {
      const normalized = normalizeRouteKey(routeKey);
      if (dashboardCoverage.has(normalized)) dashboardCoverage.set(normalized, true);
    }
  }
  const missingDashboardCoverage = [...dashboardCoverage.entries()].filter(([, covered]) => !covered).map(([route]) => route);

  return { forbiddenModuleViolations, allowlistViolations, unknownRouteViolations, missingDashboardCoverage };
}

function main() {
  const manifest = loadManifest();
  const entries = collectActionEntries(manifest);
  const { forbiddenModuleViolations, allowlistViolations, unknownRouteViolations, missingDashboardCoverage } = evaluateManifestEntries(entries);

  let ok = true;

  if (forbiddenModuleViolations.length > 0) {
    ok = false;
    console.error('FAIL: a dashboard/LINE action module is registered as a worker for a Mame To Cha preview route:');
    for (const v of forbiddenModuleViolations) {
      console.error(`  - ${v.exportedName} (${v.filename}) is a worker for route "${v.route}" [${v.runtime}]`);
    }
  }

  if (unknownRouteViolations.length > 0) {
    ok = false;
    console.error('\nFAIL: Server Action worker registered for an unrecognized Mame To Cha preview route:');
    for (const v of unknownRouteViolations) {
      console.error(`  - ${v.exportedName} (${v.filename}) is a worker for route "${v.route}" [${v.runtime}]`);
    }
    console.error('\nEvery preview route must have an explicit, reviewed allowlist entry in this script.');
  }

  if (allowlistViolations.length > 0) {
    ok = false;
    console.error('\nFAIL: Server Action worker registered for a Mame To Cha preview route outside its exact allowlist:');
    for (const v of allowlistViolations) {
      console.error(`  - ${v.exportedName} (${v.filename}) is a worker for route "${v.route}" [${v.runtime}]`);
    }
    console.error(
      '\nEach preview route may register only its exact, reviewed set of preview-specific Server Action wrappers ' +
        '(e.g. the seven `previewXxx` manager actions for the manager route) - never a dashboard action, never an ' +
        'unlisted or newly-added action name.',
    );
  }

  if (missingDashboardCoverage.length > 0) {
    ok = false;
    console.error('\nFAIL: expected dashboard route(s) missing their Workforce mutation Server Action registration:');
    for (const route of missingDashboardCoverage) {
      console.error(`  - ${route}`);
    }
    console.error(
      '\nThis is the positive control: if the dashboard routes no longer show any Workforce mutation ' +
        'action worker, the preview checks above could be passing vacuously (e.g. because the actions were ' +
        'accidentally deleted everywhere, or because this script itself stopped recognizing the real route-key ' +
        'format) rather than because the preview boundary is correctly enforced. Dashboard behavior must remain ' +
        'fully interactive and unchanged by this slice.',
    );
  }

  if (!ok) process.exit(1);

  console.log('OK: every Mame To Cha preview route registers only its exact allowlisted Server Action workers.');
  console.log('OK: no dashboard/LINE action module is a worker for any Mame To Cha preview route.');
  console.log('OK: dashboard Workforce manager/staff routes retain their expected mutation Server Action registrations.');
}

const isMainModule = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) main();
