#!/usr/bin/env node
/**
 * Phase 1N-4C Slice B1 - post-build verification that the Mame To Cha
 * preview routes are genuinely action-free at the network level, not just
 * hidden in the rendered UI.
 *
 * Background: Next.js Server Actions are compiled into a per-route "worker"
 * entry in `.next/server/server-reference-manifest.json` for every action
 * reachable from that route's module graph - regardless of whether a
 * client-side runtime condition (e.g. a `readOnly` prop) ever actually
 * invokes it. A prior implementation hid mutation controls in the preview UI
 * via a `readOnly` prop while still statically importing the dashboard
 * client components (which import the Workforce mutation Server Actions);
 * `next build` still registered all of those actions as callable workers for
 * the preview routes, meaning a direct `Next-Action` POST to a preview route
 * could invoke a cookie-based Workforce write. This script fails the build
 * pipeline if that regression reappears.
 *
 * Run this AFTER `next build` (it reads `.next/server/server-reference-manifest.json`,
 * which does not exist before a build) - see the `verify:preview-no-actions`
 * package script, which does not depend on unit tests running against `.next`.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const APPS_WEB_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = path.join(APPS_WEB_DIR, '.next', 'server', 'server-reference-manifest.json');

/**
 * Any worker route key starting with this prefix (or exactly equal to the
 * bare prefix) is a Mame To Cha preview route. The literal `%5Fclient-preview`
 * matches the on-disk folder name (`%5F` is Next.js's private-folder escape
 * for a leading underscore) as it appears in the manifest's route keys.
 */
const PREVIEW_ROUTE_PREFIX = 'app/%5Fclient-preview/mame-to-cha';

/**
 * Positive control: these dashboard routes MUST still show at least one
 * Workforce mutation Server Action worker after this script's preview check
 * passes - otherwise the preview check could pass vacuously because a
 * regression deleted the actions everywhere, not because the preview
 * boundary was fixed correctly.
 */
const DASHBOARD_MUTATION_ROUTES = [
  'app/(protected)/dashboard/workforce/manager/page',
  'app/(protected)/dashboard/workforce/staff/page',
];

/** Filenames (suffix-matched) of the three Workforce mutation Server Action modules. */
const MUTATION_ACTION_FILE_SUFFIXES = [
  'lib/workforce/staff-actions.ts',
  'lib/workforce/schedule-actions.ts',
  'lib/workforce/attendance-actions.ts',
];

function isPreviewRoute(routeKey) {
  return routeKey === PREVIEW_ROUTE_PREFIX || routeKey.startsWith(`${PREVIEW_ROUTE_PREFIX}/`);
}

function isMutationActionFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return MUTATION_ACTION_FILE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      `verify-preview-no-server-actions: manifest not found at ${MANIFEST_PATH}.\n` +
        'Run `pnpm --filter @line-os/web build` first, then re-run this script.',
    );
    process.exit(2);
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function collectActionEntries(manifest) {
  // Both `node` and `edge` runtimes register actions the same way; this repo
  // only uses the `node` runtime for Workforce actions, but check both so a
  // future edge-runtime action can never slip past this guard unnoticed.
  const entries = [];
  for (const runtime of ['node', 'edge']) {
    const table = manifest[runtime] ?? {};
    for (const [actionId, info] of Object.entries(table)) {
      entries.push({ runtime, actionId, ...info });
    }
  }
  return entries;
}

function main() {
  const manifest = loadManifest();
  const entries = collectActionEntries(manifest);

  const previewViolations = [];
  for (const entry of entries) {
    const workerRoutes = Object.keys(entry.workers ?? {});
    for (const routeKey of workerRoutes) {
      if (isPreviewRoute(routeKey)) {
        previewViolations.push({
          route: routeKey,
          exportedName: entry.exportedName,
          filename: entry.filename,
          runtime: entry.runtime,
        });
      }
    }
  }

  const dashboardCoverage = new Map(DASHBOARD_MUTATION_ROUTES.map((route) => [route, false]));
  for (const entry of entries) {
    if (!isMutationActionFile(entry.filename)) continue;
    for (const routeKey of Object.keys(entry.workers ?? {})) {
      if (dashboardCoverage.has(routeKey)) dashboardCoverage.set(routeKey, true);
    }
  }
  const missingDashboardCoverage = [...dashboardCoverage.entries()]
    .filter(([, covered]) => !covered)
    .map(([route]) => route);

  let ok = true;

  if (previewViolations.length > 0) {
    ok = false;
    console.error('FAIL: Server Action(s) registered as callable workers for a Mame To Cha preview route:');
    for (const v of previewViolations) {
      console.error(`  - ${v.exportedName} (${v.filename}) is a worker for route "${v.route}" [${v.runtime}]`);
    }
    console.error(
      '\nA preview route must never appear as a worker for any Server Action - this means a direct ' +
        'Next-Action request to that route could invoke the action regardless of what the rendered UI shows. ' +
        'Preview pages/components must import only action-free display components, never a Server Action ' +
        'or a component that imports one, directly or transitively.',
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
        'action worker, the preview check above could be passing vacuously (e.g. because the actions were ' +
        'accidentally deleted everywhere) rather than because the preview boundary is correctly enforced. ' +
        'Dashboard behavior must remain fully interactive and unchanged by this slice.',
    );
  }

  if (!ok) process.exit(1);

  console.log('OK: no Mame To Cha preview route registers any Server Action worker.');
  console.log('OK: dashboard Workforce manager/staff routes retain their expected mutation Server Action registrations.');
}

main();
