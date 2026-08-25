'use server';

import { createClient } from '@/lib/supabase/server';
import { requireTenantContext } from '@/lib/tenant/context';
import { getMyWorkforceStaffProfile } from './staff-profile';
import { getWorkforceStaffDirectoryEntryById } from './employees';
import {
  archiveStaffMessage as archiveStaffMessageWrite,
  markStaffMessageRead as markStaffMessageReadWrite,
  sendManagerMessage as sendManagerMessageWrite,
  sendStaffMessage as sendStaffMessageWrite,
  type WorkforceStaffMessage,
} from './staff-messages';
import {
  parseStaffMessageIdInput,
  parseSubmitManagerMessageInput,
  parseSubmitStaffMessageInput,
} from './staff-messages-input';
import type { WorkforceWriteResult } from './result-types';
import { queueLineNotification } from '@/lib/notifications/queue-line-notification';

/**
 * Server Actions for the Staff<->Manager Mail module (0090). Thin
 * controllers, same shape as `attendance-actions.ts`: `submitStaffMessage`
 * resolves the caller's own staff profile first (a clearer error than an
 * opaque RLS denial for a caller with no staff row, mirrors
 * `submitWorkReport`); `submitManagerMessage` resolves its target
 * employee's own `locationId` server-side (never accepted from the client --
 * `wf_staff_messages_manage_insert` RLS would reject a forged one anyway,
 * but resolving it here gives a clearer `not_found` instead of an opaque RLS
 * denial). `markStaffMessageReadAction`/`archiveStaffMessageAction` are
 * shared by both the Manager and Staff popups -- RLS
 * (`wf_staff_messages_self_update`/`wf_staff_messages_manage_update`)
 * decides which caller may touch a given row. No delete action: Founder
 * direction (2026-08-25) -- a message is archived, never deleted by either
 * side individually (`workforce.staff_messages.deleted_at` and its RLS
 * still exist in the schema, just with no app-layer caller today -- a
 * future Permanent-Delete-employee privacy purge is expected to use a real
 * DELETE, not this soft-delete column, so this action wasn't kept "for
 * later"; see `0091_workforce_permanent_delete_staff_messages.sql`'s
 * header).
 */

const INVALID_INPUT_RESULT = { status: 'unexpected_error', message: 'Invalid input.' } as const;
const NO_STAFF_PROFILE_RESULT = { status: 'unexpected_error', message: 'You have no staff profile in this tenant.' } as const;

/** Staff composes a message into their own thread. */
export async function submitStaffMessage(formData: FormData): Promise<WorkforceWriteResult<WorkforceStaffMessage>> {
  const input = parseSubmitStaffMessageInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const myProfile = await getMyWorkforceStaffProfile(supabase, tenantId);
  if (myProfile.status !== 'success') return myProfile;
  if (!myProfile.data) return NO_STAFF_PROFILE_RESULT;
  if (!myProfile.data.locationId) return { status: 'unexpected_error', message: 'Your staff profile has no assigned location.' };

  const result = await sendStaffMessageWrite(supabase, tenantId, {
    employeeId: myProfile.data.staffId,
    locationId: myProfile.data.locationId,
    body: input.body,
  });
  if (result.status === 'success') {
    // WP C2 shape (inert today): 'staff_message' new for this module, never
    // affects this write's own result either way.
    queueLineNotification({
      type: 'staff_message',
      tenantId,
      targetStaffId: null,
      payload: { messageId: result.data.messageId, senderRole: 'staff' },
    });
  }
  return result;
}

/** Manager composes/replies into a given employee's thread -- `employeeId` selects the target thread; `locationId` is always resolved server-side from that employee's own directory entry, never client-supplied. */
export async function submitManagerMessage(formData: FormData): Promise<WorkforceWriteResult<WorkforceStaffMessage>> {
  const input = parseSubmitManagerMessageInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  const tenantId = tenantContext.data.activeTenant.tenantId;

  const targetEntry = await getWorkforceStaffDirectoryEntryById(supabase, tenantId, input.employeeId);
  if (targetEntry.status !== 'success') return targetEntry;
  if (!targetEntry.data || !targetEntry.data.locationId) return { status: 'not_found' };

  const result = await sendManagerMessageWrite(supabase, tenantId, {
    employeeId: input.employeeId,
    locationId: targetEntry.data.locationId,
    body: input.body,
  });
  if (result.status === 'success') {
    queueLineNotification({
      type: 'staff_message',
      tenantId,
      targetStaffId: input.employeeId,
      payload: { messageId: result.data.messageId, senderRole: 'manager' },
    });
  }
  return result;
}

/** Shared by the Manager and Staff popups -- RLS decides whether the caller may mark this specific row read. */
export async function markStaffMessageReadAction(formData: FormData): Promise<WorkforceWriteResult<WorkforceStaffMessage>> {
  const input = parseStaffMessageIdInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return markStaffMessageReadWrite(supabase, tenantContext.data.activeTenant.tenantId, input.messageId);
}

/** Shared by the Manager and Staff popups. */
export async function archiveStaffMessageAction(formData: FormData): Promise<WorkforceWriteResult<WorkforceStaffMessage>> {
  const input = parseStaffMessageIdInput(formData);
  if (!input) return INVALID_INPUT_RESULT;

  const tenantContext = await requireTenantContext();
  if (tenantContext.status !== 'success') return tenantContext;

  const supabase = await createClient();
  return archiveStaffMessageWrite(supabase, tenantContext.data.activeTenant.tenantId, input.messageId);
}
