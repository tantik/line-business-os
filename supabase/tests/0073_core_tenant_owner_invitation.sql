-- ============================================================================
-- DB test: migration 0134 (role-aware Owner invitation, 4B-2).
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--   A  grants: service functions are service_role only; accept / my_pending /
--      is_platform_staff are authenticated only; table closed for writes
--   B  create: refusals (non-staff, unknown request, tenant mismatch, bad
--      email blob/hash), then the happy path: core.users with the protected
--      email, pending owner invitation, status invite_sent, audit row
--   C  retry / resend with the same target refreshes the same row;
--      another target while pending is refused; never overwrites an email
--   D  visibility: the target sees its own pending row, others see nothing
--   E  accept: other user refused; target accepts -> membership + owner role
--      + accepted + status ready + audit; second accept idempotent
--   F  expired / revoked refused
--   G  set_provisioning_status: invite_failed, never downgrade, ready rules
-- ============================================================================
begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit;

select no_plan();

insert into core.users (id, display_name, is_platform_staff) values
  ('b1340000-0000-0000-0000-000000000001', 'ORUWA staff', true),
  ('b1340000-0000-0000-0000-000000000002', 'Not staff', false);
-- Auth-side users the "Edge Function" resolved (no core.users row yet, like a fresh invite)
-- b...0010 = the Owner, b...0011 = another person, b...0012 = owner of the F tenants

create function pg_temp.payload(p_slug text) returns jsonb language sql as $$
  select jsonb_build_object(
    'slug', p_slug, 'business_name', 'pgTAP Owner ' || p_slug,
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

create function pg_temp.svc_err(p_sql text) returns text language plpgsql as $$
begin
  set local role service_role;
  execute p_sql;
  reset role;
  return 'ok';
exception when others then
  reset role;
  return sqlstate || ' ' || sqlerrm;
end $$;

-- run p_sql as an authenticated user with the given sub; returns the jsonb result or 'ERR <state> <msg>'
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

-- fake protected email: 29+ byte blob, 64-hex blind index (the real ones come from the Edge Function)
create function pg_temp.blob() returns bytea language sql as $$ select decode(repeat('ab', 40), 'hex') $$;
create function pg_temp.hash(p text) returns text language sql as $$ select encode(extensions.digest(p, 'sha256'), 'hex') $$;

-- A: grants --------------------------------------------------------------------------------
select is(has_function_privilege('authenticated', 'core.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid)', 'execute'), false, 'A: authenticated cannot create owner invitations (core)');
select is(has_function_privilege('authenticated', 'api.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid)', 'execute'), false, 'A: authenticated cannot create owner invitations (api)');
select is(has_function_privilege('anon', 'api.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid)', 'execute'), false, 'A: anon cannot create owner invitations');
select is(has_function_privilege('authenticated', 'api.set_provisioning_status(uuid, text, text, uuid)', 'execute'), false, 'A: authenticated cannot set provisioning status');
select is(has_function_privilege('anon', 'core.set_provisioning_status(uuid, text, text, uuid)', 'execute'), false, 'A: anon cannot set provisioning status');
select is(has_function_privilege('service_role', 'api.create_tenant_owner_invitation(uuid, uuid, uuid, bytea, text, uuid)', 'execute'), true, 'A: service_role can create owner invitations');
select is(has_function_privilege('service_role', 'api.set_provisioning_status(uuid, text, text, uuid)', 'execute'), true, 'A: service_role can set provisioning status');
select is(has_function_privilege('anon', 'api.accept_tenant_invitation(uuid)', 'execute'), false, 'A: anon cannot accept');
select is(has_function_privilege('authenticated', 'api.accept_tenant_invitation(uuid)', 'execute'), true, 'A: authenticated can call accept');
select is(has_function_privilege('anon', 'api.my_pending_tenant_invitations()', 'execute'), false, 'A: anon cannot list invitations');
select is(has_function_privilege('anon', 'api.is_platform_staff()', 'execute'), false, 'A: anon cannot call is_platform_staff');
select is(has_table_privilege('authenticated', 'core.tenant_invitations', 'insert'), false, 'A: no direct insert for authenticated');
select is(has_table_privilege('authenticated', 'core.tenant_invitations', 'update'), false, 'A: no direct update for authenticated');
select is(has_table_privilege('anon', 'core.tenant_invitations', 'select'), false, 'A: anon cannot read invitations');
select is(has_table_privilege('service_role', 'core.tenant_invitations', 'insert'), false, 'A: service_role writes only through the functions');
select is((select relrowsecurity from pg_class where oid = 'core.tenant_invitations'::regclass), true, 'A: RLS enabled');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'api' and p.proname in ('create_tenant_owner_invitation', 'set_provisioning_status', 'accept_tenant_invitation',
                                                      'my_pending_tenant_invitations', 'is_platform_staff') and p.prosecdef), 0,
  'A: every new api wrapper is SECURITY INVOKER (ADR 0008)');
