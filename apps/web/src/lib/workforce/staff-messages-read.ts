import type { StaffMessageSenderRole, WorkforceStaffMessage } from './staff-messages';

/**
 * Which messages an OPEN mail thread should mark read right now (QA4 F6):
 * every unread, non-deleted message authored by the other side
 * (`incomingRole`) -- optionally scoped to one employee's thread -- that has
 * not already been sent to the mark-read action. Called on open and again
 * whenever new message props arrive (Realtime refresh), so a reply that lands
 * while the thread is open is marked read too. `alreadyMarked` is what keeps
 * the refresh that follows a mark (or the caller's own reply) from looping:
 * an id is returned at most once. Pure; the caller records the returned ids.
 */
export function messageIdsToMarkRead(
  messages: readonly WorkforceStaffMessage[] | null | undefined,
  options: { incomingRole: StaffMessageSenderRole; employeeId?: string; alreadyMarked: ReadonlySet<string> },
): string[] {
  const ids: string[] = [];
  for (const m of messages ?? []) {
    if (m.senderRole !== options.incomingRole) continue;
    if (options.employeeId !== undefined && m.employeeId !== options.employeeId) continue;
    if (m.isRead || m.deletedAt) continue;
    if (options.alreadyMarked.has(m.messageId)) continue;
    ids.push(m.messageId);
  }
  return ids;
}
