import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptPII, blindIndex, bufferToBytea } from '@line-os/db/crypto';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceReadError, mapWorkforceWriteError } from './pg-error';
import { readPiiEnv } from './pii-env';

/** Flat row shape returned by `api.workforce_employee_line_links` (0031, read-only, no PII columns). */
interface ApiWorkforceEmployeeLineLinkRow {
  link_id: string;
  tenant_id: string;
  employee_id: string;
  is_active: boolean;
  linked_at: string;
  created_at: string;
  updated_at: string;
}

export interface WorkforceEmployeeLineLink {
  linkId: string;
  tenantId: string;
  employeeId: string;
  isActive: boolean;
  linkedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Row shape returned by the `api.bind_workforce_employee_line_user` RPC (0031). Narrower than the read view -- no tenant_id/created_at/updated_at. */
interface RpcBindLineUserRow {
  link_id: string;
  employee_id: string;
  is_active: boolean;
  linked_at: string;
}

export interface WorkforceEmployeeLineLinkBinding {
  linkId: string;
  tenantId: string;
  employeeId: string;
  isActive: boolean;
  linkedAt: string;
}

const LINK_SELECT = 'link_id, tenant_id, employee_id, is_active, linked_at, created_at, updated_at';

function mapLinkRow(row: ApiWorkforceEmployeeLineLinkRow): WorkforceEmployeeLineLink {
  return {
    linkId: row.link_id,
    tenantId: row.tenant_id,
    employeeId: row.employee_id,
    isActive: row.is_active,
    linkedAt: row.linked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Read LINE binding status per employee through `api.workforce_employee_line_links`. Never returns line_user_id_encrypted/line_user_id_hash -- that column doesn't exist on this view. */
export async function listEmployeeLineLinks(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceEmployeeLineLink[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_employee_line_links')
      .select(LINK_SELECT)
      .eq('tenant_id', tenantId);

    if (error) return mapWorkforceReadError(error, 'read LINE bindings');

    const rows = (data ?? []) as ApiWorkforceEmployeeLineLinkRow[];
    const links = rows.map(mapLinkRow).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    return { status: 'success', data: links };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading LINE bindings.',
    };
  }
}

/**
 * Bind a manager-supplied raw LINE user id to an employee, via the
 * `api.bind_workforce_employee_line_user` RPC (0031). The raw id is encrypted
 * + blind-indexed here and never stored/sent in plaintext beyond this call --
 * and it is NEVER treated as authentication, only as data the manager is
 * recording. The RPC atomically deactivates any existing active binding for
 * this employee before inserting the new one. `wf_employee_line_links_manage`
 * RLS (`workforce.staff.manage`) is the real write boundary: a caller lacking
 * it gets a real RLS-violation error from the INSERT (mapped to
 * `unauthorized`), not a silently-filtered no-op.
 */
export async function bindEmployeeLineUser(
  supabase: SupabaseClient,
  tenantId: string,
  employeeId: string,
  rawLineUserId: string,
): Promise<WorkforceWriteResult<WorkforceEmployeeLineLinkBinding>> {
  const pii = readPiiEnv();
  if (!pii.ok) return { status: 'config_error', message: `Missing PII protection env: ${pii.missing.join(', ')}` };

  const encrypted = bufferToBytea(encryptPII(rawLineUserId, pii.config.encryptionKey));
  const hash = blindIndex(rawLineUserId, pii.config.hashPepper);

  try {
    const { data, error } = await supabase.schema('api').rpc('bind_workforce_employee_line_user', {
      p_tenant_id: tenantId,
      p_employee_id: employeeId,
      p_line_user_id_encrypted: encrypted,
      p_line_user_id_hash: hash,
    });

    if (error) {
      // 23503 = foreign_key_violation: employee_id doesn't exist in this tenant.
      if (error.code === '23503') return { status: 'not_found' };
      return mapWorkforceWriteError(error, 'bind this LINE user id');
    }

    const row = (Array.isArray(data) ? data[0] : data) as RpcBindLineUserRow | undefined;
    if (!row) return { status: 'not_found' };
    return {
      status: 'success',
      data: { linkId: row.link_id, tenantId, employeeId: row.employee_id, isActive: row.is_active, linkedAt: row.linked_at },
    };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error binding LINE user id.',
    };
  }
}

export interface UnbindEmployeeLineUserOutcome {
  unbound: boolean;
}

/**
 * Deactivate the active LINE binding (if any) for an employee, via the
 * `api.unbind_workforce_employee_line_user` RPC (0031). `unbound: false`
 * means nothing was active -- not an error. NOTE: because this is an UPDATE
 * under the hood, `wf_employee_line_links_manage` RLS filters rows rather
 * than raising -- a caller lacking `workforce.staff.manage` also gets
 * `unbound: false` (indistinguishable here from "nothing to unbind"), unlike
 * `bindEmployeeLineUser`'s INSERT path, which does raise on denial.
 */
export async function unbindEmployeeLineUser(
  supabase: SupabaseClient,
  tenantId: string,
  employeeId: string,
): Promise<WorkforceWriteResult<UnbindEmployeeLineUserOutcome>> {
  try {
    const { data, error } = await supabase.schema('api').rpc('unbind_workforce_employee_line_user', {
      p_tenant_id: tenantId,
      p_employee_id: employeeId,
    });

    if (error) return mapWorkforceWriteError(error, 'unbind this LINE user id');

    const count = typeof data === 'number' ? data : Number(data ?? 0);
    return { status: 'success', data: { unbound: count > 0 } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error unbinding LINE user id.',
    };
  }
}
