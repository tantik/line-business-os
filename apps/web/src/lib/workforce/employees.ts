import type { SupabaseClient } from '@supabase/supabase-js';
import { encryptPII, decryptPII, blindIndex, bufferToBytea, byteaToBuffer } from '@line-os/db/crypto';
import type { TenantAccessResult } from '@/lib/tenant/types';
import type { WorkforceWriteResult } from './result-types';
import { mapWorkforceReadError, mapWorkforceWriteError } from './pg-error';
import { readPiiEnv } from './pii-env';

/** Flat row shape returned by `api.workforce_staff_directory` (no PII). */
interface ApiWorkforceStaffDirectoryRow {
  staff_id: string;
  tenant_id: string;
  location_id: string | null;
  position_label: string | null;
  employment_type: string | null;
  is_active: boolean;
  created_at: string;
}

export interface WorkforceStaffDirectoryEntry {
  staffId: string;
  tenantId: string;
  locationId: string | null;
  positionLabel: string | null;
  employmentType: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Flat row shape returned by `api.workforce_staff_manage`. `name_encrypted` arrives as PostgREST's hex bytea text (`\x...`). */
interface ApiWorkforceStaffManageRow {
  staff_id: string;
  tenant_id: string;
  location_id: string | null;
  name_encrypted: string;
  name_hash: string;
  family_name_encrypted: string | null;
  given_name_encrypted: string | null;
  email_encrypted: string | null;
  email_hash: string | null;
  notes_encrypted: string | null;
  position_label: string | null;
  employment_type: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  hourly_wage_yen: number | null;
}

/** Manager-facing staff entry with the name already decrypted server-side. Never re-serialize `nameEncrypted`/`nameHash` back to a client. */
export interface WorkforceStaffManageEntry {
  staffId: string;
  tenantId: string;
  locationId: string | null;
  name: string;
  familyName: string | null;
  givenName: string | null;
  email: string | null;
  notes: string | null;
  positionLabel: string | null;
  employmentType: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  hourlyWageYen: number | null;
}

const DIRECTORY_SELECT = 'staff_id, tenant_id, location_id, position_label, employment_type, is_active, created_at';
const MANAGE_SELECT =
  'staff_id, tenant_id, location_id, name_encrypted, name_hash, family_name_encrypted, given_name_encrypted, email_encrypted, email_hash, notes_encrypted, position_label, employment_type, is_active, created_at, updated_at, hourly_wage_yen';

function mapDirectoryRow(row: ApiWorkforceStaffDirectoryRow): WorkforceStaffDirectoryEntry {
  return {
    staffId: row.staff_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    positionLabel: row.position_label,
    employmentType: row.employment_type,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

function decryptManageRow(row: ApiWorkforceStaffManageRow, encryptionKey: string): WorkforceStaffManageEntry {
  return {
    staffId: row.staff_id,
    tenantId: row.tenant_id,
    locationId: row.location_id,
    name: decryptPII(byteaToBuffer(row.name_encrypted), encryptionKey),
    familyName: row.family_name_encrypted ? decryptPII(byteaToBuffer(row.family_name_encrypted), encryptionKey) : null,
    givenName: row.given_name_encrypted ? decryptPII(byteaToBuffer(row.given_name_encrypted), encryptionKey) : null,
    email: row.email_encrypted ? decryptPII(byteaToBuffer(row.email_encrypted), encryptionKey) : null,
    notes: row.notes_encrypted ? decryptPII(byteaToBuffer(row.notes_encrypted), encryptionKey) : null,
    positionLabel: row.position_label,
    employmentType: row.employment_type,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hourlyWageYen: row.hourly_wage_yen,
  };
}

/**
 * Read the tenant's staff directory (no PII) through `api.workforce_staff_directory`.
 * Visible to both `workforce.staff.read` and `workforce.staff.manage` holders (RLS, unchanged).
 */
export async function listWorkforceStaffDirectory(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceStaffDirectoryEntry[]>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_directory')
      .select(DIRECTORY_SELECT)
      .eq('tenant_id', tenantId);

    if (error) return mapWorkforceReadError(error, 'read the staff directory');

    const rows = (data ?? []) as ApiWorkforceStaffDirectoryRow[];
    const entries = rows.map(mapDirectoryRow).sort((a, b) => a.staffId.localeCompare(b.staffId));
    return { status: 'success', data: entries };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading the staff directory.',
    };
  }
}

/** Read one RLS-visible directory entry without loading the tenant's full staff list. */
export async function getWorkforceStaffDirectoryEntryById(
  supabase: SupabaseClient,
  tenantId: string,
  staffId: string,
): Promise<TenantAccessResult<WorkforceStaffDirectoryEntry | null>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_directory')
      .select(DIRECTORY_SELECT)
      .eq('tenant_id', tenantId)
      .eq('staff_id', staffId)
      .maybeSingle();
    if (error) return mapWorkforceReadError(error, 'read the staff directory entry');
    return { status: 'success', data: data ? mapDirectoryRow(data as ApiWorkforceStaffDirectoryRow) : null };
  } catch (err) {
    return { status: 'unexpected_error', message: err instanceof Error ? err.message : 'Unexpected error reading the staff directory entry.' };
  }
}

