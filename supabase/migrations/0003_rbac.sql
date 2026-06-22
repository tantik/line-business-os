-- ============================================================================
-- 0003  RBAC: permissions, roles, role_permissions, role_assignments
-- ----------------------------------------------------------------------------
-- Module-based RBAC. Permissions are strings like `workforce.shift.write`.
-- Roles bundle permissions. Users get roles per tenant (optionally per
-- location) via role_assignments.
-- ============================================================================

-- Permissions catalog (global definitions, not tenant-scoped) ---------------
create table if not exists core.permissions (
  key         text primary key,                 -- e.g. 'workforce.shift.write'
  module      core.module_code not null,
  description text not null default ''
);
comment on table core.permissions is 'Global catalog of module-based permission keys.';

-- Roles ---------------------------------------------------------------------
-- System roles (tenant_id is null) are platform-defined and shared. Tenants
-- may define custom roles scoped to their tenant_id.
create table if not exists core.roles (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references core.tenants(id) on delete cascade, -- null = system role
  key         text not null,                    -- e.g. 'manager'
  name        text not null,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (tenant_id, key)
);
comment on table core.roles is 'System (tenant_id null) and tenant-custom roles.';

-- Role -> permission mapping ------------------------------------------------
create table if not exists core.role_permissions (
  role_id        uuid not null references core.roles(id) on delete cascade,
  permission_key text not null references core.permissions(key) on delete cascade,
  primary key (role_id, permission_key)
);

-- Role assignment = user has role within tenant (optionally per location) ---
create table if not exists core.role_assignments (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants(id) on delete cascade,
  user_id     uuid not null references core.users(id) on delete cascade,
  role_id     uuid not null references core.roles(id) on delete cascade,
  location_id uuid references core.locations(id) on delete cascade, -- null = all locations
  created_at  timestamptz not null default now(),
  unique (tenant_id, user_id, role_id, location_id)
);
create index if not exists role_assignments_user_idx on core.role_assignments(user_id);
create index if not exists role_assignments_tenant_idx on core.role_assignments(tenant_id);
comment on table core.role_assignments is 'Grants a role to a user within a tenant (optionally per location).';
