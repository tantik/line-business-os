-- ============================================================================
-- 0125  Workforce: scheduled monthly auto-create runs in the cloud
--       (DEBT-074, Stage 2 -- pg_cron -> Edge Function)
-- ----------------------------------------------------------------------------
-- PURPOSE
--   The Manager's "create next month's schedule automatically on day N"
--   setting (0080 day-of-month, 0114 ON/OFF + idempotency marker) was served
--   by `apps/worker`, which never had a deployment target and could not have
--   worked as written (it read `workforce`/`core` through PostgREST, which
--   exposes only `public`/`api`, and read `api.workforce_staff_directory`,
--   whose WHERE clause calls core.has_permission(...) -- always false for a
--   service-role caller). This migration provides:
--     1. `workforce.auto_schedule_runs` -- a visible run log (who/when/what
--        result) so a silent failure is noticed, read by Managers through
--        `api.workforce_auto_schedule_runs`;
--     2. narrow service-role-only RPCs the Edge Function
--        `auto-schedule-monthly` uses as its ENTIRE DB surface (candidates,
--        input load, atomic apply, issue record, token verify);
--     3. pg_cron job `workforce-auto-schedule-monthly` (minute 7, hourly)
--        -> `workforce.invoke_auto_schedule_runner()` -> pg_net POST to the
--        Edge Function, authenticated by a vault-held shared token.
--
-- SECURITY MODEL
--   * ADR 0008: no SECURITY DEFINER object lives in `api`. Every privileged
--     function is SECURITY DEFINER in `workforce` (fixed search_path,
--     EXECUTE revoked from public/anon/authenticated, granted to
--     service_role ONLY), with an invoker-only passthrough in `api` that is
--     likewise granted to service_role only. No app role can call any of
--     them; `apps/web` never holds service_role (AGENTS.md rule 4).
--   * Tenant/location isolation: every read and write inside these
--     functions is scoped by BOTH tenant_id and location_id. Drafts passed to
--     `auto_schedule_apply` are re-validated in the DB: each employee and
--     shift type must belong to the same tenant AND location (and be
--     active), and each start must fall inside the target month in the
--     location's timezone -- otherwise the whole call is rejected.
--   * Atomicity: marker claim (optimistic lock on
--     auto_create_last_generated_month), draft insert (published = false,
--     never auto-published, never sent via LINE), run-log upsert and audit
--     row are ONE transaction. A lost race returns false and writes nothing.
--   * Run log holds ids, counts and a short machine `error_code` only (CHECK
--     enforced) -- never raw error text, never PII. RLS: readable by
--     Managers only -- workforce.shift.write at the location with the
--     Workforce module ON (Staff hold shift.read but never see the log);
--     no insert/update/delete for any app role.
--   * Cron auth: `workforce.invoke_auto_schedule_runner()` sends
--     `Authorization: Bearer <vault secret auto_schedule_cron_token>`; the
--     Edge Function (verify_jwt = false) checks it via
--     `api.verify_auto_schedule_cron_token`, so the secret never leaves the
--     DB except inside that one request. The token is generated here, once,
--     only if absent (re-applying this migration never rotates it).
--
-- MANUAL PER-ENVIRONMENT STEP (the only one)
--   The runner is a no-op (RAISE NOTICE) until the vault secret
--   `auto_schedule_project_url` exists. Set it deliberately per environment:
--     select vault.create_secret('https://<project-ref>.supabase.co', 'auto_schedule_project_url');
--   Local and production stay inert until someone does this on purpose
--   (production = Founder gate). See docs/operations/auto-schedule-cloud-runner.md.
--
-- ROLLBACK
--   select cron.unschedule('workforce-auto-schedule-monthly');
--   drop function api.auto_schedule_candidates(), api.auto_schedule_load_inputs(...),
--     api.auto_schedule_apply(...), api.auto_schedule_record_issue(...),
--     api.verify_auto_schedule_cron_token(text) and the workforce.* functions
--     of the same names plus workforce.invoke_auto_schedule_runner();
--   drop view api.workforce_auto_schedule_runs; drop table workforce.auto_schedule_runs;
--   optionally delete the vault secrets auto_schedule_cron_token / auto_schedule_project_url.
--   Drafts already generated are ordinary unpublished workforce.shifts rows
--   and are left alone. pg_cron / pg_net / supabase_vault extensions are
--   left installed (shared platform extensions).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

