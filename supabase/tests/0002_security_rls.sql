-- ============================================================================
-- DB test: security invariants (RLS, append-only audit, privilege guards, grants)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- pgTAP tests, enabled inside a rolled-back transaction (see 0001 header). A
-- failure here is a real failure — never fake a pass. See docs/phase-1-core-db.md.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai;

select no_plan();

-- --- RLS is enabled on every business table --------------------------------
-- Tenant isolation lives in the database. Every base table in the business
-- schemas must have row level security enabled; none may have it disabled.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('core', 'audit', 'workforce', 'booking', 'ai')
      and c.relkind = 'r'
      and c.relrowsecurity = false),
  0,
  'no base table in core/audit/workforce/booking/ai has RLS disabled'
);

-- Positive sanity check: at least one well-known table reports RLS enabled.
select ok(
  (select c.relrowsecurity
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'core' and c.relname = 'tenants'),
  'RLS is enabled on core.tenants'
);

-- --- audit.audit_logs is append-only ---------------------------------------
-- Seed a tenant + audit row inside this rolled-back transaction (superuser
-- bypasses RLS), then prove UPDATE and DELETE are rejected by the trigger.
insert into core.tenants (id, slug, name)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'pgtap-temp-tenant', 'pgTAP Temp Tenant');

insert into audit.audit_logs (tenant_id, module, entity, action)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'core', 'pgtap', 'create');

select throws_ok(
  $$ update audit.audit_logs set action = 'tamper'
       where tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'audit.audit_logs is append-only',
  'audit.audit_logs UPDATE is rejected (append-only)'
);

select throws_ok(
  $$ delete from audit.audit_logs
       where tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' $$,
  'audit.audit_logs is append-only',
  'audit.audit_logs DELETE is rejected (append-only)'
);

-- --- Platform-staff self-escalation guard exists ---------------------------
-- core.users.is_platform_staff must not be self-mutable by client roles. The
-- guard is a function + BEFORE UPDATE trigger installed by migration 0012.
select has_function(
  'core', 'enforce_platform_staff_immutable',
  'core.enforce_platform_staff_immutable() exists'
);
select has_trigger(
  'core', 'users', 'enforce_platform_staff_immutable',
  'enforce_platform_staff_immutable trigger is installed on core.users'
);

-- --- Narrow authenticated grants only (Phase 1D + app facade reads) ---------
-- Phase 1D (migration 0013) opened the first direct-DB access surface for the
-- `authenticated` role: USAGE on schema core + SELECT on core.tenants and
-- core.tenant_memberships. Later app-facing security-invoker views add SELECT
-- on core.locations and core.tenant_modules so RLS can engage as the caller.
-- `anon` still gets NOTHING, and no other business table/schema is opened.

-- anon: no table grants on any business schema (unchanged no-grants posture).
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema in ('core', 'audit', 'workforce', 'booking', 'ai')),
  0,
  'no direct table grants to anon on business schemas'
);

-- anon: no USAGE on schema core (schema usage was granted to authenticated only).
select ok(
  not has_schema_privilege('anon', 'core', 'USAGE'),
  'anon has no USAGE on schema core'
);

-- authenticated: has USAGE on schema core (required to reach the two tables).
select ok(
  has_schema_privilege('authenticated', 'core', 'USAGE'),
  'authenticated has USAGE on schema core'
);

-- authenticated: SELECT on the exact core tables needed by app-facing facade
-- views. These are RLS-protected read grants only; core remains internal to the
-- Data API exposure list.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'core' and table_name = 'tenants'
      and privilege_type = 'SELECT'),
  1,
  'authenticated has SELECT on core.tenants'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'core' and table_name = 'tenant_memberships'
      and privilege_type = 'SELECT'),
  1,
  'authenticated has SELECT on core.tenant_memberships'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'core' and table_name = 'locations'
      and privilege_type = 'SELECT'),
  1,
  'authenticated has SELECT on core.locations'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'core' and table_name = 'tenant_modules'
      and privilege_type = 'SELECT'),
  1,
  'authenticated has SELECT on core.tenant_modules'
);

-- authenticated: NO grants beyond those exact SELECTs on business schemas.
-- This catches accidental broadening (extra tables, INSERT/UPDATE/DELETE, etc.).
-- The workforce exception mirrors Phase 1L-3's 0023_workforce_api_facade.sql
-- dependency grants (SELECT only, on exactly these 6 tables).
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema in ('core', 'audit', 'workforce', 'booking', 'ai')
      and not (
        (
          table_schema = 'core'
          and table_name in ('tenants', 'tenant_memberships', 'locations', 'tenant_modules')
          and privilege_type = 'SELECT'
        )
        or (
          table_schema = 'workforce'
          and table_name in (
            'employees', 'recipe_categories', 'recipes',
            'recipe_ingredients', 'recipe_steps', 'recipe_notes'
          )
          and privilege_type = 'SELECT'
        )
      )),
  0,
  'authenticated has no business-table grants beyond the intended read SELECTs'
);

-- Product schemas (booking/ai) and audit expose no client grants at all.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema in ('audit', 'booking', 'ai')),
  0,
  'audit + booking/ai schemas expose no anon/authenticated table grants'
);

-- workforce: anon still has zero grants (Phase 1L-3's authenticated-only read
-- facade, 0023_workforce_api_facade.sql, does not touch anon's posture).
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'workforce'),
  0,
  'anon has no table grants on workforce'
);

-- workforce: authenticated has SELECT-only on exactly the 6 named tables
-- backing Phase 1L-3's api facade (0023_workforce_api_facade.sql) -- nothing
-- else in workforce (shifts/shift_requests/leave_requests/attendance) and no
-- INSERT/UPDATE/DELETE anywhere in workforce.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name in (
        'employees', 'recipe_categories', 'recipes',
        'recipe_ingredients', 'recipe_steps', 'recipe_notes'
      )
      and privilege_type = 'SELECT'),
  6,
  'authenticated has SELECT on exactly the 6 workforce facade tables'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and not (
        table_name in (
          'employees', 'recipe_categories', 'recipes',
          'recipe_ingredients', 'recipe_steps', 'recipe_notes'
        )
        and privilege_type = 'SELECT'
      )),
  0,
  'authenticated has no workforce grants beyond the intended 6 SELECTs (no writes, no other tables)'
);

select * from finish();
rollback;
