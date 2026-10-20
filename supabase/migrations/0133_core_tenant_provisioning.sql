-- ============================================================================
-- 0133 — Tenant provisioning in one transaction (Stage 4B, step 4B-1)
-- ----------------------------------------------------------------------------
-- Plan: docs/architecture/tenant-provisioning-plan-2026-10-18.md §2, §4, §7.
--
-- 1. core.tenant_provisioning: one status row per provisioning request
--    (request_id = idempotency key chosen by the caller). No PII: slug, status,
--    step, a machine error code and the template version only. service_role
--    reads it; writes happen only inside the functions below.
-- 2. core.provision_tenant(request_id, payload, actor): everything that is data
--    happens in ONE transaction, in this order:
--      tenant (client, active) -> location -> tenant plan (trial, trial_ends_at)
--      -> core.set_tenant_package (0129; after the plan, so min_plan_code
--      checks see it) -> workforce.schedule_settings -> workforce.shift_types
--      -> Operations HACCP templates / items / schedules (payload manifest,
--      generic per tenant: closes DEBT-100 at the DB level) -> status row
--      'db_done' -> one audit row (entity tenant, action provision).
--    Any failure raises and the whole transaction rolls back: never a
--    half-created tenant. A re-run with the same request_id after db_done
--    returns the stored result and writes nothing.
-- 3. core.mark_provisioning_failed: the caller (provision-tenant Edge
--    Function, 4B-2) records failed_db in a separate call after a rollback.
--
-- The payload is validated here again (the Edge Function validates first with
-- the pure TS validator, packages/db/scripts/provisioning-payload.ts). It never
-- carries plaintext PII: only whitelisted keys are accepted. The owner
-- invitation is NOT part of this step (see the 4B-1 report: the invitation
-- row needs an Auth user id and an employee row that only exist after the
-- Auth Admin call in 4B-2).
--
-- Security: SECURITY DEFINER functions live in core with a fixed search_path,
-- revoked from public / anon / authenticated, executable by service_role
-- only; the api.* wrappers are SECURITY INVOKER (ADR 0008). The actor must be
-- a core.users row with is_platform_staff = true (re-checked here even though
-- the Edge Function checks the caller's JWT first). Rate limit: 20
-- provisioning requests per platform user per rolling hour.
--
-- Rollback: explicit statements at the end of this file.
-- ============================================================================

-- --- status table ---------------------------------------------------------------
create table core.tenant_provisioning (
  request_id        uuid primary key,
  tenant_id         uuid references core.tenants(id) on delete set null,
  slug              text not null unique
                      check (length(slug) between 3 and 63 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status            text not null default 'requested'
                      check (status in ('requested', 'db_done', 'invite_sent', 'ready', 'failed_db', 'invite_failed')),
  step              text check (step is null or step ~ '^[a-z_]{1,40}$'),
  error_code        text check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'),
  template_code     text,
  template_version  integer check (template_version is null or template_version >= 1),
  created_by        uuid not null references core.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index tenant_provisioning_actor_idx on core.tenant_provisioning(created_by, created_at desc);
create index tenant_provisioning_tenant_idx on core.tenant_provisioning(tenant_id);
comment on table core.tenant_provisioning is
  'One row per tenant provisioning request (0133). request_id = caller idempotency key; slug reserved per request. States: requested -> db_done -> invite_sent -> ready, or failed_db / invite_failed. No PII (no names, emails, payload). Written only by core.provision_tenant / core.mark_provisioning_failed; read by service_role.';

create trigger set_updated_at before update on core.tenant_provisioning
  for each row execute function core.set_updated_at();

-- RLS on, no policy for any app role: deny-all for anon / authenticated; the
-- definer functions (owner) and service_role (bypassrls) are the only readers.
alter table core.tenant_provisioning enable row level security;
revoke all on core.tenant_provisioning from public, anon, authenticated, service_role;
grant select on core.tenant_provisioning to service_role;

-- --- payload validation (internal) -----------------------------------------------
-- Raises 'invalid_payload: <reason>' (22023). Cross-field rules that the
-- tables already enforce (numeric range only on numeric items, min <= max)
-- are left to the constraints: a violation aborts the whole transaction.
create or replace function core.validate_provisioning_payload(p jsonb)
returns void
language plpgsql stable security definer set search_path = core, public, pg_temp as $$
declare
  k text;
  v_slug text;
  v_text text;
  v_loc jsonb;
  v_plan jsonb;
  v_ss jsonb;
  v_el jsonb;
  v_item jsonb;
  v_codes text[] := '{}';
  v_pkg_version int;
  c_time constant text := '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$';
  c_reserved constant text[] := array['demo', 'admin', 'api', 'client-template', 'oruwa-local', 'mirawi-demo-salon'];
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'invalid_payload: payload must be an object' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('slug', 'business_name', 'location', 'plan', 'package_code', 'template_version',
                 'schedule_settings', 'shift_types', 'operations') then
      raise exception 'invalid_payload: unknown key %', k using errcode = '22023';
    end if;
  end loop;

  -- slug (rules of packages/db/scripts/onboard-tenant.ts validateTenantSlug; must arrive normalized)
  if jsonb_typeof(p -> 'slug') is distinct from 'string' then
    raise exception 'invalid_payload: slug is required' using errcode = '22023';
  end if;
  v_slug := p ->> 'slug';
  if v_slug <> lower(btrim(v_slug)) or length(v_slug) not between 3 and 63
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_payload: slug format' using errcode = '22023';
  end if;
  if v_slug = any (c_reserved) then
    raise exception 'invalid_payload: slug reserved' using errcode = '22023';
  end if;

  if jsonb_typeof(p -> 'business_name') is distinct from 'string'
     or length(btrim(p ->> 'business_name')) not between 1 and 200 then
    raise exception 'invalid_payload: business_name must be 1-200 characters' using errcode = '22023';
  end if;

  -- location
  v_loc := p -> 'location';
  if jsonb_typeof(v_loc) is distinct from 'object' then
    raise exception 'invalid_payload: location is required' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(v_loc) loop
    if k not in ('name', 'timezone') then
      raise exception 'invalid_payload: unknown location key %', k using errcode = '22023';
    end if;
  end loop;
  if jsonb_typeof(v_loc -> 'name') is distinct from 'string'
     or length(btrim(v_loc ->> 'name')) not between 1 and 200 then
    raise exception 'invalid_payload: location.name must be 1-200 characters' using errcode = '22023';
  end if;
  if v_loc ? 'timezone' then
    if jsonb_typeof(v_loc -> 'timezone') is distinct from 'string'
       or not exists (select 1 from pg_timezone_names where name = v_loc ->> 'timezone') then
      raise exception 'invalid_payload: location.timezone unknown' using errcode = '22023';
    end if;
  end if;

  -- plan
  v_plan := coalesce(p -> 'plan', '{}'::jsonb);
  if jsonb_typeof(v_plan) <> 'object' then
    raise exception 'invalid_payload: plan must be an object' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(v_plan) loop
    if k not in ('code', 'trial_days') then
      raise exception 'invalid_payload: unknown plan key %', k using errcode = '22023';
    end if;
  end loop;
  if v_plan ? 'code' and (jsonb_typeof(v_plan -> 'code') is distinct from 'string'
       or not exists (select 1 from core.entitlement_plans where code = v_plan ->> 'code' and is_active)) then
    raise exception 'invalid_payload: plan.code unknown' using errcode = '22023';
  end if;
  if v_plan ? 'trial_days' and (jsonb_typeof(v_plan -> 'trial_days') is distinct from 'number'
       or (v_plan ->> 'trial_days') !~ '^[0-9]+$' or (v_plan ->> 'trial_days')::numeric not between 1 and 90) then
    raise exception 'invalid_payload: plan.trial_days must be an integer 1-90' using errcode = '22023';
  end if;

  -- package + template version (the version must be the package's current one)
  if jsonb_typeof(p -> 'package_code') is distinct from 'string' then
    raise exception 'invalid_payload: package_code is required' using errcode = '22023';
  end if;
  select version into v_pkg_version from core.packages
   where code = p ->> 'package_code' and lifecycle_status in ('beta', 'ga');
  if v_pkg_version is null then
    raise exception 'invalid_payload: package_code unknown or not available' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'template_version') is distinct from 'number'
     or (p ->> 'template_version') !~ '^[0-9]+$'
     or (p ->> 'template_version')::numeric <> v_pkg_version then
    raise exception 'invalid_payload: template_version unknown for package %', p ->> 'package_code' using errcode = '22023';
  end if;

  -- schedule settings (optional; provisioning never switches auto-create on)
  if p ? 'schedule_settings' then
    v_ss := p -> 'schedule_settings';
    if jsonb_typeof(v_ss) <> 'object' then
      raise exception 'invalid_payload: schedule_settings must be an object' using errcode = '22023';
    end if;
    for k in select jsonb_object_keys(v_ss) loop
      if k not in ('required_headcount_by_weekday', 'max_monthly_hours', 'max_weekly_hours',
                   'max_days_per_week', 'auto_create_day_of_month', 'auto_create_enabled') then
        raise exception 'invalid_payload: unknown schedule_settings key %', k using errcode = '22023';
      end if;
    end loop;
    if v_ss ? 'required_headcount_by_weekday' and (
         jsonb_typeof(v_ss -> 'required_headcount_by_weekday') <> 'array'
         or jsonb_array_length(v_ss -> 'required_headcount_by_weekday') <> 7
         or exists (select 1 from jsonb_array_elements(v_ss -> 'required_headcount_by_weekday') e
                     where jsonb_typeof(e) <> 'number' or e::text !~ '^[0-9]+$' or e::text::numeric > 99)) then
      raise exception 'invalid_payload: required_headcount_by_weekday must be 7 integers 0-99' using errcode = '22023';
    end if;
    if v_ss ? 'max_monthly_hours' and (jsonb_typeof(v_ss -> 'max_monthly_hours') <> 'number'
         or (v_ss ->> 'max_monthly_hours') !~ '^[0-9]+$' or (v_ss ->> 'max_monthly_hours')::numeric > 744) then
      raise exception 'invalid_payload: max_monthly_hours must be an integer 0-744' using errcode = '22023';
    end if;
    if v_ss ? 'max_weekly_hours' and (jsonb_typeof(v_ss -> 'max_weekly_hours') <> 'number'
         or (v_ss ->> 'max_weekly_hours') !~ '^[0-9]+$' or (v_ss ->> 'max_weekly_hours')::numeric not between 1 and 168) then
      raise exception 'invalid_payload: max_weekly_hours must be an integer 1-168' using errcode = '22023';
    end if;
    if v_ss ? 'max_days_per_week' and (jsonb_typeof(v_ss -> 'max_days_per_week') <> 'number'
         or (v_ss ->> 'max_days_per_week') !~ '^[0-9]+$' or (v_ss ->> 'max_days_per_week')::numeric not between 1 and 7) then
      raise exception 'invalid_payload: max_days_per_week must be an integer 1-7' using errcode = '22023';
    end if;
    if v_ss ? 'auto_create_day_of_month' and (jsonb_typeof(v_ss -> 'auto_create_day_of_month') <> 'number'
         or (v_ss ->> 'auto_create_day_of_month') !~ '^[0-9]+$' or (v_ss ->> 'auto_create_day_of_month')::numeric not between 1 and 28) then
      raise exception 'invalid_payload: auto_create_day_of_month must be an integer 1-28' using errcode = '22023';
    end if;
    if v_ss ? 'auto_create_enabled' and (v_ss -> 'auto_create_enabled') is distinct from 'false'::jsonb then
      raise exception 'invalid_payload: auto_create_enabled must be false at provisioning' using errcode = '22023';
    end if;
  end if;

  -- shift types (optional)
  if p ? 'shift_types' then
    if jsonb_typeof(p -> 'shift_types') <> 'array' or jsonb_array_length(p -> 'shift_types') > 20 then
      raise exception 'invalid_payload: shift_types must be an array of at most 20' using errcode = '22023';
    end if;
    for v_el in select value from jsonb_array_elements(p -> 'shift_types') loop
      if jsonb_typeof(v_el) <> 'object' then
        raise exception 'invalid_payload: shift type must be an object' using errcode = '22023';
      end if;
      for k in select jsonb_object_keys(v_el) loop
        if k not in ('code', 'label_ja', 'label_en', 'starts_at_local', 'ends_at_local', 'break_minutes', 'sort_order') then
          raise exception 'invalid_payload: unknown shift type key %', k using errcode = '22023';
        end if;
      end loop;
      if jsonb_typeof(v_el -> 'code') is distinct from 'string' or (v_el ->> 'code') !~ '^[A-Za-z0-9_-]{1,40}$' then
        raise exception 'invalid_payload: shift type code format' using errcode = '22023';
      end if;
      if (v_el ->> 'code') = any (v_codes) then
        raise exception 'invalid_payload: duplicate shift type code %', v_el ->> 'code' using errcode = '22023';
      end if;
      v_codes := v_codes || (v_el ->> 'code');
      if jsonb_typeof(v_el -> 'label_ja') is distinct from 'string' or length(btrim(v_el ->> 'label_ja')) not between 1 and 50 then
        raise exception 'invalid_payload: shift type label_ja must be 1-50 characters' using errcode = '22023';
      end if;
      if v_el ? 'label_en' and jsonb_typeof(v_el -> 'label_en') <> 'null'
         and (jsonb_typeof(v_el -> 'label_en') <> 'string' or length(v_el ->> 'label_en') > 50) then
        raise exception 'invalid_payload: shift type label_en must be at most 50 characters' using errcode = '22023';
      end if;
      if jsonb_typeof(v_el -> 'starts_at_local') is distinct from 'string' or (v_el ->> 'starts_at_local') !~ c_time
         or jsonb_typeof(v_el -> 'ends_at_local') is distinct from 'string' or (v_el ->> 'ends_at_local') !~ c_time
         or (v_el ->> 'ends_at_local')::time <= (v_el ->> 'starts_at_local')::time then
        raise exception 'invalid_payload: shift type times must be HH:MM with end after start' using errcode = '22023';
      end if;
      if v_el ? 'break_minutes' and (jsonb_typeof(v_el -> 'break_minutes') <> 'number'
           or (v_el ->> 'break_minutes') !~ '^[0-9]+$' or (v_el ->> 'break_minutes')::numeric > 240) then
        raise exception 'invalid_payload: shift type break_minutes must be an integer 0-240' using errcode = '22023';
      end if;
      if v_el ? 'sort_order' and (jsonb_typeof(v_el -> 'sort_order') <> 'number'
           or (v_el ->> 'sort_order') !~ '^[0-9]+$' or (v_el ->> 'sort_order')::numeric > 1000) then
        raise exception 'invalid_payload: shift type sort_order must be an integer 0-1000' using errcode = '22023';
      end if;
    end loop;
  end if;

  -- Operations manifest (optional)
  if p ? 'operations' then
    if jsonb_typeof(p -> 'operations') <> 'object' then
      raise exception 'invalid_payload: operations must be an object' using errcode = '22023';
    end if;
    for k in select jsonb_object_keys(p -> 'operations') loop
      if k not in ('manifest_version', 'templates') then
        raise exception 'invalid_payload: unknown operations key %', k using errcode = '22023';
      end if;
    end loop;
    if jsonb_typeof(p -> 'operations' -> 'manifest_version') is distinct from 'number'
       or (p -> 'operations' ->> 'manifest_version') !~ '^[1-9][0-9]*$' then
      raise exception 'invalid_payload: operations.manifest_version is required' using errcode = '22023';
    end if;
    if jsonb_typeof(p -> 'operations' -> 'templates') is distinct from 'array'
       or jsonb_array_length(p -> 'operations' -> 'templates') > 30 then
      raise exception 'invalid_payload: operations.templates must be an array of at most 30' using errcode = '22023';
    end if;
    for v_el in select value from jsonb_array_elements(p -> 'operations' -> 'templates') loop
      if jsonb_typeof(v_el) <> 'object' then
        raise exception 'invalid_payload: operations template must be an object' using errcode = '22023';
      end if;
      for k in select jsonb_object_keys(v_el) loop
        if k not in ('name', 'category', 'due_time', 'window_end_time', 'recurrence_kind', 'weekdays', 'items') then
          raise exception 'invalid_payload: unknown operations template key %', k using errcode = '22023';
        end if;
      end loop;
      if jsonb_typeof(v_el -> 'name') is distinct from 'string' or length(btrim(v_el ->> 'name')) not between 1 and 200 then
        raise exception 'invalid_payload: operations template name must be 1-200 characters' using errcode = '22023';
      end if;
      if v_el ? 'category' and jsonb_typeof(v_el -> 'category') <> 'null'
         and (jsonb_typeof(v_el -> 'category') <> 'string' or length(v_el ->> 'category') > 100) then
        raise exception 'invalid_payload: operations template category must be at most 100 characters' using errcode = '22023';
      end if;
      if jsonb_typeof(v_el -> 'due_time') is distinct from 'string' or (v_el ->> 'due_time') !~ c_time then
        raise exception 'invalid_payload: operations template due_time must be HH:MM' using errcode = '22023';
      end if;
      if v_el ? 'window_end_time' and jsonb_typeof(v_el -> 'window_end_time') <> 'null'
         and (jsonb_typeof(v_el -> 'window_end_time') <> 'string' or (v_el ->> 'window_end_time') !~ c_time) then
        raise exception 'invalid_payload: operations template window_end_time must be HH:MM' using errcode = '22023';
      end if;
      v_text := v_el ->> 'recurrence_kind';
      if v_text is null or v_text not in ('daily', 'weekdays') then
        raise exception 'invalid_payload: operations template recurrence_kind must be daily or weekdays' using errcode = '22023';
      end if;
      if v_text = 'weekdays' and (jsonb_typeof(v_el -> 'weekdays') is distinct from 'array'
           or jsonb_array_length(v_el -> 'weekdays') not between 1 and 7
           or exists (select 1 from jsonb_array_elements(v_el -> 'weekdays') w where w::text !~ '^[1-7]$')) then
        raise exception 'invalid_payload: operations template weekdays must be ISO 1-7' using errcode = '22023';
      end if;
      if v_text = 'daily' and v_el ? 'weekdays' and jsonb_typeof(v_el -> 'weekdays') <> 'null' then
        raise exception 'invalid_payload: daily operations template takes no weekdays' using errcode = '22023';
      end if;
      if jsonb_typeof(v_el -> 'items') is distinct from 'array' or jsonb_array_length(v_el -> 'items') not between 1 and 50 then
        raise exception 'invalid_payload: operations template items must be 1-50' using errcode = '22023';
      end if;
      for v_item in select value from jsonb_array_elements(v_el -> 'items') loop
        if jsonb_typeof(v_item) <> 'object' then
          raise exception 'invalid_payload: operations item must be an object' using errcode = '22023';
        end if;
        for k in select jsonb_object_keys(v_item) loop
          if k not in ('label', 'response_type', 'is_critical', 'is_required', 'numeric_min', 'numeric_max', 'numeric_unit') then
            raise exception 'invalid_payload: unknown operations item key %', k using errcode = '22023';
          end if;
        end loop;
        if jsonb_typeof(v_item -> 'label') is distinct from 'string' or length(btrim(v_item ->> 'label')) not between 1 and 500 then
          raise exception 'invalid_payload: operations item label must be 1-500 characters' using errcode = '22023';
        end if;
        if (v_item ->> 'response_type') is null or (v_item ->> 'response_type') not in ('boolean', 'numeric', 'text') then
          raise exception 'invalid_payload: operations item response_type' using errcode = '22023';
        end if;
        if jsonb_typeof(v_item -> 'is_critical') is distinct from 'boolean'
           or jsonb_typeof(v_item -> 'is_required') is distinct from 'boolean' then
          raise exception 'invalid_payload: operations item is_critical / is_required must be booleans' using errcode = '22023';
        end if;
        if coalesce(jsonb_typeof(v_item -> 'numeric_min'), 'null') not in ('null', 'number')
           or coalesce(jsonb_typeof(v_item -> 'numeric_max'), 'null') not in ('null', 'number') then
          raise exception 'invalid_payload: operations item numeric bounds must be numbers or null' using errcode = '22023';
        end if;
        if coalesce(jsonb_typeof(v_item -> 'numeric_unit'), 'null') <> 'null'
           and (jsonb_typeof(v_item -> 'numeric_unit') <> 'string' or length(v_item ->> 'numeric_unit') > 20) then
          raise exception 'invalid_payload: operations item numeric_unit must be at most 20 characters' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;
end;
$$;
comment on function core.validate_provisioning_payload(jsonb) is
  'Server-side validation of a provisioning payload (0133): whitelisted keys only (no PII can be smuggled in), slug rules from onboard-tenant.ts, known timezone / plan / package with its current template_version, bounded settings, shift types and Operations manifest. Raises invalid_payload: <reason> (22023). Internal.';

-- Locks + platform-staff check shared by both writers.
create or replace function core.assert_platform_staff_actor(p_actor_id uuid)
returns void
language plpgsql stable security definer set search_path = core, public as $$
begin
  if p_actor_id is null
     or not exists (select 1 from core.users where id = p_actor_id and is_platform_staff) then
    raise exception 'actor_not_platform_staff' using errcode = '42501';
  end if;
end;
$$;

create or replace function core.provisioning_result(p_row core.tenant_provisioning, p_idempotent boolean)
returns jsonb
language sql stable security definer set search_path = core, public as $$
  select jsonb_build_object(
    'request_id', p_row.request_id,
    'tenant_id', p_row.tenant_id,
    'location_id', (select l.id from core.locations l where l.tenant_id = p_row.tenant_id order by l.created_at, l.id limit 1),
    'slug', p_row.slug,
    'status', p_row.status,
    'error_code', p_row.error_code,
    'template_code', p_row.template_code,
    'template_version', p_row.template_version,
    'idempotent', p_idempotent);
$$;

-- --- the provisioning transaction -----------------------------------------------
create or replace function core.provision_tenant(p_request_id uuid, p_payload jsonb, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, workforce, operations, audit, public, pg_temp as $$
declare
  c_rate_limit constant int := 20;
  v_row core.tenant_provisioning%rowtype;
  v_found boolean;
  v_slug text;
  v_name text;
  v_loc_name text;
  v_tz text;
  v_plan text;
  v_trial_days int;
  v_package text;
  v_version int;
  v_recent int;
  v_tenant uuid;
  v_location uuid;
  v_ss jsonb;
  v_tpl jsonb;
  v_template uuid;
  v_local_today date;
  v_n_shift int := 0;
  v_n_tpl int := 0;
  v_n_item int := 0;
  v_n_sched int := 0;
  v_sync jsonb;
  v_n int;
begin
  if p_request_id is null or p_payload is null then
    raise exception 'invalid_argument: request_id and payload are required' using errcode = '22004';
  end if;
  -- 1. the actor, before anything else (no writes on failure)
  perform core.assert_platform_staff_actor(p_actor_id);
  v_slug := p_payload ->> 'slug';

  -- 2. idempotency: one writer per request; a finished request returns its result
  perform pg_advisory_xact_lock(hashtextextended('core.tenant_provisioning:request:' || p_request_id::text, 0));
  select * into v_row from core.tenant_provisioning where request_id = p_request_id for update;
  v_found := found;
  if v_found and v_row.slug is distinct from v_slug then
    raise exception 'request_slug_mismatch' using errcode = 'P0001';
  end if;
  if v_found and v_row.status in ('db_done', 'invite_sent', 'ready', 'invite_failed') then
    return core.provisioning_result(v_row, true);
  end if;

  -- 3. validate the payload (raises invalid_payload: ...)
  perform core.validate_provisioning_payload(p_payload);

  -- 4. the slug: one writer per slug; taken by another request or tenant -> refuse
  perform pg_advisory_xact_lock(hashtextextended('core.tenant_provisioning:slug:' || v_slug, 0));
  if exists (select 1 from core.tenant_provisioning where slug = v_slug and request_id <> p_request_id)
     or exists (select 1 from core.tenants where lower(slug::text) = v_slug) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;

  -- 5. rate limit per platform user (rolling hour, every recorded request counts)
  perform pg_advisory_xact_lock(hashtextextended('core.tenant_provisioning:actor:' || p_actor_id::text, 0));
  select count(*) into v_recent from core.tenant_provisioning
   where created_by = p_actor_id and created_at > now() - interval '1 hour' and request_id <> p_request_id;
  if v_recent >= c_rate_limit then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  v_name       := btrim(p_payload ->> 'business_name');
  v_loc_name   := btrim(p_payload -> 'location' ->> 'name');
  v_tz         := coalesce(p_payload -> 'location' ->> 'timezone', 'Asia/Tokyo');
  v_plan       := coalesce(p_payload -> 'plan' ->> 'code', 'trial');
  v_trial_days := coalesce((p_payload -> 'plan' ->> 'trial_days')::int, 30);
  v_package    := p_payload ->> 'package_code';
  v_version    := (p_payload ->> 'template_version')::int;

  -- 6. tenant (the 0106 trigger adds a default plan row) and its first location
  insert into core.tenants (slug, name, kind, status)
  values (v_slug, v_name, 'client', 'active')
  returning id into v_tenant;

  insert into core.locations (tenant_id, name, timezone)
  values (v_tenant, v_loc_name, v_tz)
  returning id into v_location;

  -- 7. plan: every new tenant starts in trial (Founder 2026-10-19: 30 days, no card)
  insert into core.tenant_plans (tenant_id, plan_code, status, trial_ends_at)
  values (v_tenant, v_plan, 'trial', now() + make_interval(days => v_trial_days))
  on conflict (tenant_id) do update
    set plan_code = excluded.plan_code, status = excluded.status,
        trial_ends_at = excluded.trial_ends_at, suspended_at = null;

  -- 8. package -> modules (0129: sync + its own audit row)
  v_sync := core.set_tenant_package(v_tenant, v_package, true, p_actor_id);

  -- 9. schedule settings (auto-create stays OFF until the Owner turns it on)
  if p_payload ? 'schedule_settings' then
    v_ss := p_payload -> 'schedule_settings';
    insert into workforce.schedule_settings
      (tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours,
       max_weekly_hours, max_days_per_week, auto_create_day_of_month, auto_create_enabled)
    values
      (v_tenant, v_location,
       coalesce(v_ss -> 'required_headcount_by_weekday', '[1,2,2,2,2,2,1]'::jsonb),
       coalesce((v_ss ->> 'max_monthly_hours')::int, 160),
       coalesce((v_ss ->> 'max_weekly_hours')::int, 40),
       coalesce((v_ss ->> 'max_days_per_week')::int, 5),
       coalesce((v_ss ->> 'auto_create_day_of_month')::int, 15),
       false);
  end if;

  -- 10. shift types
  if p_payload ? 'shift_types' then
    insert into workforce.shift_types
      (tenant_id, location_id, code, label_ja, label_en, starts_at_local, ends_at_local,
       break_minutes, is_custom, sort_order)
    select v_tenant, v_location, e.value ->> 'code', btrim(e.value ->> 'label_ja'),
           nullif(btrim(e.value ->> 'label_en'), ''),
           (e.value ->> 'starts_at_local')::time, (e.value ->> 'ends_at_local')::time,
           coalesce((e.value ->> 'break_minutes')::int, 0), false,
           coalesce((e.value ->> 'sort_order')::int, e.ordinality::int)
      from jsonb_array_elements(p_payload -> 'shift_types') with ordinality as e(value, ordinality);
    get diagnostics v_n_shift = row_count;
  end if;

  -- 11. Operations checklists from the manifest, location-scoped like the
  --     preset installer (cafe-haccp-presets.ts). Schedules start today in the
  --     location's own calendar (never before the server date: no backdated
  --     obligation, same rule as api.operations_create_schedule).
  if p_payload ? 'operations' then
    v_local_today := greatest(current_date, (now() at time zone v_tz)::date);
    for v_tpl in select value from jsonb_array_elements(p_payload -> 'operations' -> 'templates') loop
      insert into operations.checklist_templates (tenant_id, location_id, name, category)
      values (v_tenant, v_location, btrim(v_tpl ->> 'name'), nullif(btrim(v_tpl ->> 'category'), ''))
      returning id into v_template;
      v_n_tpl := v_n_tpl + 1;

      insert into operations.checklist_items
        (tenant_id, template_id, label, response_type, is_critical, is_required,
         numeric_min, numeric_max, numeric_unit, sort_order)
      select v_tenant, v_template, btrim(i.value ->> 'label'), (i.value ->> 'response_type')::operations.response_type,
             (i.value ->> 'is_critical')::boolean, (i.value ->> 'is_required')::boolean,
             (i.value ->> 'numeric_min')::numeric, (i.value ->> 'numeric_max')::numeric,
             nullif(i.value ->> 'numeric_unit', ''), (i.ordinality - 1)::int
        from jsonb_array_elements(v_tpl -> 'items') with ordinality as i(value, ordinality);
      get diagnostics v_n = row_count;
      v_n_item := v_n_item + v_n;

      insert into operations.task_schedules
        (tenant_id, location_id, template_id, recurrence_kind, weekdays, due_time,
         window_end_time, effective_from, is_active)
      values
        (v_tenant, v_location, v_template, (v_tpl ->> 'recurrence_kind')::operations.recurrence_kind,
         case when v_tpl ->> 'recurrence_kind' = 'weekdays'
              then array(select w::text::smallint from jsonb_array_elements(v_tpl -> 'weekdays') w) end,
         (v_tpl ->> 'due_time')::time, (v_tpl ->> 'window_end_time')::time, v_local_today, true);
      v_n_sched := v_n_sched + 1;
    end loop;
  end if;

  -- 12. status row (insert, or a retry of a failed_db request) and the audit row
  insert into core.tenant_provisioning
    (request_id, tenant_id, slug, status, step, error_code, template_code, template_version, created_by)
  values
    (p_request_id, v_tenant, v_slug, 'db_done', 'db', null, v_package, v_version, p_actor_id)
  on conflict (request_id) do update
    set tenant_id = excluded.tenant_id, status = 'db_done', step = 'db', error_code = null,
        template_code = excluded.template_code, template_version = excluded.template_version
  returning * into v_row;

  insert into audit.audit_logs (tenant_id, actor_id, actor_kind, module, entity, entity_id, action, after, metadata)
  values (v_tenant, p_actor_id, 'user', 'core', 'tenant', v_tenant::text, 'provision',
          jsonb_build_object('status', 'db_done', 'slug', v_slug, 'kind', 'client'),
          jsonb_build_object(
            'request_id', p_request_id,
            'retry', v_found,
            'package_code', v_package,
            'template_version', v_version,
            'plan_code', v_plan,
            'trial_days', v_trial_days,
            'modules_enabled', v_sync -> 'enabled',
            'counts', jsonb_build_object(
              'locations', 1,
              'schedule_settings', case when p_payload ? 'schedule_settings' then 1 else 0 end,
              'shift_types', v_n_shift,
              'operations_templates', v_n_tpl,
              'operations_items', v_n_item,
              'operations_schedules', v_n_sched)));

  return core.provisioning_result(v_row, false);
end;
$$;
comment on function core.provision_tenant(uuid, jsonb, uuid) is
  'Stage 4B-1 (0133): creates a client tenant in ONE transaction -- tenant, location, trial plan, package modules (core.set_tenant_package), schedule settings, shift types, Operations checklists/items/schedules from the payload manifest, status row db_done, one audit row. Idempotent by request_id (finished request -> stored result, no writes); slug taken -> slug_taken before any write; non-staff actor -> 42501; > 20 requests per actor per hour -> rate_limited. No PII in payload, status row or audit. service_role only.';

-- --- failure record (separate call, after the caller saw the rollback) ------------
create or replace function core.mark_provisioning_failed(p_request_id uuid, p_slug text, p_error_code text, p_actor_id uuid)
returns jsonb
language plpgsql security definer set search_path = core, public, pg_temp as $$
declare
  v_row core.tenant_provisioning%rowtype;
begin
  if p_request_id is null or p_slug is null or p_error_code is null then
    raise exception 'invalid_argument: request_id, slug and error_code are required' using errcode = '22004';
  end if;
  perform core.assert_platform_staff_actor(p_actor_id);
  if p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'invalid_argument: error_code must match ^[a-z0-9_]{1,64}$' using errcode = '22023';
  end if;
  if p_slug <> lower(btrim(p_slug)) or length(p_slug) not between 3 and 63 or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid_argument: slug format' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('core.tenant_provisioning:request:' || p_request_id::text, 0));
  select * into v_row from core.tenant_provisioning where request_id = p_request_id for update;
  if found then
    if v_row.slug <> p_slug then
      raise exception 'request_slug_mismatch' using errcode = 'P0001';
    end if;
    if v_row.status not in ('requested', 'failed_db') then
      return core.provisioning_result(v_row, true);  -- never downgrade a provisioned tenant
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('core.tenant_provisioning:slug:' || p_slug, 0));
  if exists (select 1 from core.tenant_provisioning where slug = p_slug and request_id <> p_request_id) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;

  insert into core.tenant_provisioning (request_id, slug, status, step, error_code, created_by)
  values (p_request_id, p_slug, 'failed_db', 'db', p_error_code, p_actor_id)
  on conflict (request_id) do update
    set status = 'failed_db', step = 'db', error_code = excluded.error_code
  returning * into v_row;
  return core.provisioning_result(v_row, false);
end;
$$;
comment on function core.mark_provisioning_failed(uuid, text, text, uuid) is
  'Records failed_db for a provisioning request whose transaction rolled back (0133). Error code is a machine code only (no PII). Never downgrades a request that reached db_done or later. No audit row (no tenant exists). service_role only.';

revoke all on function core.validate_provisioning_payload(jsonb) from public, anon, authenticated;
revoke all on function core.assert_platform_staff_actor(uuid) from public, anon, authenticated;
revoke all on function core.provisioning_result(core.tenant_provisioning, boolean) from public, anon, authenticated;
revoke all on function core.provision_tenant(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function core.mark_provisioning_failed(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function core.provision_tenant(uuid, jsonb, uuid) to service_role;
grant execute on function core.mark_provisioning_failed(uuid, text, text, uuid) to service_role;

-- --- api facade for the provision-tenant Edge Function (ADR 0008: invoker only) ----
create or replace function api.provision_tenant(p_request_id uuid, p_payload jsonb, p_actor_id uuid)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.provision_tenant(p_request_id, p_payload, p_actor_id);
$$;
create or replace function api.mark_provisioning_failed(p_request_id uuid, p_slug text, p_error_code text, p_actor_id uuid)
returns jsonb language sql security invoker set search_path = core, public as $$
  select core.mark_provisioning_failed(p_request_id, p_slug, p_error_code, p_actor_id);
$$;
revoke all on function api.provision_tenant(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function api.mark_provisioning_failed(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function api.provision_tenant(uuid, jsonb, uuid) to service_role;
grant execute on function api.mark_provisioning_failed(uuid, text, text, uuid) to service_role;

-- ============================================================================
-- Rollback (tenants already provisioned stay; only the machinery goes):
--   drop function if exists api.mark_provisioning_failed(uuid, text, text, uuid);
--   drop function if exists api.provision_tenant(uuid, jsonb, uuid);
--   drop function if exists core.mark_provisioning_failed(uuid, text, text, uuid);
--   drop function if exists core.provision_tenant(uuid, jsonb, uuid);
--   drop function if exists core.provisioning_result(core.tenant_provisioning, boolean);
--   drop function if exists core.assert_platform_staff_actor(uuid);
--   drop function if exists core.validate_provisioning_payload(jsonb);
--   drop table if exists core.tenant_provisioning;
-- ============================================================================