-- ============================================================================
-- Run log
-- ============================================================================
create table if not exists workforce.auto_schedule_runs (
  id                                 uuid primary key default gen_random_uuid(),
  tenant_id                          uuid not null references core.tenants(id) on delete cascade,
  location_id                        uuid not null,
  target_month                       date not null,
  outcome                            text not null,
  created_count                      integer not null default 0,
  shortage_count                     integer not null default 0,
  unplaced_count                     integer not null default 0,
  assigned_without_preference_count  integer not null default 0,
  error_code                         text,
  attempt_count                      integer not null default 1,
  first_seen_at                      timestamptz not null default now(),
  last_seen_at                       timestamptz not null default now(),
  constraint auto_schedule_runs_location_tenant_fkey
    foreign key (tenant_id, location_id) references core.locations(tenant_id, id) on delete cascade,
  constraint auto_schedule_runs_outcome_check
    check (outcome in ('generated', 'config_error', 'failed')),
  constraint auto_schedule_runs_target_month_first_day_check
    check (extract(day from target_month) = 1),
  constraint auto_schedule_runs_counts_check
    check (created_count >= 0 and shortage_count >= 0 and unplaced_count >= 0
           and assigned_without_preference_count >= 0 and attempt_count >= 1),
  -- Short machine code only -- never raw error text, never PII.
  constraint auto_schedule_runs_error_code_format_check
    check (error_code is null or error_code ~ '^[a-z0-9_]{1,64}$'),
  constraint auto_schedule_runs_error_code_presence_check
    check ((outcome = 'generated') = (error_code is null)),
  -- Repeated hourly config errors / failures for the same month upsert one
  -- row (attempt_count + 1, last_seen_at) instead of spamming the log.
  constraint auto_schedule_runs_unique_outcome
    unique (tenant_id, location_id, target_month, outcome)
);

create index if not exists auto_schedule_runs_location_latest_idx
  on workforce.auto_schedule_runs (tenant_id, location_id, last_seen_at desc);

comment on table workforce.auto_schedule_runs is
  'Run log of the scheduled monthly auto-create (DEBT-074, 0125): one row per (tenant, location, target month, outcome). Written only by the service-role-only workforce.auto_schedule_apply / auto_schedule_record_issue functions; ids, counts and a short machine error_code only (no raw error text, no PII).';

alter table workforce.auto_schedule_runs enable row level security;

drop policy if exists wf_auto_schedule_runs_read on workforce.auto_schedule_runs;
create policy wf_auto_schedule_runs_read on workforce.auto_schedule_runs
  for select
  using (
    core.has_module_access(tenant_id, 'workforce')
    and core.has_permission(tenant_id, 'workforce.shift.write', location_id)
  );

revoke all on workforce.auto_schedule_runs from public, anon, authenticated;
grant select on workforce.auto_schedule_runs to authenticated;

create or replace view api.workforce_auto_schedule_runs
  with (security_invoker = true) as
select
  r.id as run_id,
  r.tenant_id,
  r.location_id,
  r.target_month,
  r.outcome,
  r.created_count,
  r.shortage_count,
  r.unplaced_count,
  r.assigned_without_preference_count,
  r.error_code,
  r.attempt_count,
  r.first_seen_at,
  r.last_seen_at
from workforce.auto_schedule_runs r;

comment on view api.workforce_auto_schedule_runs is
  'Scheduled monthly auto-create run log (0125), relying entirely on wf_auto_schedule_runs_read RLS (workforce module ON + workforce.shift.write at the location -- Managers only). security_invoker view; read-only.';

revoke all on api.workforce_auto_schedule_runs from public, anon, authenticated;
grant select on api.workforce_auto_schedule_runs to authenticated;

