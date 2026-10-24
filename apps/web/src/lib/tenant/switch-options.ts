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
 * `setActiveTenant`. One entry per tenant even when the caller holds
 * several membership rows (one per location) in the same cafe.
 */
export function toTenantSwitchOptions(memberships: TenantMembership[]): TenantSwitchOption[] {
  const byId = new Map<string, TenantSwitchOption>();
  for (const m of memberships) {
    if (!byId.has(m.tenantId)) byId.set(m.tenantId, { tenantId: m.tenantId, tenantName: m.tenantName });
  }
  return [...byId.values()].sort((a, b) => a.tenantName.localeCompare(b.tenantName, 'ja'));
}
