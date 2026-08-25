import type { SupabaseClient } from '@supabase/supabase-js';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceReadError, mapWorkforceWriteError } from './pg-error';

/**
 * Staff<->Manager Mail (0090): one thread per `employeeId`, bidirectional
 * (`senderRole` staff/manager both write into the same thread). Mirrors
 * `shift-requests.ts`'s `SELECT` constant + `mapXRow()` +
 * `TenantAccessResult`/`WorkforceWriteResult` conventions -- see that file's
 * own doc comments for the shared shape this follows.
 */

/** Flat row shape returned by `api.workforce_staff_messages`. */
interface ApiWorkforceStaffMessageRow {
  message_id: string;
  tenant_id: string;
  location_id: string;
  employee_id: string;
  sender_role: string;
  sender_user_id: string;
  body: string;
  is_read: boolean;
  read_at: string | null;
  read_by: string | null;
  archived_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type StaffMessageSenderRole = 'staff' | 'manager';

export interface WorkforceStaffMessage {
  messageId: string;
  tenantId: string;
  locationId: string;
  employeeId: string;
  senderRole: StaffMessageSenderRole;
  senderUserId: string;
  body: string;
  isRead: boolean;
  readAt: string | null;
  readBy: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const MESSAGE_SELECT =
  'message_id, tenant_id, location_id, employee_id, sender_role, sender_user_id, body, is_read, read_at, read_by, archived_at, deleted_at, created_at, updated_at';

function mapMessageRow(row: ApiWorkforceStaffMessageRow): WorkforceStaffMessage {
  return {
    messageId: row.message_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    employeeId: row.employee_id,
    senderRole: row.sender_role === 'manager' ? 'manager' : 'staff',
    senderUserId: row.sender_user_id,
    body: row.body,
    isRead: row.is_read,
    readAt: row.read_at,
    readBy: row.read_by,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Read the caller's own single thread (self-scoped by RLS, `wf_staff_messages_self_select`). */
export async function listMyStaffMessages(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceStaffMessage[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_messages')
      .select(MESSAGE_SELECT)
      .eq('tenant_id', tenantId);

    if (error) return mapWorkforceReadError(error, 'read your messages');

    const rows = (data ?? []) as ApiWorkforceStaffMessageRow[];
    const messages = rows.map(mapMessageRow).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { status: 'success', data: messages };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading your messages.',
    };
  }
}

/** Manager read of every employee's thread at this tenant (RLS `wf_staff_messages_manage_select`, `workforce.attendance.manage` -- location scoping is enforced by that same RLS policy). */
export async function listStaffMessagesForManager(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceStaffMessage[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_messages')
      .select(MESSAGE_SELECT)
      .eq('tenant_id', tenantId);

    if (error) return mapWorkforceReadError(error, 'read staff messages');

    const rows = (data ?? []) as ApiWorkforceStaffMessageRow[];
    const messages = rows.map(mapMessageRow).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { status: 'success', data: messages };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading staff messages.',
    };
  }
}

export interface SendStaffMessageInput {
  employeeId: string;
  locationId: string;
  body: string;
}

/** Staff sends a message into their own thread (`senderRole: 'staff'`). INSERT-only, RLS `wf_staff_messages_self_insert` forces `sender_role`/`sender_user_id`/status columns. */
export async function sendStaffMessage(
  supabase: SupabaseClient,
  tenantId: string,
  input: SendStaffMessageInput,
): Promise<WorkforceWriteResult<WorkforceStaffMessage>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_messages')
      .insert({
        tenant_id: tenantId,
        location_id: input.locationId,
        employee_id: input.employeeId,
        sender_role: 'staff',
        body: input.body,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (error) return mapWorkforceWriteError(error, 'send this message');
    return { status: 'success', data: mapMessageRow(data as ApiWorkforceStaffMessageRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error sending this message.',
    };
  }
}

/** Manager composes/replies into a given employee's thread (`senderRole: 'manager'`). Same shape as `sendStaffMessage`, RLS `wf_staff_messages_manage_insert` forces `sender_role`/`sender_user_id`/status columns and confirms `employeeId` belongs to this tenant/location. */
export async function sendManagerMessage(
  supabase: SupabaseClient,
  tenantId: string,
  input: SendStaffMessageInput,
): Promise<WorkforceWriteResult<WorkforceStaffMessage>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_messages')
      .insert({
        tenant_id: tenantId,
        location_id: input.locationId,
        employee_id: input.employeeId,
        sender_role: 'manager',
        body: input.body,
      })
      .select(MESSAGE_SELECT)
      .single();

    if (error) return mapWorkforceWriteError(error, 'send this reply');
    return { status: 'success', data: mapMessageRow(data as ApiWorkforceStaffMessageRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error sending this reply.',
    };
  }
}

/**
 * Role-agnostic status-only writes: RLS decides whether the caller may touch
 * a given row (`wf_staff_messages_self_update` for the row's own thread
 * owner, `wf_staff_messages_manage_update` for a manager), and the
 * `guard_staff_message_update` trigger (0090) restricts every update to
 * `is_read`/`read_at`/`read_by`/`archived_at`/`deleted_at`/`updated_at` --
 * `body`/`sender_role`/`employee_id` etc. can never change. One function
 * serves both the Manager and Staff popups.
 */
async function updateStaffMessageStatus(
  supabase: SupabaseClient,
  tenantId: string,
  messageId: string,
  patch: Record<string, unknown>,
  action: string,
): Promise<WorkforceWriteResult<WorkforceStaffMessage>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_messages')
      .update(patch)
      .eq('tenant_id', tenantId)
      .eq('message_id', messageId)
      .select(MESSAGE_SELECT)
      .maybeSingle();

    if (error) return mapWorkforceWriteError(error, action);
    if (!data) return { status: 'not_found' };
    return { status: 'success', data: mapMessageRow(data as ApiWorkforceStaffMessageRow) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : `Unexpected error trying to ${action}.`,
    };
  }
}

/** `read_at`/`read_by` are server-stamped by the `stamp_staff_message_read` trigger (0090) the moment `is_read` flips to true -- never client-supplied. */
export async function markStaffMessageRead(
  supabase: SupabaseClient,
  tenantId: string,
  messageId: string,
): Promise<WorkforceWriteResult<WorkforceStaffMessage>> {
  return updateStaffMessageStatus(supabase, tenantId, messageId, { is_read: true }, 'mark this message read');
}

export async function archiveStaffMessage(
  supabase: SupabaseClient,
  tenantId: string,
  messageId: string,
): Promise<WorkforceWriteResult<WorkforceStaffMessage>> {
  return updateStaffMessageStatus(supabase, tenantId, messageId, { archived_at: new Date().toISOString() }, 'archive this message');
}
