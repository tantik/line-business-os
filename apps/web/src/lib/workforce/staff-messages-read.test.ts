import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { messageIdsToMarkRead } from './staff-messages-read.js';
import type { WorkforceStaffMessage } from './staff-messages.js';

function message(overrides: Partial<WorkforceStaffMessage>): WorkforceStaffMessage {
  return {
    messageId: 'm-1',
    tenantId: 't-1',
    locationId: 'l-1',
    employeeId: 'e-1',
    senderRole: 'staff',
    senderUserId: 'u-1',
    body: 'hi',
    isRead: false,
    readAt: null,
    readBy: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: '2026-10-20T00:00:00.000Z',
    ...overrides,
  } as WorkforceStaffMessage;
}

test('returns only unread, non-deleted incoming messages of the open thread (QA4 F6)', () => {
  const messages = [
    message({ messageId: 'in-unread' }),
    message({ messageId: 'in-read', isRead: true }),
    message({ messageId: 'in-deleted', deletedAt: '2026-10-20T01:00:00.000Z' }),
    message({ messageId: 'own-reply', senderRole: 'manager' }),
    message({ messageId: 'other-thread', employeeId: 'e-2' }),
  ];
  assert.deepEqual(messageIdsToMarkRead(messages, { incomingRole: 'staff', employeeId: 'e-1', alreadyMarked: new Set() }), ['in-unread']);
});

test('a reply that arrives live into the open thread is returned; already-sent ids never are (no loop)', () => {
  const marked = new Set<string>(['first']);
  const afterRefresh = [message({ messageId: 'first' }), message({ messageId: 'live-reply' })];
  const ids = messageIdsToMarkRead(afterRefresh, { incomingRole: 'staff', employeeId: 'e-1', alreadyMarked: marked });
  assert.deepEqual(ids, ['live-reply']);
  for (const id of ids) marked.add(id);
  // The refresh that follows the mark (row still unread in stale props) yields nothing.
  assert.deepEqual(messageIdsToMarkRead(afterRefresh, { incomingRole: 'staff', employeeId: 'e-1', alreadyMarked: marked }), []);
});

test('the Staff side (single thread) marks manager-authored messages; null messages are safe', () => {
  const messages = [message({ messageId: 'from-manager', senderRole: 'manager' }), message({ messageId: 'mine', senderRole: 'staff' })];
  assert.deepEqual(messageIdsToMarkRead(messages, { incomingRole: 'manager', alreadyMarked: new Set() }), ['from-manager']);
  assert.deepEqual(messageIdsToMarkRead(null, { incomingRole: 'manager', alreadyMarked: new Set() }), []);
});

test('both mail popups re-run the mark-read pass on new message props, not only on open (QA4 F6)', () => {
  const manager = readFileSync(new URL('../../app/(protected)/manager/staff-messages-popup.tsx', import.meta.url), 'utf8');
  assert.match(manager, /messageIdsToMarkRead\(allMessages, \{/);
  assert.match(manager, /\}, \[open, selectedEmployeeId, allMessages\]\);/);
  const staff = readFileSync(new URL('../../app/(protected)/staff/staff-mail-popup.tsx', import.meta.url), 'utf8');
  assert.match(staff, /messageIdsToMarkRead\(messages, \{ incomingRole: 'manager'/);
  assert.match(staff, /\}, \[open, messages\]\);/);
});
