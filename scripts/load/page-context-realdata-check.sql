-- Read-only real-data check of api.my_page_context on Cloud DEV (0143).
-- For every user: as role authenticated with that user's JWT claims, compare each key
-- with the direct read of its source; then, as the owner role, check against the base
-- tables that every invitation returned is addressed to that user and pending, and every
-- membership / location / navigation row belongs to a tenant where the user is active.
-- Ends with RAISE EXCEPTION, so the whole block is rolled back and nothing persists.
do $chk$
declare
  u record;
  ctx jsonb; d_m jsonb; d_n jsonb; d_l jsonb; d_p jsonb; d_e jsonb; d_t jsonb;
  n_users int := 0; n_mem int := 0; n_inv_e int := 0; n_inv_t int := 0; n_inactive_loc int := 0;
  mism text[] := '{}';
  leaks text[] := '{}';
  bad int;
  v_emp record; v_tenant uuid; v_target uuid; v_inviter uuid; v_target_seen_e int; v_target_seen_t int;
begin
  -- temporary pending invitations (rolled back with the block): an active member of a
  -- tenant that has a Manager/Owner, so every other member of that tenant must NOT see them
  select m.user_id, m.tenant_id into v_target, v_tenant from core.tenant_memberships m
   where m.status = 'active'
     and not exists (select 1 from core.role_assignments ra where ra.tenant_id = m.tenant_id and ra.user_id = m.user_id
                      and ra.role_id in ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005'))
     and exists (select 1 from core.role_assignments ra where ra.tenant_id = m.tenant_id
                      and ra.role_id in ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005'))
     and exists (select 1 from workforce.employees e where e.tenant_id = m.tenant_id)
   order by m.tenant_id, m.user_id limit 1;
  select e.id, e.tenant_id into v_emp
    from workforce.employees e
   where e.tenant_id = v_tenant
     and not exists (select 1 from workforce.employee_invitations i where i.employee_id = e.id and i.status = 'pending')
   order by e.created_at limit 1;
  select ra.user_id into v_inviter from core.role_assignments ra
   where ra.tenant_id = v_emp.tenant_id and ra.role_id in ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000005')
   limit 1;
  insert into workforce.employee_invitations (tenant_id, employee_id, target_user_id, status, invited_by)
    values (v_emp.tenant_id, v_emp.id, v_target, 'pending', v_inviter);
  insert into core.tenant_invitations (tenant_id, target_user_id, role_key, location_id, status, invited_by)
    values (v_emp.tenant_id, v_target, 'manager', null, 'pending', v_inviter);

  for u in select id from core.users order by id loop
    n_users := n_users + 1;
    perform set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u.id::text, true);
    execute 'set local role authenticated';
    ctx := api.my_page_context();
    select coalesce(jsonb_agg(jsonb_build_object('tenant_id', tenant_id, 'tenant_slug', tenant_slug, 'tenant_name', tenant_name, 'tenant_kind', tenant_kind, 'location_id', location_id, 'status', status)), '[]') into d_m from api.my_tenant_memberships;
    select coalesce(jsonb_agg(jsonb_build_object('tenant_id', tenant_id, 'module', module, 'nav_order', nav_order)), '[]') into d_n from api.my_tenant_navigation;
    select coalesce(jsonb_agg(jsonb_build_object('tenant_id', tenant_id, 'location_id', location_id, 'location_name', location_name, 'timezone', timezone, 'is_active', is_active)), '[]') into d_l from api.my_tenant_locations;
    select coalesce(jsonb_agg(jsonb_build_object('tenant_id', tenant_id, 'package_code', package_code, 'status', status, 'sort_order', sort_order)), '[]') into d_p from api.my_tenant_packages where status = 'active';
    select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at, e.invitation_id), '[]') into d_e from api.my_pending_employee_invitations() e;
    select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at, t.invitation_id), '[]') into d_t from api.my_pending_tenant_invitations() t;
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);

    if not (jsonb_array_length((ctx->'memberships')) = jsonb_array_length(d_m) and (ctx->'memberships') @> d_m and d_m @> (ctx->'memberships')) then mism := mism || (left(u.id::text, 8) || ':memberships'); end if;
    if not (jsonb_array_length((ctx->'navigation')) = jsonb_array_length(d_n) and (ctx->'navigation') @> d_n and d_n @> (ctx->'navigation')) then mism := mism || (left(u.id::text, 8) || ':navigation'); end if;
    if not (jsonb_array_length((ctx->'locations')) = jsonb_array_length(d_l) and (ctx->'locations') @> d_l and d_l @> (ctx->'locations')) then mism := mism || (left(u.id::text, 8) || ':locations'); end if;
    if not (jsonb_array_length((ctx->'packages')) = jsonb_array_length(d_p) and (ctx->'packages') @> d_p and d_p @> (ctx->'packages')) then mism := mism || (left(u.id::text, 8) || ':packages'); end if;
    if (ctx->'employeeInvitations') is distinct from d_e then mism := mism || (left(u.id::text, 8) || ':employeeInvitations'); end if;
    if (ctx->'tenantInvitations') is distinct from d_t then mism := mism || (left(u.id::text, 8) || ':tenantInvitations'); end if;

    -- base-table leak checks (owner role, RLS not in the way)
    select count(*) into bad from jsonb_array_elements((ctx->'employeeInvitations')) r
      where not exists (select 1 from workforce.employee_invitations i
                         where i.id = (r->>'invitation_id')::uuid and i.target_user_id = u.id and i.status = 'pending');
    if bad > 0 then leaks := leaks || (left(u.id::text, 8) || ':employeeInvitations=' || bad); end if;
    select count(*) into bad from jsonb_array_elements((ctx->'tenantInvitations')) r
      where not exists (select 1 from core.tenant_invitations i
                         where i.id = (r->>'invitation_id')::uuid and i.target_user_id = u.id and i.status = 'pending');
    if bad > 0 then leaks := leaks || (left(u.id::text, 8) || ':tenantInvitations=' || bad); end if;
    select count(*) into bad from jsonb_array_elements((ctx->'memberships') || (ctx->'locations') || (ctx->'navigation') || (ctx->'packages')) r
      where not exists (select 1 from core.tenant_memberships m
                         where m.tenant_id = (r->>'tenant_id')::uuid and m.user_id = u.id and m.status = 'active')
        and not exists (select 1 from core.users pu where pu.id = u.id and pu.is_platform_staff);
    if bad > 0 then leaks := leaks || (left(u.id::text, 8) || ':tenantRows=' || bad); end if;

    if u.id = v_target then
      v_target_seen_e := jsonb_array_length((ctx->'employeeInvitations'));
      v_target_seen_t := jsonb_array_length((ctx->'tenantInvitations'));
    end if;
    if jsonb_array_length((ctx->'memberships')) > 0 then n_mem := n_mem + 1; end if;
    n_inv_e := n_inv_e + jsonb_array_length((ctx->'employeeInvitations'));
    n_inv_t := n_inv_t + jsonb_array_length((ctx->'tenantInvitations'));
    select n_inactive_loc + count(*) into n_inactive_loc from jsonb_array_elements((ctx->'locations')) r where (r->>'is_active')::boolean = false;
  end loop;

  raise exception 'TEMP_INVITES tenant=% target=% target_sees_emp=% target_sees_tenant=% | RESULT users=% with_membership=% emp_inv_rows=% tenant_inv_rows=% inactive_location_rows=% | db: suspended/revoked/invited memberships=% pending emp inv=% (other states=%) pending tenant inv=% (other states=%) removed packages=% disabled modules=% | MISMATCHES=% | LEAKS=%',
    left(v_emp.tenant_id::text, 8), left(v_target::text, 8), v_target_seen_e, v_target_seen_t,
    n_users, n_mem, n_inv_e, n_inv_t, n_inactive_loc,
    (select count(*) from core.tenant_memberships where status <> 'active'),
    (select count(*) from workforce.employee_invitations where status = 'pending'),
    (select count(*) from workforce.employee_invitations where status <> 'pending'),
    (select count(*) from core.tenant_invitations where status = 'pending'),
    (select count(*) from core.tenant_invitations where status <> 'pending'),
    (select count(*) from core.tenant_packages where status <> 'active'),
    (select count(*) from core.tenant_modules where not is_enabled),
    mism, leaks;
end
$chk$;
