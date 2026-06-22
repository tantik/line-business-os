-- ============================================================================
-- 0002  Core tables: tenants, locations, users, memberships, modules
-- ----------------------------------------------------------------------------
-- The multi-tenant backbone. Every business table elsewhere references
-- core.tenants(id) via tenant_id, and physical-location data references
-- core.locations(id) via location_id.
-- ============================================================================

-- Tenants = SaaS customers / companies -------------------------------------
create table if not exists core.tenants (
  id           uuid primary key default gen_random_uuid(),
  slug         citext not null unique,
  name         text not null,
  kind         core.tenant_kind not null default 'client',
  status       core.tenant_status not null default 'active',
  -- Free-form tenant configuration (branding, locale, feature flags).
  -- Demo vs client_template differences live here + in seed data, NOT in code.
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table core.tenants is 'SaaS customer / company. Root of every tenant_id chain.';

-- Locations = store / salon / branch / warehouse ---------------------------
create table if not exists core.locations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  name         text not null,
  timezone     text not null default 'Asia/Tokyo',
  address_encrypted bytea,          -- PII: encrypted at app layer
  metadata     jsonb not null default '{}'::jsonb,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists locations_tenant_idx on core.locations(tenant_id);
comment on table core.locations is 'Physical branch/store/salon/warehouse within a tenant.';

-- Users = identity (maps 1:1 to auth.users in Supabase) --------------------
-- We mirror auth.users into core.users so the platform can attach profile +
-- PII columns and reference users from FKs without touching the auth schema.
create table if not exists core.users (
  id               uuid primary key,  -- equals auth.users.id
  display_name     text,
  -- Searchable PII: store encrypted blob + blind-index hash (pepper at app).
  email_encrypted  bytea,
  email_hash       text,
  phone_encrypted  bytea,
  phone_hash       text,
  is_platform_staff boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists users_email_hash_idx on core.users(email_hash);
create index if not exists users_phone_hash_idx on core.users(phone_hash);
comment on table core.users is 'Platform identity mirror of auth.users with protected PII.';

-- Tenant memberships = which users belong to which tenant ------------------
-- This table is the SOURCE OF TRUTH for tenant isolation. The backend derives
-- tenant_id from membership, never from the request body.
create table if not exists core.tenant_memberships (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  user_id      uuid not null references core.users(id) on delete cascade,
  -- Optional default location scope for location-bound staff.
  location_id  uuid references core.locations(id) on delete set null,
  status       core.membership_status not null default 'invited',
  invited_by   uuid references core.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index if not exists memberships_user_idx on core.tenant_memberships(user_id);
create index if not exists memberships_tenant_idx on core.tenant_memberships(tenant_id);
comment on table core.tenant_memberships is 'Source of truth for tenant isolation; derive tenant_id from here.';

-- Tenant module entitlements = which products a tenant has enabled ---------
create table if not exists core.tenant_modules (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants(id) on delete cascade,
  module       core.module_code not null,
  is_enabled   boolean not null default true,
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, module)
);
create index if not exists tenant_modules_tenant_idx on core.tenant_modules(tenant_id);
comment on table core.tenant_modules is 'Per-tenant product/module entitlement and config.';
