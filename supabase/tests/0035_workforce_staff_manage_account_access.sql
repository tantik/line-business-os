-- ============================================================================
-- DB test: api.workforce_staff_manage.has_account_access (migration
--          0067_workforce_staff_manage_account_access.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves: has_account_access reflects user_id is/is not null, and no raw
-- user_id column is exposed by the view.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce, api;
select no_plan();

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_staff_manage' and column_name = 'user_id'),
  0,
  'api.workforce_staff_manage does not expose a raw user_id column'
);

create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end;
$$;

insert into core.tenants (id, slug, name) values
  ('dd000000-0000-0000-0000-000000000001', 'pgtap-account-access', 'pgTAP Account Access');
insert into core.locations (id, tenant_id, name) values
  ('dd100000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001', 'Loc');
insert into core.users (id, display_name) values
  ('dd200000-0000-0000-0000-000000000001', 'Manager'),
  ('dd200000-0000-0000-0000-000000000002', 'Bound Employee');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('dd000000-0000-0000-0000-000000000001', 'dd200000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005', 'dd100000-0000-0000-0000-000000000001');
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('dd300000-0000-0000-0000-000000000001', 'dd000000-0000-0000-0000-000000000001',
   'dd100000-0000-0000-0000-000000000001', null, '\x00'), -- not bound
  ('dd300000-0000-0000-0000-000000000002', 'dd000000-0000-0000-0000-000000000001',
   'dd100000-0000-0000-0000-000000000001', 'dd200000-0000-0000-0000-000000000002', '\x00'); -- bound

select is(
  pg_temp.as_auth_count('dd200000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_staff_manage
          where staff_id = 'dd300000-0000-0000-0000-000000000001' and has_account_access = false $q$),
  1,
  'unbound employee has has_account_access = false'
);
select is(
  pg_temp.as_auth_count('dd200000-0000-0000-0000-000000000001',
    $q$ select count(*)::int from api.workforce_staff_manage
          where staff_id = 'dd300000-0000-0000-0000-000000000002' and has_account_access = true $q$),
  1,
  'bound employee has has_account_access = true'
);

select * from finish();
rollback;
