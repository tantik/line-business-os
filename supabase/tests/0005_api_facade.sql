-- ============================================================================
-- DB test: Phase 1E-3 app-facing `api` facade (migration 0015)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves the production-safe facade added by 0015_api_facade.sql:
--   * schema `api` and the view `api.my_tenant_memberships` exist;
--   * the view is security_invoker (RLS in core is enforced as the caller);
--   * `api` contains NO SECURITY DEFINER function;
--   * `anon` gets nothing on `api` (no USAGE, no SELECT) — fail-closed;
--   * `authenticated` has USAGE on `api` + SELECT on the view, and NO writes;
--   * behaviorally, an authenticated user reads ONLY their own ACTIVE
--     memberships joined to their tenant (id/slug/name/kind), never another
--     user's or tenant's rows, and never invited/suspended/revoked memberships;
--   * an authenticated session with no JWT sub sees zero rows.
--
-- pgTAP runs as the superuser test role. To exercise the security_invoker view
-- under RLS we hop into the `authenticated` role inside SECURITY INVOKER helper
-- functions: SET LOCAL ROLE reverts on return, so every pgTAP assertion call
-- still runs as the superuser. The helpers emit no result rows (clean TAP).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, booking, ai, api;

select no_plan();

-- --- Helpers: run a query AS the authenticated role for a given JWT sub -----
create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int
language plpgsql
as $$
declare n int;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into n;
  return n;
end;
$$;

create function pg_temp.as_auth_text(p_sub text, p_sql text)
returns text
language plpgsql
as $$
declare s text;
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into s;
  return s;
end;
$$;

-- --- Fixtures (inserted as superuser; bypasses RLS) ------------------------
-- Tenants A/B for the basic own-only + cross-tenant checks, plus C/D so a single
-- "Multi" user can hold one membership per status and prove the view returns
-- only the ACTIVE one.
insert into core.tenants (id, slug, name, kind) values
  ('a1111111-1111-1111-1111-111111111111', 'pgtap-1e3-tenant-a', 'pgTAP 1E3 Tenant A', 'demo'),
  ('b2222222-2222-2222-2222-222222222222', 'pgtap-1e3-tenant-b', 'pgTAP 1E3 Tenant B', 'client'),
  ('c3333333-3333-3333-3333-333333333333', 'pgtap-1e3-tenant-c', 'pgTAP 1E3 Tenant C', 'client'),
  ('d4444444-4444-4444-4444-444444444444', 'pgtap-1e3-tenant-d', 'pgTAP 1E3 Tenant D', 'client');

insert into core.users (id, display_name) values
  ('0a0a0a0a-0000-0000-0000-000000000001', 'Alice (active A)'),
  ('0a0a0a0a-0000-0000-0000-000000000002', 'Bob (active A)'),
  ('0b0b0b0b-0000-0000-0000-000000000003', 'Carol (active B)'),
  ('0c0c0c0c-0000-0000-0000-000000000004', 'Multi (mixed statuses)');

insert into core.tenant_memberships (tenant_id, user_id, status) values
  ('a1111111-1111-1111-1111-111111111111', '0a0a0a0a-0000-0000-0000-000000000001', 'active'),
  ('a1111111-1111-1111-1111-111111111111', '0a0a0a0a-0000-0000-0000-000000000002', 'active'),
  ('b2222222-2222-2222-2222-222222222222', '0b0b0b0b-0000-0000-0000-000000000003', 'active'),
  -- Multi: one membership per status across four tenants.
  ('a1111111-1111-1111-1111-111111111111', '0c0c0c0c-0000-0000-0000-000000000004', 'active'),
  ('b2222222-2222-2222-2222-222222222222', '0c0c0c0c-0000-0000-0000-000000000004', 'invited'),
  ('c3333333-3333-3333-3333-333333333333', '0c0c0c0c-0000-0000-0000-000000000004', 'suspended'),
  ('d4444444-4444-4444-4444-444444444444', '0c0c0c0c-0000-0000-0000-000000000004', 'revoked');

-- --- Structural: schema + view exist --------------------------------------
select has_schema('api', 'schema api exists');
select has_view('api', 'my_tenant_memberships', 'api.my_tenant_memberships view exists');

-- --- The view is security_invoker -----------------------------------------
-- reloptions stores the WITH option as text (e.g. {security_invoker=true}); a
-- security_invoker view enforces the underlying core RLS as the calling role.
select ok(
  exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral unnest(c.reloptions) o(opt)
    where n.nspname = 'api'
      and c.relname = 'my_tenant_memberships'
      and lower(o.opt) = 'security_invoker=true'
  ),
  'api.my_tenant_memberships is a security_invoker view'
);

