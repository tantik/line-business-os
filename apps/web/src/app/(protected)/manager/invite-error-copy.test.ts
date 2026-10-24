import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inviteErrorCopyKey } from './invite-error-copy.js';
import { tManagerDashboard } from './manager-dashboard-i18n.js';

test('inviteErrorCopyKey maps each invite result to a fixed dictionary key', () => {
  assert.equal(inviteErrorCopyKey({ status: 'not_found' }), 'inviteErrorNotFound');
  assert.equal(inviteErrorCopyKey({ status: 'duplicate' }), 'inviteErrorDuplicate');
  assert.equal(inviteErrorCopyKey({ status: 'duplicate', code: 'user_has_other_employee_record' }), 'inviteErrorUserHasOtherEmployeeRecord');
  assert.equal(inviteErrorCopyKey({ status: 'unauthorized' }), 'errorUnauthorizedAction');
  assert.equal(inviteErrorCopyKey({ status: 'unexpected_error' }), 'inviteErrorGeneric');
  assert.equal(inviteErrorCopyKey({ status: 'unexpected_error', code: 'user_has_other_employee_record' }), 'inviteErrorGeneric', 'the code only matters on a duplicate');
});

test('the rehire copy (0140, DEBT-123 c) is the agreed JA / EN text', () => {
  assert.equal(
    tManagerDashboard('ja', 'inviteErrorUserHasOtherEmployeeRecord'),
    'このメールアドレスは、以前のスタッフ登録（無効を含む）にすでに使われています。スタッフ一覧で以前の登録を「有効にする」で戻してください。',
  );
  assert.equal(
    tManagerDashboard('en', 'inviteErrorUserHasOtherEmployeeRecord'),
    'This email is already linked to an earlier staff record (possibly inactive). Reactivate that record in the staff list instead.',
  );
});