/**
 * Manager-only staff list WITH decrypted names, through `api.workforce_staff_manage`
 * (0031). The view itself never exposes a decrypted name -- `name_encrypted`
 * arrives as opaque ciphertext and is decrypted here, server-side only. RLS
 * (`wf_employees_staff_read`/`wf_employees_staff_manage`) is what actually
 * restricts this to manager/owner/admin callers; a `workforce.staff.read`- or
 * `.manage`-less caller gets zero rows back, not an error.
 */
export async function listWorkforceStaffForManager(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantAccessResult<WorkforceStaffManageEntry[]>> {
  const pii = readPiiEnv();
  if (!pii.ok) return { status: 'config_error', message: `Missing PII protection env: ${pii.missing.join(', ')}` };

  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_manage')
      .select(MANAGE_SELECT)
      .eq('tenant_id', tenantId);

    if (error) return mapWorkforceReadError(error, 'read the staff list');

    const rows = (data ?? []) as ApiWorkforceStaffManageRow[];
    const entries = rows
      .map((row) => decryptManageRow(row, pii.config.encryptionKey))
      .sort((a, b) => a.name.localeCompare(b.name) || a.staffId.localeCompare(b.staffId));
    return { status: 'success', data: entries };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error reading the staff list.',
    };
  }
}

export interface UpsertWorkforceEmployeeInput {
  /** Omit to create a new employee; provide to edit an existing one. */
  id?: string;
  locationId: string;
  name: string;
  familyName: string;
  givenName: string;
  email: string;
  notes?: string | null;
  positionLabel?: string | null;
  employmentType?: string | null;
  isActive?: boolean;
  hourlyWageYen?: number | null;
}

/**
 * Create or edit a staff profile through `api.workforce_staff_manage` (0031).
 * `name` is encrypted + blind-indexed here (never stored/sent as plaintext
 * beyond this call); RLS (`wf_employees_staff_manage`, `workforce.staff.manage`)
 * is the real write boundary.
 */
