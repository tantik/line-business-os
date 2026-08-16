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
-- dependency grants (SELECT only, on 6 tables) plus Workforce Cafe v0.1 Slice
-- 1A's (0024-0029) authenticated write-grant foundation: employees gains
-- INSERT/UPDATE (0024), and shift_types/shifts/shift_requests/attendance/
-- employee_line_links each gain SELECT+INSERT+UPDATE (0025/0026/0027/0028/
-- 0029) so their RLS policies (including the new self-scope ones) have
-- something to engage against. RLS remains the real boundary; these grants
-- only let it engage.
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
            'recipe_categories', 'recipes',
            'recipe_ingredients', 'recipe_steps', 'recipe_notes'
          )
          and privilege_type = 'SELECT'
        )
        or (
          table_schema = 'workforce'
          and table_name = 'employees'
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
        )
        or (
          table_schema = 'workforce'
          and table_name in (
            'shift_types', 'shifts', 'shift_requests', 'attendance', 'employee_line_links',
            'shift_exchanges'
          )
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
        )
        or (
          -- 0034_workforce_schedule_settings.sql: a later, separate migration.
          table_schema = 'workforce'
          and table_name = 'schedule_settings'
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
        )
        or (table_schema = 'workforce' and table_name = 'recipes' and privilege_type in ('INSERT', 'UPDATE'))
        or (table_schema = 'workforce' and table_name in ('recipe_ingredients', 'recipe_steps', 'recipe_notes') and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))
        or (
          -- 0064_workforce_employee_invitations.sql: a later, separate migration.
          -- No INSERT grant at all -- every row is written by a service_role
          -- caller (Edge Function) or the SECURITY DEFINER accept RPC, never
          -- directly by `authenticated`.
          table_schema = 'workforce'
          and table_name = 'employee_invitations'
          and privilege_type in ('SELECT', 'UPDATE')
        )
        or (
          -- 0069_core_entitlements_engine.sql: a later, separate migration.
          -- SELECT only -- no INSERT/UPDATE/DELETE grant to `authenticated`
          -- yet, matching tenant_modules/tenant_memberships/locations' own
          -- latent-write-policy convention (RLS write policies exist, but no
          -- facade/grant is wired up until an actual write consumer lands).
          table_schema = 'core'
          and table_name in ('entitlement_plans', 'tenant_plans')
          and privilege_type = 'SELECT'
        )
      )),
  0,
  'authenticated has no business-table grants beyond the intended read SELECTs, Slice 1A write-grant foundation, and 0034''s schedule_settings grant'
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

-- workforce: authenticated has SELECT-only on the 5 read-only facade tables
-- backing Phase 1L-3's api facade (0023_workforce_api_facade.sql).
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name in (
        'recipe_categories', 'recipes',
        'recipe_ingredients', 'recipe_steps', 'recipe_notes'
      )
      and privilege_type = 'SELECT'),
  5,
  'authenticated has SELECT on exactly the 5 recipe/category workforce facade tables'
);

-- workforce: authenticated has SELECT+INSERT+UPDATE on exactly the 6 tables
-- Workforce Cafe v0.1 Slice 1A (0024-0029) opened for a later slice's
-- Server Actions to write directly as `authenticated`, with RLS (including
-- the new self-scope policies) as the real boundary -- employees gains only
-- INSERT/UPDATE here (its SELECT already counted above via 0023); the other
-- 5 are new tables/first-ever grants.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name = 'employees'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE')),
  3,
  'authenticated has exactly SELECT+INSERT+UPDATE on workforce.employees'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and table_name in ('shift_types', 'shifts', 'shift_requests', 'attendance', 'employee_line_links')
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE')),
  15,
  'authenticated has exactly SELECT+INSERT+UPDATE on each of the 5 Slice 1A workforce tables (3 privileges x 5 tables)'
);

-- No DELETE, and no grant on leave_requests anywhere -- neither is opened by
-- this slice (retirement/decisions stay UPDATE-only; leave_requests is
-- untouched).
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and ((privilege_type = 'DELETE' and table_name not in ('recipe_ingredients', 'recipe_steps', 'recipe_notes')) or table_name = 'leave_requests')),
  0,
  'authenticated has no DELETE grant anywhere in workforce, and no grant at all on leave_requests'
);

-- Full accounting: the two counts above plus the 5 recipe/category SELECTs
-- are the ENTIRE authenticated grant surface on workforce -- nothing else
-- leaked in.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'workforce'
      and not (
        (
          table_name in ('recipe_categories', 'recipes', 'recipe_ingredients', 'recipe_steps', 'recipe_notes')
          and privilege_type = 'SELECT'
        )
        or (
          table_name = 'employees'
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
        )
        or (
          table_name in ('shift_types', 'shifts', 'shift_requests', 'attendance', 'employee_line_links', 'shift_exchanges')
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
        )
        or (
          -- 0034_workforce_schedule_settings.sql: a later, separate migration.
          table_name = 'schedule_settings'
          and privilege_type in ('SELECT', 'INSERT', 'UPDATE')
        )
        or (table_name = 'recipes' and privilege_type in ('INSERT', 'UPDATE'))
        or (table_name in ('recipe_ingredients', 'recipe_steps', 'recipe_notes') and privilege_type in ('INSERT', 'UPDATE', 'DELETE'))
        or (
          -- 0064_workforce_employee_invitations.sql: a later, separate migration.
          table_name = 'employee_invitations'
          and privilege_type in ('SELECT', 'UPDATE')
        )
      )),
  0,
  'authenticated has no workforce grants beyond the intended read SELECTs, Slice 1A write-grant foundation, and 0034''s schedule_settings grant'
);

select * from finish();
rollback;
