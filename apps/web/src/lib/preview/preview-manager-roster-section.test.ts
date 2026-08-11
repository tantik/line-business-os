import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Founder QA F02/F03/F11 regression - `PreviewManagerViewChrome` (the
 * schedule grid) used to receive `staff`/`shiftTypes` as plain props, seeded
 * once from the page's initial server-rendered load, while
 * `PreviewStaffRecipeManagement` ("Manage Staff") and `PreviewSettingsCard`
 * ("Shift Types") each owned an independent local copy patched only by their
 * own scoped refetch after a mutation. A staff/shift-type create/edit/
 * deactivate never reached the schedule grid until a full page reload.
 *
 * `PreviewManagerRosterSection` fixes this by owning the one shared,
 * live copy and threading `onStaffChanged`/`onShiftTypesChanged` into the
 * mutating dialog wrappers. These are source-text guards (no
 * component-rendering harness in this repo, same convention as
 * `preview-settings-card.test.ts`) proving the wiring is actually in place.
 */
function read(relativeToThisFile: string): string {
  return readFileSync(new URL(relativeToThisFile, import.meta.url), 'utf8');
}

const ROSTER_SECTION = read('./preview-manager-roster-section.tsx');
const STAFF_RECIPE_MANAGEMENT = read('./preview-staff-recipe-management.tsx');
const SETTINGS_CARD = read('./preview-settings-card.tsx');

test('PreviewManagerRosterSection owns one shared staff/shiftTypes state, not per-child copies', () => {
  assert.match(ROSTER_SECTION, /const \[staff, setStaff\] = useState\(initialStaff\)/);
  assert.match(ROSTER_SECTION, /const \[shiftTypes, setShiftTypes\] = useState\(initialShiftTypes\)/);
});

test('PreviewManagerRosterSection feeds the live staff/shiftTypes into the schedule chrome, not the raw initial props', () => {
  const body = ROSTER_SECTION.slice(ROSTER_SECTION.indexOf('<PreviewManagerViewChrome'), ROSTER_SECTION.indexOf('<PreviewStaffRecipeManagement'));
  assert.match(body, /staff=\{activeStaff\}/);
  assert.match(body, /shiftTypes=\{shiftTypes\}/);
});

test('PreviewManagerRosterSection wires its own setters into the Manage Staff and Shift Types dialog wrappers', () => {
  assert.match(ROSTER_SECTION, /onStaffChanged=\{setStaff\}/);
  assert.match(ROSTER_SECTION, /onShiftTypesChanged=\{setShiftTypes\}/);
});

test('PreviewManagerRosterSection never calls router.refresh() to sync state (a client-side state lift only)', () => {
  assert.ok(!/\brouter\.refresh\(\)/.test(ROSTER_SECTION.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'must not fall back to a full page refresh to sync state');
});

test('PreviewManagerRosterSection filters deactivated staff out of the schedule roster (a removed employee must never appear as a schedulable row)', () => {
  assert.match(ROSTER_SECTION, /const activeStaff = staff === null \? null : staff\.filter\(\(entry\) => entry\.isActive\)/);
});

test('production incident regression: PreviewManagerRosterSectionProps has no function-typed prop - a Server Component (the manager page) cannot pass a plain closure across the Server->Client boundary (only JSX/data or a `\'use server\'` action may cross it), and this crashed Preview in production once already ("Uncaught Error: An error occurred in the Server Components render")', () => {
  const propsBlock = ROSTER_SECTION.slice(
    ROSTER_SECTION.indexOf('export interface PreviewManagerRosterSectionProps'),
    ROSTER_SECTION.indexOf('export function PreviewManagerRosterSection'),
  );
  // Every prop must be data or ReactNode, never `(...) => ReactNode` / `(...) => void` etc.
  assert.ok(!/:\s*\([^)]*\)\s*=>/.test(propsBlock), `no prop on PreviewManagerRosterSectionProps may be typed as a function - found a function-typed prop in:\n${propsBlock}`);
});

test('PreviewManagerRosterSection renders PreviewShiftExchangeManagerPanel itself from plain data (exchangePanelData), not from a JSX-returning function prop passed in by the server page', () => {
  assert.match(ROSTER_SECTION, /import \{ PreviewShiftExchangeManagerPanel \} from '\.\/preview-shift-exchange-manager-panel'/);
  assert.match(ROSTER_SECTION, /exchangePanelData:\s*\{/);
  assert.match(ROSTER_SECTION, /<PreviewShiftExchangeManagerPanel/);
});

test('PreviewStaffRecipeManagement propagates a successful staff mutation to its optional onStaffChanged callback (not just its own local state)', () => {
  assert.match(STAFF_RECIPE_MANAGEMENT, /onStaffChangedProp\?\.\(next\)/);
});

test('PreviewSettingsCard propagates a successful shift-type refetch to its optional onShiftTypesChanged callback (not just its own local state)', () => {
  const body = SETTINGS_CARD.slice(SETTINGS_CARD.indexOf('async function refreshShiftTypes'), SETTINGS_CARD.indexOf('function saveShiftType'));
  assert.match(body, /setShiftTypes\(result\.data\)/);
  assert.match(body, /onShiftTypesChanged\?\.\(result\.data\)/);
});
