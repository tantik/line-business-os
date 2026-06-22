-- ============================================================================
-- 0000  Extensions & schemas
-- ----------------------------------------------------------------------------
-- Foundational setup for LINE Business OS. Creates the schemas that separate
-- platform concerns and enables the extensions used across the platform.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid(), digest()
create extension if not exists "citext";      -- case-insensitive text (codes)

-- Schemas -------------------------------------------------------------------
-- core   : platform-wide tenancy, identity, RBAC, LINE channel registry
-- audit  : append-only audit trail
-- Module schemas (workforce, booking, ...) are created in their own migrations.
create schema if not exists core;
create schema if not exists audit;

comment on schema core is 'Platform core: tenants, locations, identity, RBAC, LINE registry';
comment on schema audit is 'Append-only audit logs for all modules';
