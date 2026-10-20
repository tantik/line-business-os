-- ============================================================================
-- DB test: migration 0135 (platform-staff provisioning list, 4B-3).
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  grants: authenticated only (anon refused); api wrapper SECURITY INVOKER
--   B  non-staff signed-in user refused (42501), anon refused
--   C  staff sees provisioning requests (with tenant, location, owner
--      invitation status) and a failed_db request without a tenant
--   D  p_request_id filter; owner invitation 'expired' derived
--   E  no PII: no user-id / email column in the result
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit;

select no_plan();

insert into core.users (id, display_name, is_platform_staff) values
  ('b1350000-0000-0000-0000-000000000001', 'ORUWA staff', true),
  ('b1350000-0000-0000-0000-000000000002', 'Not staff', false);

create function pg_temp.payload(p_slug text) returns jsonb language sql as $$
  select jsonb_build_object(
    'slug', p_slug, 'business_name', 'pgTAP List ' || p_slug,
    'location', jsonb_build_object('name', '本店', 'timezone', 'Asia/Tokyo'),
    'plan', jsonb_build_object('code', 'trial', 'trial_days', 30),
    'package_code', 'cafe', 'template_version', 3);
$$;

create function pg_temp.svc(p_sql text) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  set local role service_role;
  execute p_sql into v;
  reset role;
  return v;
end $$;