-- --- No SECURITY DEFINER function in api -----------------------------------
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.prosecdef),
  0,
  'api schema contains no SECURITY DEFINER function'
);

-- --- anon is fully denied on api (fail-closed) -----------------------------
select ok(
  not has_schema_privilege('anon', 'api', 'USAGE'),
  'anon has no USAGE on schema api'
);
select ok(
  not has_table_privilege('anon', 'api.my_tenant_memberships', 'SELECT'),
  'anon cannot SELECT api.my_tenant_memberships'
);

-- --- authenticated has exactly the read surface ----------------------------
select ok(
  has_schema_privilege('authenticated', 'api', 'USAGE'),
  'authenticated has USAGE on schema api'
);
select ok(
  has_table_privilege('authenticated', 'api.my_tenant_memberships', 'SELECT'),
  'authenticated can SELECT api.my_tenant_memberships'
);

-- --- authenticated cannot write through the view ---------------------------
select ok(
  not has_table_privilege('authenticated', 'api.my_tenant_memberships', 'INSERT'),
  'authenticated cannot INSERT api.my_tenant_memberships'
);
select ok(
  not has_table_privilege('authenticated', 'api.my_tenant_memberships', 'UPDATE'),
  'authenticated cannot UPDATE api.my_tenant_memberships'
);
select ok(
  not has_table_privilege('authenticated', 'api.my_tenant_memberships', 'DELETE'),
  'authenticated cannot DELETE api.my_tenant_memberships'
);

-- --- Behavioral: Alice reads only her own active membership ----------------
select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000001',
    'select count(*)::int from api.my_tenant_memberships'),
  1,
  'Alice sees exactly one row (her own active membership) via the facade'
);
select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.my_tenant_memberships
          where tenant_id = 'a1111111-1111-1111-1111-111111111111' $q$),
  1,
  'Alice sees Tenant A via the facade'
);
select is(
  pg_temp.as_auth_text('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select tenant_slug from api.my_tenant_memberships
          where tenant_id = 'a1111111-1111-1111-1111-111111111111' $q$),
  'pgtap-1e3-tenant-a',
  'Alice reads the correct tenant_slug for Tenant A'
);
select is(
  pg_temp.as_auth_text('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select tenant_name from api.my_tenant_memberships
          where tenant_id = 'a1111111-1111-1111-1111-111111111111' $q$),
  'pgTAP 1E3 Tenant A',
  'Alice reads the correct tenant_name for Tenant A'
);
select is(
  pg_temp.as_auth_text('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select tenant_kind::text from api.my_tenant_memberships
          where tenant_id = 'a1111111-1111-1111-1111-111111111111' $q$),
  'demo',
  'Alice reads the correct tenant_kind for Tenant A'
);

-- Alice cannot see Bob's row nor Tenant B through the facade.
select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.my_tenant_memberships
          where tenant_id = 'b2222222-2222-2222-2222-222222222222' $q$),
  0,
  'Alice cannot see Tenant B through the facade'
);

-- --- Behavioral: Bob reads only his own active membership ------------------
select is(
  pg_temp.as_auth_count('0a0a0a0a-0000-0000-0000-000000000002',
    'select count(*)::int from api.my_tenant_memberships'),
  1,
  'Bob sees exactly one row (his own active membership) via the facade'
);
select is(
  pg_temp.as_auth_text('0a0a0a0a-0000-0000-0000-000000000002',
    'select tenant_id::text from api.my_tenant_memberships'),
  'a1111111-1111-1111-1111-111111111111',
  'Bob sees only his own Tenant A membership (not Alice''s separate row)'
);

-- --- Behavioral: only ACTIVE memberships are returned ----------------------
-- Multi holds active(A) + invited(B) + suspended(C) + revoked(D); the facade
-- returns only the single ACTIVE membership (Tenant A).
select is(
  pg_temp.as_auth_count('0c0c0c0c-0000-0000-0000-000000000004',
    'select count(*)::int from api.my_tenant_memberships'),
  1,
  'Multi sees only the ACTIVE membership; invited/suspended/revoked are excluded'
);
select is(
  pg_temp.as_auth_text('0c0c0c0c-0000-0000-0000-000000000004',
    'select tenant_id::text from api.my_tenant_memberships'),
  'a1111111-1111-1111-1111-111111111111',
  'Multi''s only facade row is the active Tenant A membership'
);

-- --- Behavioral: no JWT sub -> zero rows (fail-closed) ---------------------
select is(
  pg_temp.as_auth_count('',
    'select count(*)::int from api.my_tenant_memberships'),
  0,
  'authenticated with no JWT sub sees zero rows via the facade'
);

select * from finish();
rollback;