select matches(pg_temp.as_user('b1340000-0000-0000-0000-000000000001',
  $$ select api.create_tenant_owner_invitation(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), pg_temp.blob(), pg_temp.hash('x'), 'b1340000-0000-0000-0000-000000000001')::text $$),
  '^ERR 42501', 'A: a signed-in platform-staff browser session still cannot create invitations');
select matches(pg_temp.as_user('b1340000-0000-0000-0000-000000000001',
  $$ select api.set_provisioning_status(gen_random_uuid(), 'ready', null, 'b1340000-0000-0000-0000-000000000001')::text $$),
  '^ERR 42501', 'A: ... nor set provisioning status');
select is(pg_temp.anon_err($$ select api.accept_tenant_invitation(gen_random_uuid()) $$), '42501', 'A: anon accept refused');
select is(pg_temp.as_user('b1340000-0000-0000-0000-000000000001', $$ select api.is_platform_staff()::text $$), 'true', 'A: is_platform_staff true for staff');
select is(pg_temp.as_user('b1340000-0000-0000-0000-000000000002', $$ select api.is_platform_staff()::text $$), 'false', 'A: is_platform_staff false for others');

-- provision two tenants (0133) ----------------------------------------------------------------
create temp table res (label text primary key, r jsonb);
insert into res select 'p1', pg_temp.svc($$ select api.provision_tenant('b1340000-0000-0000-0000-0000000000c1', pg_temp.payload('pgtap-0134-c'), 'b1340000-0000-0000-0000-000000000001') $$);
insert into res select 'p2', pg_temp.svc($$ select api.provision_tenant('b1340000-0000-0000-0000-0000000000c2', pg_temp.payload('pgtap-0134-d'), 'b1340000-0000-0000-0000-000000000001') $$);
create temp table ids as
  select (select (r ->> 'tenant_id')::uuid from res where label = 'p1') as t1,
         (select (r ->> 'tenant_id')::uuid from res where label = 'p2') as t2;
grant select on ids to authenticated, service_role;
grant select on res to authenticated, service_role;

-- B: create ------------------------------------------------------------------------------------
select matches(pg_temp.svc_err($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000c1', (select t1 from ids),
    'b1340000-0000-0000-0000-000000000010', pg_temp.blob(), pg_temp.hash('owner'), 'b1340000-0000-0000-0000-000000000002') $$),
  '^42501 actor_not_platform_staff', 'B: non-staff actor refused');
select matches(pg_temp.svc_err($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000ff', (select t1 from ids),
    'b1340000-0000-0000-0000-000000000010', pg_temp.blob(), pg_temp.hash('owner'), 'b1340000-0000-0000-0000-000000000001') $$),
  'request_not_found', 'B: unknown request refused');