create function pg_temp.as_user(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
exception when others then
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  return 'ERR ' || sqlstate || ' ' || sqlerrm;
end $$;

create function pg_temp.anon_err(p_sql text) returns text language plpgsql as $$
begin
  set local role anon;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate;
end $$;

create function pg_temp.blob() returns bytea language sql as $$ select decode(repeat('ab', 40), 'hex') $$;
create function pg_temp.hash(p text) returns text language sql as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;

-- A: grants ------------------------------------------------------------------------------------
select is(has_function_privilege('anon', 'api.platform_tenant_provisioning_list(uuid)', 'execute'), false, 'A: anon cannot call the list (api)');
select is(has_function_privilege('anon', 'core.platform_tenant_provisioning_list(uuid)', 'execute'), false, 'A: anon cannot call the list (core)');
select is(has_function_privilege('authenticated', 'api.platform_tenant_provisioning_list(uuid)', 'execute'), true, 'A: authenticated can call (staff check inside)');
select is((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname = 'platform_tenant_provisioning_list'), false, 'A: api wrapper is SECURITY INVOKER (ADR 0008)');
select is((select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'core' and p.proname = 'platform_tenant_provisioning_list'), true, 'A: core function is SECURITY DEFINER');
select ok((select p.proconfig::text like '%search_path=%' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'core' and p.proname = 'platform_tenant_provisioning_list'), 'A: core function has a fixed search_path');

-- fixtures: one provisioned + invited tenant, one provisioned without invite, one failed_db request
create temp table res (label text primary key, r jsonb);
grant select on res to authenticated, service_role;
insert into res select 'p1', pg_temp.svc($$ select api.provision_tenant('b1350000-0000-0000-0000-0000000000a1', pg_temp.payload('pgtap-0135-a'), 'b1350000-0000-0000-0000-000000000001') $$);
insert into res select 'p2', pg_temp.svc($$ select api.provision_tenant('b1350000-0000-0000-0000-0000000000a2', pg_temp.payload('pgtap-0135-b'), 'b1350000-0000-0000-0000-000000000001') $$);
insert into res select 'inv', pg_temp.svc($$ select api.create_tenant_owner_invitation('b1350000-0000-0000-0000-0000000000a1',
    (select (r ->> 'tenant_id')::uuid from res where label = 'p1'),
    'b1350000-0000-0000-0000-000000000010', pg_temp.blob(), pg_temp.hash('owner-0135'), 'b1350000-0000-0000-0000-000000000001') $$);
insert into res select 'f', pg_temp.svc($$ select api.mark_provisioning_failed('b1350000-0000-0000-0000-0000000000a3', 'pgtap-0135-c', 'db_error', 'b1350000-0000-0000-0000-000000000001') $$);

-- B: refusals ------------------------------------------------------------------------------------
select matches(pg_temp.as_user('b1350000-0000-0000-0000-000000000002', $$ select count(*)::text from api.platform_tenant_provisioning_list() $$),
  '^ERR 42501 not_platform_staff', 'B: a signed-in non-staff user is refused');
select matches(pg_temp.as_user('b1350000-0000-0000-0000-000000000010', $$ select count(*)::text from api.platform_tenant_provisioning_list() $$),
  '^ERR 42501', 'B: the invited owner (no core.users staff flag) is refused');
select is(pg_temp.anon_err($$ select * from api.platform_tenant_provisioning_list() $$), '42501', 'B: anon refused');

-- C: staff view ------------------------------------------------------------------------------------
select is(pg_temp.as_user('b1350000-0000-0000-0000-000000000001',
  $$ select status || '/' || business_name || '/' || location_name || '/' || location_timezone || '/' || owner_invitation_status || '/' || template_code || '/' || template_version
       from api.platform_tenant_provisioning_list() where slug = 'pgtap-0135-a' $$),
  'invite_sent/pgTAP List pgtap-0135-a/本店/Asia/Tokyo/pending/cafe/3', 'C: invited request with tenant, location and owner invitation status');
select is(pg_temp.as_user('b1350000-0000-0000-0000-000000000001',
  $$ select status || '/' || coalesce(owner_invitation_status, 'none') from api.platform_tenant_provisioning_list() where slug = 'pgtap-0135-b' $$),
  'db_done/none', 'C: provisioned request without an owner invitation');
select is(pg_temp.as_user('b1350000-0000-0000-0000-000000000001',
  $$ select status || '/' || error_code || '/' || coalesce(tenant_id::text, 'no-tenant') || '/' || coalesce(business_name, 'no-name')
       from api.platform_tenant_provisioning_list() where slug = 'pgtap-0135-c' $$),
  'failed_db/db_error/no-tenant/no-name', 'C: failed_db request listed without a tenant');
select is(pg_temp.as_user('b1350000-0000-0000-0000-000000000001',
  $$ select (count(*) > 0)::text from api.platform_tenant_provisioning_list() where request_id is null $$),
  'true', 'C: tenants never provisioned through 4B (seed) are listed too');
select is(pg_temp.as_user('b1350000-0000-0000-0000-000000000001',
  $$ select count(*)::text from api.platform_tenant_provisioning_list() where slug like 'pgtap-0135-%' $$),
  '3', 'C: one row per request (no duplicates from the joins)');

-- D: filter + expired ----------------------------------------------------------------------------------
select is(pg_temp.as_user('b1350000-0000-0000-0000-000000000001',
  $$ select count(*)::text || '/' || min(slug) from api.platform_tenant_provisioning_list('b1350000-0000-0000-0000-0000000000a2') $$),
  '1/pgtap-0135-b', 'D: p_request_id returns exactly that request');
select is(pg_temp.as_user('b1350000-0000-0000-0000-000000000001',
  $$ select count(*)::text from api.platform_tenant_provisioning_list('b1350000-0000-0000-0000-0000000000ff') $$),
  '0', 'D: unknown request id -> no rows');
update core.tenant_invitations set expires_at = now() - interval '1 minute'
 where id = (select (r ->> 'invitation_id')::uuid from res where label = 'inv');
select is(pg_temp.as_user('b1350000-0000-0000-0000-000000000001',
  $$ select owner_invitation_status from api.platform_tenant_provisioning_list('b1350000-0000-0000-0000-0000000000a1') $$),
  'expired', 'D: a pending invitation past its expiry is reported as expired');

-- E: no PII columns ---------------------------------------------------------------------------------------
select is((select count(*)::int from unnest((select proargnames from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname = 'platform_tenant_provisioning_list')) a(name)
           where name ~ '(email|user|created_by|invited_by|phone|display_name)'), 0,
  'E: no email / user id / person column in the result');

select * from finish();
rollback;
