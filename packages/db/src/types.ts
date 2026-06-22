/**
 * Hand-maintained domain types shared across the platform.
 *
 * For fully generated row types, run `pnpm --filter @line-os/db gen:types`
 * (requires a running local Supabase) which writes `src/types.generated.ts`.
 */

export type ModuleCode =
  | 'core'
  | 'workforce'
  | 'booking'
  | 'logistics'
  | 'crm'
  | 'inventory'
  | 'ai';

export type RoleKey =
  | 'platform_owner'
  | 'platform_support'
  | 'tenant_owner'
  | 'tenant_admin'
  | 'manager'
  | 'employee'
  | 'client';

export type TenantKind = 'demo' | 'client_template' | 'client';

export interface TenantContext {
  tenantId: string;
  userId: string;
  /** Optional active location scope. */
  locationId?: string;
  permissions: string[];
  isPlatformStaff: boolean;
}

export interface AuditEntry {
  tenantId: string;
  actorId?: string;
  actorKind?: 'user' | 'system' | 'ai';
  module: ModuleCode;
  entity: string;
  entityId?: string;
  action: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
