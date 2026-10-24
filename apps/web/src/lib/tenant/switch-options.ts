import type { TenantMembership } from './types';

/** One entry of the account-menu cafe switcher (F13). */
export interface TenantSwitchOption {
  tenantId: string;
  tenantName: string;
}

/**
 * Account-menu switcher entries from the memberships `requireTenantContext`
 * already read -- no extra request per render. Only ids and display names
 * reach the client; the switch itself is revalidated server-side by
 * `setActiveTenant`.
 */
export function toTenantSwitchOptions(memberships: TenantMembership[]): TenantSwitchOption[] {
  return memberships
    .map((m) => ({ tenantId: m.tenantId, tenantName: m.tenantName }))
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName, 'ja'));
}