export async function upsertWorkforceEmployee(
  supabase: SupabaseClient,
  tenantId: string,
  input: UpsertWorkforceEmployeeInput,
): Promise<WorkforceWriteResult<WorkforceStaffManageEntry>> {
  const pii = readPiiEnv();
  if (!pii.ok) return { status: 'config_error', message: `Missing PII protection env: ${pii.missing.join(', ')}` };

  const nameEncrypted = bufferToBytea(encryptPII(input.name, pii.config.encryptionKey));
  const nameHash = blindIndex(input.name, pii.config.hashPepper);
  const familyNameEncrypted = bufferToBytea(encryptPII(input.familyName, pii.config.encryptionKey));
  const givenNameEncrypted = bufferToBytea(encryptPII(input.givenName, pii.config.encryptionKey));
  const emailEncrypted = bufferToBytea(encryptPII(input.email, pii.config.encryptionKey));
  const emailHash = blindIndex(input.email.toLowerCase(), pii.config.hashPepper);
  const notesEncrypted = input.notes ? bufferToBytea(encryptPII(input.notes, pii.config.encryptionKey)) : null;

  try {
    if (input.id) {
      const { data, error } = await supabase
        .schema('api')
        .from('workforce_staff_manage')
        .update({
          location_id: input.locationId,
          name_encrypted: nameEncrypted,
          name_hash: nameHash,
          family_name_encrypted: familyNameEncrypted,
          given_name_encrypted: givenNameEncrypted,
          email_encrypted: emailEncrypted,
          email_hash: emailHash,
          notes_encrypted: notesEncrypted,
          position_label: input.positionLabel ?? null,
          employment_type: input.employmentType ?? null,
          hourly_wage_yen: input.hourlyWageYen ?? null,
          ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        })
        .eq('tenant_id', tenantId)
        .eq('staff_id', input.id)
        .select(MANAGE_SELECT)
        .maybeSingle();

      if (error) return mapWorkforceWriteError(error, 'update this staff profile');
      if (!data) return { status: 'not_found' };
      return { status: 'success', data: decryptManageRow(data as ApiWorkforceStaffManageRow, pii.config.encryptionKey) };
    }

    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_manage')
      .insert({
        tenant_id: tenantId,
        location_id: input.locationId,
        name_encrypted: nameEncrypted,
        name_hash: nameHash,
        family_name_encrypted: familyNameEncrypted,
        given_name_encrypted: givenNameEncrypted,
        email_encrypted: emailEncrypted,
        email_hash: emailHash,
        notes_encrypted: notesEncrypted,
        position_label: input.positionLabel ?? null,
        employment_type: input.employmentType ?? null,
        hourly_wage_yen: input.hourlyWageYen ?? null,
        is_active: input.isActive ?? true,
      })
      .select(MANAGE_SELECT)
      .single();

    if (error) return mapWorkforceWriteError(error, 'create this staff profile');
    return { status: 'success', data: decryptManageRow(data as ApiWorkforceStaffManageRow, pii.config.encryptionKey) };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error upserting staff profile.',
    };
  }
}

export interface WorkforceEmployeeActiveState {
  staffId: string;
  isActive: boolean;
}

/** Activate/deactivate a staff profile (retirement is `is_active = false`, never a hard delete). */
export async function setWorkforceEmployeeActive(
  supabase: SupabaseClient,
  tenantId: string,
  staffId: string,
  isActive: boolean,
): Promise<WorkforceWriteResult<WorkforceEmployeeActiveState>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .from('workforce_staff_manage')
      .update({ is_active: isActive })
      .eq('tenant_id', tenantId)
      .eq('staff_id', staffId)
      .select('staff_id, is_active')
      .maybeSingle();

    if (error) return mapWorkforceWriteError(error, "change this staff member's active status");
    if (!data) return { status: 'not_found' };
    return { status: 'success', data: { staffId: data.staff_id as string, isActive: data.is_active as boolean } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : "Unexpected error changing staff member's active status.",
    };
  }
}

/** Flat row shape returned by `api.permanently_delete_employee` (0056). */
interface ApiPermanentDeleteEmployeeRow {
  deleted: boolean;
  blocked_by_history: boolean;
}

/**
 * Hard-delete an employee, but only when they have zero historical
 * references (shifts, attendance, requests, exchanges) -- calls
 * `api.permanently_delete_employee` (0056), never a raw DELETE. Distinct from
 * `setWorkforceEmployeeActive`, which remains the normal, always-available
 * soft-delete/reactivate ("Remove staff") path and never touches this RPC.
 */
export async function permanentlyDeleteEmployee(
  supabase: SupabaseClient,
  tenantId: string,
  staffId: string,
): Promise<WorkforceWriteResult<{ staffId: string }>> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('permanently_delete_employee', { p_tenant_id: tenantId, p_employee_id: staffId });

    if (error) return mapWorkforceWriteError(error, 'permanently delete this staff member');

    const row = (Array.isArray(data) ? data[0] : data) as ApiPermanentDeleteEmployeeRow | undefined;
    if (!row) return { status: 'not_found' };
    if (row.blocked_by_history) return { status: 'blocked_by_history' };
    if (!row.deleted) return { status: 'unexpected_error', message: 'Unable to permanently delete this staff member right now.' };
    return { status: 'success', data: { staffId } };
  } catch (err) {
    return {
      status: 'unexpected_error',
      message: err instanceof Error ? err.message : 'Unexpected error permanently deleting this staff member.',
    };
  }
}