select matches(pg_temp.svc_err($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000c1', (select t2 from ids),
    'b1340000-0000-0000-0000-000000000010', pg_temp.blob(), pg_temp.hash('owner'), 'b1340000-0000-0000-0000-000000000001') $$),
  'request_tenant_mismatch', 'B: tenant of another request refused');
select matches(pg_temp.svc_err($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000c1', (select t1 from ids),
    'b1340000-0000-0000-0000-000000000010', pg_temp.blob(), 'owner@example.com', 'b1340000-0000-0000-0000-000000000001') $$),
  '^22023 ', 'B: a plaintext email as the hash is refused');
select matches(pg_temp.svc_err($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000c1', (select t1 from ids),
    'b1340000-0000-0000-0000-000000000010', convert_to('owner@example.com', 'UTF8'), pg_temp.hash('owner'), 'b1340000-0000-0000-0000-000000000001') $$),
  '^22023 ', 'B: a too-short (plaintext) blob is refused');
select is((select count(*)::int from core.tenant_invitations), 0, 'B: refusals wrote no invitation');
select is((select count(*)::int from core.users where id = 'b1340000-0000-0000-0000-000000000010'), 0, 'B: refusals wrote no user row');

insert into res select 'b', pg_temp.svc($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000c1', (select t1 from ids),
    'b1340000-0000-0000-0000-000000000010', pg_temp.blob(), pg_temp.hash('owner'), 'b1340000-0000-0000-0000-000000000001') $$);
select is((select r ->> 'status' || '/' || (r ->> 'was_resend') from res where label = 'b'), 'invite_sent/false', 'B: invitation created');
select is((select email_hash = pg_temp.hash('owner') and email_encrypted = pg_temp.blob() and display_name is null
             from core.users where id = 'b1340000-0000-0000-0000-000000000010'), true,
  'B: core.users row holds only the encrypted email + blind index');
select is((select role_key || '/' || status || '/' || coalesce(location_id::text, 'null') || '/' || provisioning_request_id || '/' || invited_by
             from core.tenant_invitations where id = (select (r ->> 'invitation_id')::uuid from res where label = 'b')),
  'tenant_owner/pending/null/b1340000-0000-0000-0000-0000000000c1/b1340000-0000-0000-0000-000000000001', 'B: pending tenant-wide owner invitation');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
             from core.tenant_invitations where id = (select (r ->> 'invitation_id')::uuid from res where label = 'b')), 'B: expires in 7 days');
select is((select status || '/' || step from core.tenant_provisioning where request_id = 'b1340000-0000-0000-0000-0000000000c1'),
  'invite_sent/invite', 'B: provisioning status invite_sent');
select is((select count(*)::int from audit.audit_logs where tenant_id = (select t1 from ids) and entity = 'tenant_invitation' and action = 'invite'),
  1, 'B: one invite audit row');
select ok((select (after::text || metadata::text) !~ '(@|email|\\x)'
             from audit.audit_logs where tenant_id = (select t1 from ids) and entity = 'tenant_invitation' and action = 'invite'),
  'B: the audit row carries no email (plain or protected)');
select is((select count(*)::int from core.tenant_memberships where tenant_id = (select t1 from ids)), 0, 'B: no membership before acceptance');

-- C: retry / resend ----------------------------------------------------------------------------
update core.tenant_provisioning set status = 'invite_failed', step = 'invite', error_code = 'auth_invite_failed'
 where request_id = 'b1340000-0000-0000-0000-0000000000c1';
insert into res select 'c', pg_temp.svc($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000c1', (select t1 from ids),
    'b1340000-0000-0000-0000-000000000010', decode(repeat('cd', 40), 'hex'), pg_temp.hash('other'), 'b1340000-0000-0000-0000-000000000001') $$);
