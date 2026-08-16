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
 *
 * The `canAccessManager` computation lives in `page.tsx` (server-side,
 * unchanged by the IA/visual reconciliation that split rendering into
 * `workforce-landing-client.tsx`); the conditional rendering of the Manager
 * card lives in the client component, since only it renders JSX.
 */
const PAGE_SOURCE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const CLIENT_SOURCE = readFileSync(new URL('./workforce-landing-client.tsx', import.meta.url), 'utf8');

test('WorkforceLandingPage resolves canAccessManager via hasManagerAccess before rendering', () => {
  assert.ok(
    /const canAccessManager = managerLocation\s*\n?\s*\?\s*await hasManagerAccess\(supabase, activeTenant\.tenantId, managerLocation\.locationId\)\s*\n?\s*:\s*false;/.test(
      PAGE_SOURCE,
    ),
    'the landing page must compute canAccessManager from hasManagerAccess(supabase, activeTenant.tenantId, managerLocation.locationId), false when no location resolves',
  );
});

test('canAccessManager is passed into WorkforceLandingClient, not discarded', () => {
  assert.ok(
    /canAccessManager=\{canAccessManager\}/.test(PAGE_SOURCE),
    'the resolved canAccessManager must be forwarded as a prop to WorkforceLandingClient',
  );
});

test('the Manager card is conditionally rendered on canAccessManager, not unconditionally shown', () => {
  const managerCardIndex = CLIENT_SOURCE.indexOf("{t('managerHeading')}");
  assert.ok(managerCardIndex !== -1, 'expected the Manager card markup to exist');
  const guardIndex = CLIENT_SOURCE.lastIndexOf('{canAccessManager ? (', managerCardIndex);
  assert.ok(guardIndex !== -1 && guardIndex < managerCardIndex, 'the Manager card must be wrapped in a canAccessManager conditional');
});

test('the Staff and Recipes cards remain unconditional (role-aware nav scoped to Manager only)', () => {
  assert.ok(/\{t\('staffHeading'\)\}/.test(CLIENT_SOURCE));
  assert.ok(/\{t\('recipesHeading'\)\}/.test(CLIENT_SOURCE));
  const staffCardIndex = CLIENT_SOURCE.indexOf("{t('staffHeading')}");
  const guardBeforeStaff = CLIENT_SOURCE.lastIndexOf('{canAccessManager ? (', staffCardIndex);
  const sectionBeforeStaff = CLIENT_SOURCE.lastIndexOf('<section style={card}>', staffCardIndex);
  assert.ok(
    guardBeforeStaff === -1 || guardBeforeStaff < sectionBeforeStaff,
    'the Staff card must not be inside the canAccessManager conditional',
  );
});
