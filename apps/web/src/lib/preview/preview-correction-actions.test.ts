import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Source-text regression guard for the correction-request approve/reject
 * confirmation step (FA-03, FR-02, FR-03) -- same convention as
 * `attendance-actions.test.ts`, needed because this repo's test runner
 * (`node --test`) has no DOM/React-rendering environment to exercise the
 * component directly.
 */
const SOURCE = readFileSync(new URL('./preview-correction-actions.tsx', import.meta.url), 'utf8');

test('routes Approve/Reject through the shared ConfirmDialog instead of deciding immediately on click', () => {
  assert.ok(SOURCE.includes("import { ConfirmDialog } from '@/components/demo/cafe/ConfirmDialog';"));
  assert.ok(/onClick=\{\(\) => setConfirming\(\{ request: r, decision: 'approved' \}\)\}/.test(SOURCE));
  assert.ok(/onClick=\{\(\) => setConfirming\(\{ request: r, decision: 'rejected' \}\)\}/.test(SOURCE));
});

test('the confirmation dialog body shows employee, date, requested clock in/out, and reason (FR-02)', () => {
  assert.ok(/staffById\.get\(confirming\.request\.employeeId\)/.test(SOURCE), 'must show the employee');
  assert.ok(/confirming\.request\.workDate/.test(SOURCE), 'must show the date');
  assert.ok(/confirming\.request\.details\.clockInLocal/.test(SOURCE), 'must show the requested clock in');
  assert.ok(/confirming\.request\.details\.clockOutLocal/.test(SOURCE), 'must show the requested clock out');
  assert.ok(/confirming\.request\.details\.message/.test(SOURCE), 'must show the reason');
});

test('the decision (approve vs reject) is only actually applied from the confirm step, not the trigger click', () => {
  const triggerSectionEnd = SOURCE.indexOf('<ConfirmDialog');
  const triggerSection = SOURCE.slice(0, triggerSectionEnd);
  assert.ok(!/handleDecide\(r\.requestId/.test(triggerSection), 'the row buttons must open confirmation, never call handleDecide directly');
  assert.ok(/onConfirm=\{\(\) => \{\s*if \(confirming\) handleDecide\(confirming\.request\.requestId, confirming\.decision\);/.test(SOURCE));
});

test('the dialog is only dismissed on a successful decision - a failed mutation keeps it open with the error shown', () => {
  const body = SOURCE.slice(SOURCE.indexOf('function handleDecide'), SOURCE.indexOf('const staffById'));
  const beforeTransition = body.slice(0, body.indexOf('startTransition'));
  assert.ok(!/setConfirming\(null\)/.test(beforeTransition), 'handleDecide must not close the dialog before the mutation result is known');
  assert.ok(/if \(result\.status === 'success'\) \{\s*setConfirming\(null\);/.test(body));
  assert.ok(/\{feedback && !feedback\.ok \? \(/.test(SOURCE), 'a failed decision must surface the error inside the still-open dialog');
});

test('buttons are disabled while a decision is in flight, preventing a duplicate submission', () => {
  assert.ok(/pending=\{isPending\}/.test(SOURCE));
});