select is((select r ->> 'invitation_id' from res where label = 'c'), (select r ->> 'invitation_id' from res where label = 'b'), 'C: retry refreshes the same pending row');
select is((select (r ->> 'was_resend')::boolean from res where label = 'c'), true, 'C: flagged as resend');
select is((select count(*)::int from core.tenant_invitations where tenant_id = (select t1 from ids)), 1, 'C: still one invitation');
select is((select status || '/' || coalesce(error_code, 'null') from core.tenant_provisioning where request_id = 'b1340000-0000-0000-0000-0000000000c1'),
  'invite_sent/null', 'C: invite_failed -> invite_sent on retry');
select is((select email_hash from core.users where id = 'b1340000-0000-0000-0000-000000000010'), pg_temp.hash('owner'), 'C: an existing email is never overwritten');
select matches(pg_temp.svc_err($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000c1', (select t1 from ids),
    'b1340000-0000-0000-0000-000000000011', pg_temp.blob(), pg_temp.hash('someone'), 'b1340000-0000-0000-0000-000000000001') $$),
  'owner_invitation_conflict', 'C: another target while one is pending is refused');

-- D: visibility ---------------------------------------------------------------------------------
insert into core.users (id) values ('b1340000-0000-0000-0000-000000000011');
select is(pg_temp.as_user('b1340000-0000-0000-0000-000000000010', $$ select count(*)::text from core.tenant_invitations $$), '1', 'D: target sees its own pending row (RLS)');
select is(pg_temp.as_user('b1340000-0000-0000-0000-000000000011', $$ select count(*)::text from core.tenant_invitations $$), '0', 'D: another user sees nothing (RLS)');
select is(pg_temp.as_user('b1340000-0000-0000-0000-000000000010', $$ select tenant_name || '/' || role_key || '/' || is_expired from api.my_pending_tenant_invitations() $$),
  'pgTAP Owner pgtap-0134-c/tenant_owner/false', 'D: my_pending_tenant_invitations lists it with the tenant name');
select is(pg_temp.as_user('b1340000-0000-0000-0000-000000000011', $$ select count(*)::text from api.my_pending_tenant_invitations() $$), '0', 'D: ... and nothing for another user');

-- E: accept --------------------------------------------------------------------------------------
select matches(pg_temp.as_user('b1340000-0000-0000-0000-000000000011',
  format($$ select api.accept_tenant_invitation(%L)::text $$, (select r ->> 'invitation_id' from res where label = 'b'))),
  '^ERR P0001 invitation_not_acceptable', 'E: another user cannot accept');
select matches(pg_temp.as_user('b1340000-0000-0000-0000-000000000001',
  format($$ select api.accept_tenant_invitation(%L)::text $$, (select r ->> 'invitation_id' from res where label = 'b'))),
  '^ERR P0001 invitation_not_acceptable', 'E: not even platform staff can accept someone else''s invitation');
select is((select count(*)::int from core.tenant_memberships where tenant_id = (select t1 from ids)), 0, 'E: refused accepts wrote nothing');

insert into res select 'e', pg_temp.as_user('b1340000-0000-0000-0000-000000000010',
  format($$ select api.accept_tenant_invitation(%L)::text $$, (select r ->> 'invitation_id' from res where label = 'b')))::jsonb;
select is((select r ->> 'role_key' || '/' || (r ->> 'idempotent') from res where label = 'e'), 'tenant_owner/false', 'E: target accepts');
select is((select status::text from core.tenant_memberships where tenant_id = (select t1 from ids) and user_id = 'b1340000-0000-0000-0000-000000000010'),
  'active', 'E: active membership');
select is((select string_agg(r.key || '@' || coalesce(ra.location_id::text, 'tenant'), ',') from core.role_assignments ra join core.roles r on r.id = ra.role_id
            where ra.tenant_id = (select t1 from ids) and ra.user_id = 'b1340000-0000-0000-0000-000000000010'),
  'tenant_owner@tenant', 'E: one tenant-wide tenant_owner role');
select is((select status || '/' || (accepted_at is not null) from core.tenant_invitations where id = (select (r ->> 'invitation_id')::uuid from res where label = 'b')),
  'accepted/true', 'E: invitation accepted');