-- ============================================================================
-- a. Candidates: opted-in settings, Workforce module ON, active location.
-- ============================================================================
create or replace function workforce.auto_schedule_candidates()
returns table (
  tenant_id uuid,
  location_id uuid,
  timezone text,
  auto_create_day_of_month integer,
  auto_create_last_generated_month date,
  required_headcount_by_weekday jsonb,
  max_monthly_hours integer
)
language sql
stable
security definer
set search_path = workforce, core, public
as $$
  select
    s.tenant_id,
    s.location_id,
    l.timezone,
    s.auto_create_day_of_month,
    s.auto_create_last_generated_month,
    s.required_headcount_by_weekday,
    s.max_monthly_hours
  from workforce.schedule_settings s
  join core.locations l
    on l.id = s.location_id
   and l.tenant_id = s.tenant_id
  join core.tenant_modules tm
    on tm.tenant_id = s.tenant_id
   and tm.module = 'workforce'
  join core.tenants tn
    on tn.id = s.tenant_id
  where s.auto_create_enabled = true
    and tm.is_enabled = true
    and l.is_active = true
    and tn.status = 'active' -- core.tenant_status: suspended / archived tenants never run
  order by s.tenant_id, s.location_id;
$$;

comment on function workforce.auto_schedule_candidates() is
  'Service-role-only (0125): locations eligible for the scheduled monthly auto-create -- auto_create_enabled, tenant status active, tenant Workforce module enabled (missing row = excluded), location active. The day-of-month / marker check is done by the caller in the location timezone.';

-- ============================================================================
-- b. Input snapshot for one (tenant, location, target month).
--    Same semantics as the four reads the worker made through the api views,
--    minus their permission filter (meaningless for service_role):
--      employees      -- workforce.employees at exactly this location (the
--                        engine itself skips is_active = false);
--      shift_types    -- every shift type at this location (active + inactive);
--      preferences    -- kind = 'preference' rows at this location, work_date
--                        within the target month;
--      existing       -- workforce.shifts at this location starting inside
--                        [p_from, p_to) (the month in the location timezone).
-- ============================================================================
create or replace function workforce.auto_schedule_load_inputs(
  p_tenant_id uuid,
  p_location_id uuid,
  p_period_start date,
  p_period_end date,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = workforce, core, public
as $$
  select jsonb_build_object(
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object('employee_id', e.id, 'is_active', e.is_active) order by e.id)
      from workforce.employees e
      where e.tenant_id = p_tenant_id
        and e.location_id = p_location_id
    ), '[]'::jsonb),
    'shift_types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'shift_type_id', t.id,
        'code', t.code,
        'starts_at_local', left(t.starts_at_local::text, 5),
        'ends_at_local', left(t.ends_at_local::text, 5),
        'break_minutes', t.break_minutes,
        'sort_order', t.sort_order,
        'is_active', t.is_active
      ) order by t.sort_order, t.id)
      from workforce.shift_types t
      where t.tenant_id = p_tenant_id
        and t.location_id = p_location_id
    ), '[]'::jsonb),
    'preferences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', r.employee_id,
        'work_date', r.work_date,
        'shift_type_id', r.shift_type_id,
        'is_unavailable', r.is_unavailable
      ) order by r.work_date, r.employee_id, r.id)
      from workforce.shift_requests r
      where r.tenant_id = p_tenant_id
        and r.location_id = p_location_id
        and r.kind = 'preference'
        and r.work_date >= p_period_start
        and r.work_date <= p_period_end
    ), '[]'::jsonb),
    'existing_assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'employee_id', s.employee_id,
        'shift_type_id', s.shift_type_id,
        'starts_at', s.starts_at,
        'ends_at', s.ends_at,
        'break_minutes', s.break_minutes,
        'published', s.published,
        'location_id', s.location_id
      ) order by s.starts_at, s.id)
      from workforce.shifts s
      where s.tenant_id = p_tenant_id
        and s.location_id = p_location_id
        and s.starts_at >= p_from
        and s.starts_at < p_to
    ), '[]'::jsonb)
  );
$$;

comment on function workforce.auto_schedule_load_inputs(uuid, uuid, date, date, timestamptz, timestamptz) is
  'Service-role-only (0125): engine input snapshot for one tenant+location+month. Every query is scoped by BOTH tenant_id and location_id. Returns ids/flags/times only -- no names or other PII.';

