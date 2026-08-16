import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guards for Part C (Cafe v2.1 Mission 1): the
 * Workforce landing page (`/dashboard/workforce`) previously showed the
 * Manager nav card to every tenant member regardless of role, so a plain
 * Staff member could click into the Manager card and only be turned away
 * after a full page load. The card must now be conditioned on the same
 * `hasManagerAccess` check the Manager route itself gates on, using the
 * Manager route's own location-resolution fallback -- this is a UX
 * affordance, not a new security boundary (the Manager route's own
 * server-side gate is unaffected either way).
 */
const SOURCE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

test('WorkforceLandingPage resolves canAccessManager via hasManagerAccess before rendering', () => {
  assert.ok(
    /const canAccessManager = managerLocation\s*\n?\s*\?\s*await hasManagerAccess\(supabase, activeTenant\.tenantId, managerLocation\.locationId\)\s*\n?\s*:\s*false;/.test(
      SOURCE,
    ),
    'the landing page must compute canAccessManager from hasManagerAccess(supabase, activeTenant.tenantId, managerLocation.locationId), false when no location resolves',
  );
});

test('the Manager card is conditionally rendered on canAccessManager, not unconditionally shown', () => {
  const managerCardIndex = SOURCE.indexOf("<h2 style={{ margin: 0, fontSize: 16 }}>Manager</h2>");
  assert.ok(managerCardIndex !== -1, 'expected the Manager card markup to exist');
  const guardIndex = SOURCE.lastIndexOf('{canAccessManager ? (', managerCardIndex);
  assert.ok(guardIndex !== -1 && guardIndex < managerCardIndex, 'the Manager card must be wrapped in a canAccessManager conditional');
});

test('the Staff and Recipes cards remain unconditional (role-aware nav scoped to Manager only)', () => {
  assert.ok(/<h2 style=\{\{ margin: 0, fontSize: 16 \}\}>Staff<\/h2>/.test(SOURCE));
  assert.ok(/<h2 style=\{\{ margin: 0, fontSize: 16 \}\}>Recipes<\/h2>/.test(SOURCE));
  const staffCardIndex = SOURCE.indexOf("<h2 style={{ margin: 0, fontSize: 16 }}>Staff</h2>");
  const guardBeforeStaff = SOURCE.lastIndexOf('{canAccessManager ? (', staffCardIndex);
  const sectionBeforeStaff = SOURCE.lastIndexOf('<section style={card}>', staffCardIndex);
  assert.ok(
    guardBeforeStaff === -1 || guardBeforeStaff < sectionBeforeStaff,
    'the Staff card must not be inside the canAccessManager conditional',
  );
});
