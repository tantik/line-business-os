import 'server-only';
import { cache } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { mapMembershipRows, mapPostgrestError, type ApiMembershipRow } from './membership';
import { mapTenantLocationRows, type ApiTenantLocationRow, type TenantLocation } from './locations';
import { mapTenantNavigationRows, mapTenantPackageCodes, type ApiTenantNavigationRow, type ApiTenantPackageRow } from './modules';
import { mapPendingTenantInvitationRows, type ApiPendingTenantInvitationRow, type PendingTenantInvitationsResult } from './tenant-invitations';
import {
  mapMyPendingWorkforceInvitationRows,
  type ApiWorkforceEmployeeInvitationRow,
  type WorkforceEmployeeInvitation,
} from '@/lib/workforce/invitations';
import type { TenantNavRow } from './module-nav';
import type { TenantAccessResult, TenantMembership } from './types';

/**
 * The per-request page context of every protected page -- memberships,
 * navigation, locations, packages and both pending-invitation lists -- from
 * ONE `api.my_page_context` RPC (0143, DEBT-135) instead of six requests.
 * Each part is mapped by the same function the single read uses, so callers
 * get identical values and outcomes.
 */
export interface PageContext {
  memberships: TenantAccessResult<TenantMembership[]>;
  navigation: TenantAccessResult<TenantNavRow[]>;
  locations: TenantAccessResult<TenantLocation[]>;
  /** Active package codes of one tenant, in package order; `[]` on a read failure (screens fall back to the default words). */
  packageCodes: (tenantId: string) => string[];
  employeeInvitations: TenantAccessResult<WorkforceEmployeeInvitation[]>;
  tenantInvitations: PendingTenantInvitationsResult;
}

function rowsOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function failed(error: PostgrestError | { message: string; code?: string }): PageContext {
  const mapped = mapPostgrestError({ message: error.message, code: error.code ?? '', details: '', hint: '', name: 'PostgrestError' } as PostgrestError);
  return {
    memberships: mapped,
    navigation: mapped,
    locations: mapped,
    packageCodes: () => [],
    employeeInvitations: mapped,
    tenantInvitations: { status: 'error' },
  };
}

/**
 * Request-scoped (React `cache`): the (protected) layout's banners, the
 * tenant context and the page share one RPC per request. Never cached across
 * requests or users.
 */
export const loadPageContext = cache(async (): Promise<PageContext> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.schema('api').rpc('my_page_context');
    if (error) return failed(error);
    if (!data || typeof data !== 'object') return failed({ message: 'Unexpected page context shape.' });
    const ctx = data as Record<string, unknown>;
    const packages = rowsOf<ApiTenantPackageRow>(ctx.packages);
    return {
      memberships: mapMembershipRows(rowsOf<ApiMembershipRow>(ctx.memberships)),
      navigation: { status: 'success', data: mapTenantNavigationRows(rowsOf<ApiTenantNavigationRow>(ctx.navigation)) },
      locations: { status: 'success', data: mapTenantLocationRows(rowsOf<ApiTenantLocationRow>(ctx.locations)) },
      packageCodes: (tenantId) => mapTenantPackageCodes(packages, tenantId),
      employeeInvitations: {
        status: 'success',
        data: mapMyPendingWorkforceInvitationRows(rowsOf<ApiWorkforceEmployeeInvitationRow>(ctx.employeeInvitations)),
      },
      tenantInvitations: {
        status: 'success',
        data: mapPendingTenantInvitationRows(rowsOf<ApiPendingTenantInvitationRow>(ctx.tenantInvitations)),
      },
    };
  } catch (err) {
    return failed({ message: err instanceof Error ? err.message : 'Unexpected error reading the page context.' });
  }
});
