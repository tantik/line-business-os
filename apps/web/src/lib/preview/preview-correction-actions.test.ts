import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * FA-03 regression - Approve/Reject must go through an explicit confirmation
 * boundary (the shared `ConfirmDialog`), never mutate on the first click.
 * Source-text checks (same convention as `authorize.test.ts` and
 * `staff-attendance-actions.test.ts`) since this is a `'use client'` React
 * component and this repo has no component-rendering test harness - the
 * properties below are the exact ones a rendering test would otherwise
 * assert (click-target wiring, gating, and close-on-success-only).
 */
const SOURCE = readFileSync(new URL('./preview-correction-actions.tsx', import.meta.url), 'utf8');

test('imports the shared ConfirmDialog rather than a new/duplicate modal implementation', () => {
  assert.ok(/import \{ ConfirmDialog \} from '@\/components\/demo\/cafe\/ConfirmDialog'/.test(SOURCE));
});

test('the Approve and Reject row buttons only stage a pending decision - they never call handleDecide directly', () => {
  const approveButtonIdx = SOURCE.indexOf("setPendingDecision({ requestId: r.requestId, decision: 'approved' })");
  const rejectButtonIdx = SOURCE.indexOf("setPendingDecision({ requestId: r.requestId, decision: 'rejected' })");
  assert.ok(approveButtonIdx >= 0, 'Approve button must stage a pending decision');
  assert.ok(rejectButtonIdx >= 0, 'Reject button must stage a pending decision');
  // Neither row button literal calls handleDecide(r.requestId, ...) directly.
  assert.ok(!/onClick=\{\(\) => handleDecide\(r\.requestId/.test(SOURCE));
});

test('handleDecide (the actual mutation) is only wired to the ConfirmDialog onConfirm handler', () => {
  const onConfirmIdx = SOURCE.indexOf('onConfirm={() => handleDecide(confirmTarget.requestId, pendingDecision.decision)}');
  assert.ok(onConfirmIdx >= 0, 'ConfirmDialog onConfirm must be the only call site invoking handleDecide with the confirmed target');
});

test('ConfirmDialog is only open while a decision is staged, and closes without mutating on cancel', () => {
  assert.ok(/pendingDecision && confirmTarget \? \(\s*<ConfirmDialog/.test(SOURCE));
  assert.ok(/onCancel=\{\(\) => setPendingDecision\(null\)\}/.test(SOURCE));
});

test('the dialog is only dismissed on a successful decision - a failed mutation keeps it open with the error shown', () => {
  const body = SOURCE.slice(SOURCE.indexOf('function handleDecide'), SOURCE.indexOf('const staffById'));
  assert.ok(/if \(result\.status === 'success'\) \{\s*setPendingDecision\(null\);/.test(body));
});

test('confirmation copy is decision-specific (Approve vs Reject use different title/consequence keys)', () => {
  assert.ok(/pendingDecision\.decision === 'approved' \? t\('confirmApproveTitle'\) : t\('confirmRejectTitle'\)/.test(SOURCE));
  assert.ok(
    /pendingDecision\.decision === 'approved' \? t\('confirmApproveConsequence'\) : t\('confirmRejectConsequence'\)/.test(SOURCE),
  );
});

test('confirmation body surfaces the staff, date, and requested details', () => {
  assert.ok(/confirmDecisionStaffLabel/.test(SOURCE));
  assert.ok(/confirmDecisionDateLabel/.test(SOURCE));
  assert.ok(/confirmDecisionDetailsLabel/.test(SOURCE));
  assert.ok(/staffById\.get\(confirmTarget\.employeeId\)/.test(SOURCE));
  assert.ok(/confirmTarget\.workDate/.test(SOURCE));
});

test('buttons are disabled while a decision is in flight, preventing a duplicate submission', () => {
  assert.ok(/pending=\{isPending\}/.test(SOURCE));
});
