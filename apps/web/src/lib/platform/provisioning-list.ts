import type { SupabaseClient } from '@supabase/supabase-js';

/** Row of `api.platform_tenant_provisioning_list` (0135). No PII by contract. */
interface ApiProvisioningRow {
  request_id: string | null;
  tenant_id: string | null;
  slug: string | null;
  business_name: string | null;
  tenant_kind: string | null;
  tenant_status: string | null;
  location_name: string | null;
  location_timezone: string | null;
  status: string | null;
  step: string | null;
  error_code: string | null;
  template_code: string | null;
  template_version: number | null;
  owner_invitation_status: string | null;
  owner_invitation_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type OwnerInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface PlatformTenantRow {
  /** null = a tenant that was never provisioned through Stage 4B (seed / demo / legacy onboarding). */
  requestId: string | null;
  tenantId: string | null;
  slug: string;
  businessName: string | null;
  tenantKind: string | null;
  tenantStatus: string | null;
  locationName: string | null;
  locationTimezone: string | null;
  status: string | null;
  step: string | null;
  errorCode: string | null;
  templateCode: string | null;
  templateVersion: number | null;
  ownerInvitationStatus: OwnerInvitationStatus | null;
  ownerInvitationExpiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type PlatformListResult =
  | { status: 'success'; data: PlatformTenantRow[] }
  | { status: 'unauthorized' }
  | { status: 'error' };

const OWNER_STATUSES: ReadonlySet<string> = new Set(['pending', 'accepted', 'revoked', 'expired']);

export function mapProvisioningRow(row: ApiProvisioningRow): PlatformTenantRow {
  return {
    requestId: row.request_id,
    tenantId: row.tenant_id,
    slug: row.slug ?? '',
    businessName: row.business_name,
    tenantKind: row.tenant_kind,
    tenantStatus: row.tenant_status,
    locationName: row.location_name,
    locationTimezone: row.location_timezone,
    status: row.status,
    step: row.step,
    errorCode: row.error_code,
    templateCode: row.template_code,
    templateVersion: row.template_version,
    ownerInvitationStatus:
      row.owner_invitation_status && OWNER_STATUSES.has(row.owner_invitation_status)
        ? (row.owner_invitation_status as OwnerInvitationStatus)
        : null,
    ownerInvitationExpiresAt: row.owner_invitation_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Platform-staff read for the admin console (0135), through the CALLER'S OWN
 * session (request-scoped anon-key client; the SQL function checks
 * `is_platform_staff` from the JWT and raises 42501 otherwise). `requestId`
 * narrows to one request (detail view). Raw DB error text never leaves here.
 */
export async function listPlatformTenantProvisioning(
  supabase: SupabaseClient,
  requestId?: string,
): Promise<PlatformListResult> {
  try {
    const { data, error } = await supabase
      .schema('api')
      .rpc('platform_tenant_provisioning_list', requestId ? { p_request_id: requestId } : {});
    if (error) return error.code === '42501' ? { status: 'unauthorized' } : { status: 'error' };
    const rows = (Array.isArray(data) ? data : []) as ApiProvisioningRow[];
    return { status: 'success', data: rows.map(mapProvisioningRow) };
  } catch {
    return { status: 'error' };
  }
}
