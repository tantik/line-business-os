-- ============================================================================
-- 0001  Core enums
-- ----------------------------------------------------------------------------
-- Shared enumerations. `module_code` is the backbone of module-based RBAC and
-- tenant module entitlement.
-- ============================================================================

-- Modules available on the platform. Extend as new products ship.
do $$ begin
  create type core.module_code as enum (
    'core',
    'workforce',
    'booking',
    'logistics',
    'crm',
    'inventory',
    'ai'
  );
exception when duplicate_object then null; end $$;

-- Built-in role keys. RBAC is data-driven (core.roles) but these well-known
-- keys are referenced by seeds and platform logic.
do $$ begin
  create type core.role_key as enum (
    'platform_owner',
    'platform_support',
    'tenant_owner',
    'tenant_admin',
    'manager',
    'employee',
    'client'
  );
exception when duplicate_object then null; end $$;

-- Tenant lifecycle / classification.
do $$ begin
  create type core.tenant_kind as enum ('demo', 'client_template', 'client');
exception when duplicate_object then null; end $$;

do $$ begin
  create type core.tenant_status as enum ('active', 'suspended', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type core.membership_status as enum ('invited', 'active', 'suspended', 'revoked');
exception when duplicate_object then null; end $$;