-- ============================================================================
-- c. Atomic apply: marker claim + drafts + run log + audit, one transaction.
-- ============================================================================
create or replace function workforce.auto_schedule_apply(
  p_tenant_id uuid,
  p_location_id uuid,
  p_target_month date,
  p_expected_marker date,
  p_drafts jsonb,
  p_shortages integer,
  p_unplaced integer,
  p_assigned_without_preference integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = workforce, core, public
as $$
declare
  v_timezone    text;
  v_month_start timestamptz;
  v_month_end   timestamptz;
  v_rejected    integer;
  v_claimed     integer;
  v_created     integer;
begin
  if p_tenant_id is null or p_location_id is null or p_target_month is null then
    raise exception 'auto_schedule_apply: tenant, location and target month are required' using errcode = '22023';
  end if;
  if extract(day from p_target_month) <> 1 then
    raise exception 'auto_schedule_apply: target month must be a first-of-month date' using errcode = '22023';
  end if;
  if p_drafts is null or jsonb_typeof(p_drafts) <> 'array' then
    raise exception 'auto_schedule_apply: drafts must be a json array' using errcode = '22023';
  end if;
  if coalesce(p_shortages, -1) < 0 or coalesce(p_unplaced, -1) < 0 or coalesce(p_assigned_without_preference, -1) < 0 then
    raise exception 'auto_schedule_apply: counts must be non-negative' using errcode = '22023';
  end if;

  -- Already generated for this month: nothing to claim.
  if p_expected_marker is not distinct from p_target_month then
    return false;
  end if;

  select l.timezone into v_timezone
  from core.locations l
  where l.id = p_location_id
    and l.tenant_id = p_tenant_id
    and l.is_active = true;
  if v_timezone is null then
    return false; -- location gone / inactive since the candidate list was read
  end if;

  v_month_start := (p_target_month::timestamp) at time zone v_timezone;
  v_month_end   := ((p_target_month + interval '1 month')::timestamp) at time zone v_timezone;

  -- Validate every draft BEFORE claiming anything. One bad draft rejects the
  -- whole call (exception -> nothing is written, marker untouched).
  select count(*) into v_rejected
  from jsonb_to_recordset(p_drafts) as d(
    employee_id uuid, shift_type_id uuid, starts_at timestamptz, ends_at timestamptz, break_minutes integer
  )
  where d.employee_id is null
     or d.shift_type_id is null
     or d.starts_at is null
     or d.ends_at is null
     or d.ends_at <= d.starts_at
     or d.ends_at > d.starts_at + interval '24 hours'
     or coalesce(d.break_minutes, -1) < 0
     or d.starts_at < v_month_start
     or d.starts_at >= v_month_end
     or not exists (
       select 1 from workforce.employees e
       where e.id = d.employee_id
         and e.tenant_id = p_tenant_id
         and e.location_id = p_location_id
         and e.is_active = true
     )
     or not exists (
       select 1 from workforce.shift_types t
       where t.id = d.shift_type_id
         and t.tenant_id = p_tenant_id
         and t.location_id = p_location_id
         and t.is_active = true
     );
  if v_rejected > 0 then
    raise exception 'auto_schedule_apply: % draft(s) rejected (employee/shift type outside this tenant+location, inactive, time outside the target month, or duration not in (0, 24h])', v_rejected
      using errcode = '22023';
  end if;

  -- Optimistic lock: claim the month only if the marker still holds the
  -- value the caller read, automation is still ON, the module still
  -- enabled and the tenant still active. A concurrent winner (or any of
  -- those changing since the candidate list was read) makes this affect
  -- 0 rows.
  update workforce.schedule_settings s
     set auto_create_last_generated_month = p_target_month
   where s.tenant_id = p_tenant_id
     and s.location_id = p_location_id
     and s.auto_create_enabled = true
     and s.auto_create_last_generated_month is not distinct from p_expected_marker
     and core.has_module_access(p_tenant_id, 'workforce')
     and exists (select 1 from core.tenants tn where tn.id = p_tenant_id and tn.status = 'active');
  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    return false;
  end if;

  insert into workforce.shifts (
    tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, published
  )
  select
    p_tenant_id, p_location_id, d.employee_id, d.shift_type_id, d.starts_at, d.ends_at, d.break_minutes,
    false -- review-pending proposal: never auto-published, never queued to LINE
  from jsonb_to_recordset(p_drafts) as d(
    employee_id uuid, shift_type_id uuid, starts_at timestamptz, ends_at timestamptz, break_minutes integer
  );
  get diagnostics v_created = row_count;

  insert into workforce.auto_schedule_runs as r (
    tenant_id, location_id, target_month, outcome,
    created_count, shortage_count, unplaced_count, assigned_without_preference_count, error_code
  )
  values (
    p_tenant_id, p_location_id, p_target_month, 'generated',
    v_created, p_shortages, p_unplaced, p_assigned_without_preference, null
  )
  on conflict (tenant_id, location_id, target_month, outcome) do update
    set created_count = excluded.created_count,
        shortage_count = excluded.shortage_count,
        unplaced_count = excluded.unplaced_count,
        assigned_without_preference_count = excluded.assigned_without_preference_count,
        attempt_count = r.attempt_count + 1,
        last_seen_at = now();

  insert into audit.audit_logs (
    tenant_id, actor_id, actor_kind, module, entity, entity_id, action, before, after, metadata
  )
  values (
    p_tenant_id,
    null,
    'system',
    'workforce',
    'schedule_settings',
    p_location_id::text,
    'auto_schedule.generated',
    jsonb_build_object('auto_create_last_generated_month', p_expected_marker),
    jsonb_build_object(
      'auto_create_last_generated_month', p_target_month,
      'created_count', v_created,
      'shortage_count', p_shortages,
      'unplaced_count', p_unplaced,
      'assigned_without_preference_count', p_assigned_without_preference
    ),
    jsonb_build_object('source', 'auto-schedule-monthly', 'location_id', p_location_id, 'published', false)
  );

  return true;
end;
$$;

comment on function workforce.auto_schedule_apply(uuid, uuid, date, date, jsonb, integer, integer, integer) is
  'Service-role-only (0125): ONE transaction -- validates drafts (same tenant+location, active, inside the target month, duration > 0 and <= 24h), claims the month via optimistic lock on auto_create_last_generated_month (false + nothing written if lost, automation OFF, module OFF or tenant not active), inserts drafts with published = false, upserts the generated run-log row, writes an audit row (actor_kind system, action auto_schedule.generated).';

-- ============================================================================
-- d. Record a config error / failure (upsert, attempt_count + 1).
-- ============================================================================
create or replace function workforce.auto_schedule_record_issue(
  p_tenant_id uuid,
  p_location_id uuid,
  p_target_month date,
  p_outcome text,
  p_error_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = workforce, core, public
as $$
begin
  if p_outcome is null or p_outcome not in ('config_error', 'failed') then
    raise exception 'auto_schedule_record_issue: outcome must be config_error or failed' using errcode = '22023';
  end if;
  if p_error_code is null or p_error_code !~ '^[a-z0-9_]{1,64}$' then
    raise exception 'auto_schedule_record_issue: error_code must be a short machine code' using errcode = '22023';
  end if;

  insert into workforce.auto_schedule_runs as r (
    tenant_id, location_id, target_month, outcome, error_code
  )
  values (p_tenant_id, p_location_id, p_target_month, p_outcome, p_error_code)
  on conflict (tenant_id, location_id, target_month, outcome) do update
    set error_code = excluded.error_code,
        attempt_count = r.attempt_count + 1,
        last_seen_at = now();
end;
$$;

comment on function workforce.auto_schedule_record_issue(uuid, uuid, date, text, text) is
  'Service-role-only (0125): upserts a config_error / failed run-log row for (tenant, location, target month); repeats increment attempt_count and bump last_seen_at. error_code must match ^[a-z0-9_]{1,64}$ (no raw error text).';

-- ============================================================================
-- e. Cron token verification (the secret value never leaves the DB).
-- ============================================================================
create or replace function workforce.verify_auto_schedule_cron_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = workforce, public
as $$
  select coalesce(
    p_token is not null
    and length(p_token) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets ds
      where ds.name = 'auto_schedule_cron_token'
        and ds.decrypted_secret = p_token
    ),
    false
  );
$$;

comment on function workforce.verify_auto_schedule_cron_token(text) is
  'Service-role-only (0125): true iff p_token equals the vault secret auto_schedule_cron_token. Used by the auto-schedule-monthly Edge Function (verify_jwt = false) to authenticate the pg_cron caller.';

-- ============================================================================
-- Grants: service_role only, on both the workforce DEFINER functions and the
-- api invoker passthroughs.
-- ============================================================================
revoke all on function workforce.auto_schedule_candidates() from public, anon, authenticated;
revoke all on function workforce.auto_schedule_load_inputs(uuid, uuid, date, date, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function workforce.auto_schedule_apply(uuid, uuid, date, date, jsonb, integer, integer, integer) from public, anon, authenticated;
revoke all on function workforce.auto_schedule_record_issue(uuid, uuid, date, text, text) from public, anon, authenticated;
revoke all on function workforce.verify_auto_schedule_cron_token(text) from public, anon, authenticated;

grant execute on function workforce.auto_schedule_candidates() to service_role;
grant execute on function workforce.auto_schedule_load_inputs(uuid, uuid, date, date, timestamptz, timestamptz) to service_role;
grant execute on function workforce.auto_schedule_apply(uuid, uuid, date, date, jsonb, integer, integer, integer) to service_role;
grant execute on function workforce.auto_schedule_record_issue(uuid, uuid, date, text, text) to service_role;
grant execute on function workforce.verify_auto_schedule_cron_token(text) to service_role;

-- api passthroughs (security invoker -- ADR 0008) --------------------------
create or replace function api.auto_schedule_candidates()
returns table (
  tenant_id uuid,
  location_id uuid,
  timezone text,
  auto_create_day_of_month integer,
  auto_create_last_generated_month date,
  required_headcount_by_weekday jsonb,
  max_monthly_hours integer
)
language sql
security invoker
set search_path = workforce, public
as $$
  select * from workforce.auto_schedule_candidates();
$$;

create or replace function api.auto_schedule_load_inputs(
  p_tenant_id uuid,
  p_location_id uuid,
  p_period_start date,
  p_period_end date,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language sql
security invoker
set search_path = workforce, public
as $$
  select workforce.auto_schedule_load_inputs(p_tenant_id, p_location_id, p_period_start, p_period_end, p_from, p_to);
$$;

create or replace function api.auto_schedule_apply(
  p_tenant_id uuid,
  p_location_id uuid,
  p_target_month date,
  p_expected_marker date,
  p_drafts jsonb,
  p_shortages integer,
  p_unplaced integer,
  p_assigned_without_preference integer
)
returns boolean
language sql
security invoker
set search_path = workforce, public
as $$
  select workforce.auto_schedule_apply(
    p_tenant_id, p_location_id, p_target_month, p_expected_marker, p_drafts,
    p_shortages, p_unplaced, p_assigned_without_preference
  );
$$;

create or replace function api.auto_schedule_record_issue(
  p_tenant_id uuid,
  p_location_id uuid,
  p_target_month date,
  p_outcome text,
  p_error_code text
)
returns void
language sql
security invoker
set search_path = workforce, public
as $$
  select workforce.auto_schedule_record_issue(p_tenant_id, p_location_id, p_target_month, p_outcome, p_error_code);
$$;

create or replace function api.verify_auto_schedule_cron_token(p_token text)
returns boolean
language sql
security invoker
set search_path = workforce, public
as $$
  select workforce.verify_auto_schedule_cron_token(p_token);
$$;

comment on function api.auto_schedule_candidates() is
  'Invoker-only passthrough to workforce.auto_schedule_candidates (ADR 0008). service_role only.';
comment on function api.auto_schedule_load_inputs(uuid, uuid, date, date, timestamptz, timestamptz) is
  'Invoker-only passthrough to workforce.auto_schedule_load_inputs (ADR 0008). service_role only.';
comment on function api.auto_schedule_apply(uuid, uuid, date, date, jsonb, integer, integer, integer) is
  'Invoker-only passthrough to workforce.auto_schedule_apply (ADR 0008). service_role only.';
comment on function api.auto_schedule_record_issue(uuid, uuid, date, text, text) is
  'Invoker-only passthrough to workforce.auto_schedule_record_issue (ADR 0008). service_role only.';
comment on function api.verify_auto_schedule_cron_token(text) is
  'Invoker-only passthrough to workforce.verify_auto_schedule_cron_token (ADR 0008). service_role only.';

revoke all on function api.auto_schedule_candidates() from public, anon, authenticated;
revoke all on function api.auto_schedule_load_inputs(uuid, uuid, date, date, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function api.auto_schedule_apply(uuid, uuid, date, date, jsonb, integer, integer, integer) from public, anon, authenticated;
revoke all on function api.auto_schedule_record_issue(uuid, uuid, date, text, text) from public, anon, authenticated;
revoke all on function api.verify_auto_schedule_cron_token(text) from public, anon, authenticated;

grant execute on function api.auto_schedule_candidates() to service_role;
grant execute on function api.auto_schedule_load_inputs(uuid, uuid, date, date, timestamptz, timestamptz) to service_role;
grant execute on function api.auto_schedule_apply(uuid, uuid, date, date, jsonb, integer, integer, integer) to service_role;
grant execute on function api.auto_schedule_record_issue(uuid, uuid, date, text, text) to service_role;
grant execute on function api.verify_auto_schedule_cron_token(text) to service_role;

-- ============================================================================
-- Cron token (vault) -- created once, never rotated by re-applying.
-- ============================================================================
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'auto_schedule_cron_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'auto_schedule_cron_token',
      'Shared secret pg_cron sends to the auto-schedule-monthly Edge Function (migration 0125).'
    );
  end if;
end;
$$;

-- ============================================================================
-- Runner: pg_cron -> pg_net -> Edge Function. No-op until `auto_schedule_project_url` set.
-- ============================================================================
create or replace function workforce.invoke_auto_schedule_runner()
returns bigint
language plpgsql
volatile
security definer
set search_path = workforce, public
as $$
declare
  v_auto_schedule_project_url text;
  v_token       text;
  v_request_id  bigint;
begin
  select ds.decrypted_secret into v_auto_schedule_project_url
  from vault.decrypted_secrets ds
  where ds.name = 'auto_schedule_project_url'
  limit 1;

  if v_auto_schedule_project_url is null or btrim(v_auto_schedule_project_url) = '' then
    raise notice 'auto-schedule runner: vault secret auto_schedule_project_url is not set -- skipping (see docs/operations/auto-schedule-cloud-runner.md)';
    return null;
  end if;

  select ds.decrypted_secret into v_token
  from vault.decrypted_secrets ds
  where ds.name = 'auto_schedule_cron_token'
  limit 1;

  if v_token is null or v_token = '' then
    raise notice 'auto-schedule runner: vault secret auto_schedule_cron_token is missing -- skipping';
    return null;
  end if;

  select net.http_post(
    url := rtrim(btrim(v_auto_schedule_project_url), '/') || '/functions/v1/auto-schedule-monthly',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_token
    ),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$$;

comment on function workforce.invoke_auto_schedule_runner() is
  'Called by pg_cron job workforce-auto-schedule-monthly (0125). Reads vault secrets auto_schedule_project_url + auto_schedule_cron_token and POSTs to the auto-schedule-monthly Edge Function via pg_net. No-op (RAISE NOTICE) while auto_schedule_project_url is unset. Not executable by any app role.';

revoke all on function workforce.invoke_auto_schedule_runner() from public, anon, authenticated, service_role;

-- Hourly at minute 7 (idempotent by job name: re-scheduling updates it).
select cron.schedule(
  'workforce-auto-schedule-monthly',
  '7 * * * *',
  $cron$select workforce.invoke_auto_schedule_runner()$cron$
);