select is((select status || '/' || step from core.tenant_provisioning where request_id = 'b1340000-0000-0000-0000-0000000000c1'),
  'ready/ready', 'E: provisioning ready once the Owner is in');
select is((select actor_id::text from audit.audit_logs where tenant_id = (select t1 from ids) and entity = 'tenant_invitation' and action = 'accept'),
  'b1340000-0000-0000-0000-000000000010', 'E: accept audited with the owner as actor');
select is(pg_temp.as_user('b1340000-0000-0000-0000-000000000010', $$ select core.has_permission((select t1 from ids), 'core.member.invite')::text $$),
  'true', 'E: the owner now holds owner permissions');

insert into res select 'e2', pg_temp.as_user('b1340000-0000-0000-0000-000000000010',
  format($$ select api.accept_tenant_invitation(%L)::text $$, (select r ->> 'invitation_id' from res where label = 'b')))::jsonb;
select is((select (r ->> 'idempotent')::boolean from res where label = 'e2'), true, 'E: second accept is idempotent');
select is((select count(*)::int from core.role_assignments where tenant_id = (select t1 from ids)), 1, 'E: still one role assignment');
select is((select count(*)::int from core.tenant_memberships where tenant_id = (select t1 from ids)), 1, 'E: still one membership');
select is((select count(*)::int from audit.audit_logs where tenant_id = (select t1 from ids) and action = 'accept'), 1, 'E: no second accept audit row');
select matches(pg_temp.svc_err($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000c1', (select t1 from ids),
    'b1340000-0000-0000-0000-000000000010', pg_temp.blob(), pg_temp.hash('owner'), 'b1340000-0000-0000-0000-000000000001') $$),
  'request_not_invitable', 'E: a ready request takes no new owner invitation');
select is(pg_temp.as_user('b1340000-0000-0000-0000-000000000010', $$ select count(*)::text from api.my_pending_tenant_invitations() $$), '0', 'E: nothing pending any more');

-- F: expired / revoked -------------------------------------------------------------------------------
insert into res select 'f', pg_temp.svc($$ select api.create_tenant_owner_invitation('b1340000-0000-0000-0000-0000000000c2', (select t2 from ids),
    'b1340000-0000-0000-0000-000000000012', pg_temp.blob(), pg_temp.hash('owner2'), 'b1340000-0000-0000-0000-000000000001') $$);
update core.tenant_invitations set expires_at = now() - interval '1 minute' where id = (select (r ->> 'invitation_id')::uuid from res where label = 'f');
select matches(pg_temp.as_user('b1340000-0000-0000-0000-000000000012',
  format($$ select api.accept_tenant_invitation(%L)::text $$, (select r ->> 'invitation_id' from res where label = 'f'))),
  '^ERR P0001 invitation_not_acceptable', 'F: expired invitation refused');
select is(pg_temp.as_user('b1340000-0000-0000-0000-000000000012', $$ select is_expired::text from api.my_pending_tenant_invitations() $$), 'true', 'F: listed as expired');
update core.tenant_invitations set expires_at = now() + interval '1 day', status = 'revoked', revoked_at = now()
 where id = (select (r ->> 'invitation_id')::uuid from res where label = 'f');
select matches(pg_temp.as_user('b1340000-0000-0000-0000-000000000012',
  format($$ select api.accept_tenant_invitation(%L)::text $$, (select r ->> 'invitation_id' from res where label = 'f'))),
  '^ERR P0001 invitation_not_acceptable', 'F: revoked invitation refused');
select is((select count(*)::int from core.tenant_memberships where tenant_id = (select t2 from ids)), 0, 'F: no membership from refused accepts');
select matches(pg_temp.as_user('b1340000-0000-0000-0000-000000000012', $$ select api.accept_tenant_invitation(gen_random_uuid())::text $$),
  '^ERR P0001 invitation_not_acceptable', 'F: unknown id refused the same way');

