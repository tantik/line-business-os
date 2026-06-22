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

-- --- No broad grants to anon / authenticated (ADR 0005 no-grants posture) ---
-- RLS only filters rows a role is otherwise allowed to touch. We intentionally
-- add no table grants to the client roles, so direct browser DB access stays
-- closed until a feature deliberately opens it.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema in ('core', 'audit', 'workforce', 'booking', 'ai')),
  0,
  'no direct table grants to anon/authenticated on business schemas'
);

-- Product schemas are exposed in supabase/config.toml (api.schemas) but remain
-- closed to client roles by the no-grants posture verified here.
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated')
      and table_schema in ('workforce', 'booking', 'ai')),
  0,
  'product schemas (workforce/booking/ai) expose no anon/authenticated table grants'
);

select * from finish();
rollback;