-- G: set_provisioning_status ---------------------------------------------------------------------------
-- t2's request is invite_sent (F created it); move it back to a fresh state for the checks via a third tenant
insert into res select 'p3', pg_temp.svc($$ select api.provision_tenant('b1340000-0000-0000-0000-0000000000c3', pg_temp.payload('pgtap-0134-g'), 'b1340000-0000-0000-0000-000000000001') $$);
select matches(pg_temp.svc_err($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c3', 'invite_failed', null, 'b1340000-0000-0000-0000-000000000001') $$),
  '^22023 ', 'G: invite_failed needs an error code');
select matches(pg_temp.svc_err($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c3', 'invite_failed', 'Owner owner@example.com', 'b1340000-0000-0000-0000-000000000001') $$),
  '^22023 ', 'G: free text (possible PII) is not an error code');
select matches(pg_temp.svc_err($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c3', 'db_done', null, 'b1340000-0000-0000-0000-000000000001') $$),
  '^22023 ', 'G: only invite_failed / invite_sent / ready can be set');
select matches(pg_temp.svc_err($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c3', 'invite_failed', 'auth_invite_failed', 'b1340000-0000-0000-0000-000000000002') $$),
  '^42501 ', 'G: non-staff actor refused');
select is(pg_temp.svc($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c3', 'invite_failed', 'auth_invite_failed', 'b1340000-0000-0000-0000-000000000001') $$) ->> 'status',
  'invite_failed', 'G: db_done -> invite_failed');
select is((select error_code from core.tenant_provisioning where request_id = 'b1340000-0000-0000-0000-0000000000c3'), 'auth_invite_failed', 'G: machine code stored');
select matches(pg_temp.svc_err($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c3', 'invite_sent', null, 'b1340000-0000-0000-0000-000000000001') $$),
  'owner_invitation_missing', 'G: invite_sent needs an owner invitation');
select matches(pg_temp.svc_err($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c3', 'ready', null, 'b1340000-0000-0000-0000-000000000001') $$),
  'owner_not_accepted', 'G: ready needs an accepted owner');
select is(pg_temp.svc($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c1', 'invite_failed', 'late_error', 'b1340000-0000-0000-0000-000000000001') $$) ->> 'status',
  'ready', 'G: a ready request is never downgraded');
select is(pg_temp.svc($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c2', 'invite_failed', 'late_error', 'b1340000-0000-0000-0000-000000000001') $$) ->> 'status',
  'invite_sent', 'G: invite_sent is never downgraded to invite_failed');
select is(pg_temp.svc($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c1', 'ready', null, 'b1340000-0000-0000-0000-000000000001') $$) ->> 'idempotent',
  'true', 'G: ready again is an idempotent no-op');
select is((select count(*)::int from audit.audit_logs where tenant_id = (select (r ->> 'tenant_id')::uuid from res where label = 'p3') and action = 'provision_status'),
  1, 'G: one audit row per real status change');
select is(pg_temp.svc($$ select api.mark_provisioning_failed('b1340000-0000-0000-0000-0000000000c3', 'pgtap-0134-g', 'late_error', 'b1340000-0000-0000-0000-000000000001') $$) ->> 'status',
  'invite_failed', 'G: mark_provisioning_failed never downgrades invite_failed to failed_db');
insert into core.tenant_provisioning (request_id, slug, status, step, error_code, created_by)
values ('b1340000-0000-0000-0000-0000000000c4', 'pgtap-0134-failed', 'failed_db', 'db', 'x', 'b1340000-0000-0000-0000-000000000001');
select matches(pg_temp.svc_err($$ select api.set_provisioning_status('b1340000-0000-0000-0000-0000000000c4', 'invite_failed', 'x', 'b1340000-0000-0000-0000-000000000001') $$),
  'request_not_provisioned', 'G: no invite status without a provisioned tenant');

select * from finish();
rollback;
