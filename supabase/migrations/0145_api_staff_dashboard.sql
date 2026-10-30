-- ============================================================================
-- 0145: api.staff_dashboard -- the Staff page's read-only data batch in one
-- RPC (DEBT-135, same pattern as 0144 api.manager_dashboard).
--
-- WHY: every /staff page view ran a Promise.all of 18 list reads (several of
-- them paged) plus a follow-up read of today's Operations responses -- about
-- 20 PostgREST requests per Staff view on top of the page context (0143),
-- the profile read and my_access (0142).
--
-- WHAT: one invoker-only function. Parts the Staff page shares with the
-- Manager page are read by ONE call to api.manager_dashboard (0144) with the
-- same inputs -- the same reads, not a copy of them:
--   shiftTypes, assignments, shiftExchanges, inventoryItems, purchasesNeeded,
--   purchaseHistory, purchasesAwaiting, recipeCategories, recipes,
--   recipeTitleTranslations, operationsTodayTasks, operationsItems, issuesOpen
-- Staff-only parts are read here, each the SAME read as the TS lib function
-- it replaces (same api view, filters, order, row cap):
--
--   part                   source                              filter / order / cap
--   myPreferenceRequests   api.workforce_shift_requests        tenant, kind=preference; work_date, request_id; paged
--   myCorrectionRequests   api.workforce_shift_requests        tenant, kind=correction; work_date, request_id; paged
--   myAttendance           api.workforce_attendance            tenant; work_date, attendance_id; paged
--   myStaffMessages        api.workforce_staff_messages        tenant, employee_id = employeeId; created_at, message_id; paged
--   staffRoster            api.workforce_staff_roster          tenant; 1000
--   operationsResponses    api.operations_item_responses       tenant, instance_id in (instance ids of this
--                                                              call's operationsTodayTasks rows at p_location_id);
--                                                              response_id; paged
--
-- Result shape, per-part error isolation and row caps are exactly 0144's:
--   { "<part>": {"rows": [...]} | {"error": {"code": <sqlstate>, "message": <sqlerrm>}}, ... }
--   "1000"  -- unpaged reads were silently capped at PostgREST max_rows; same cap.
--   "paged" -- 20000 rows or more -> {"error": {"code": "LBO_ROW_CAP", ...}} for that part.
-- operationsResponses requires operationsTodayTasks in the same call (it reads
-- that part's rows; the app read responses only for those tasks). If that
-- part errored, operationsResponses is {"rows": []} -- as the app, which read
-- no responses when the task read failed.
--
-- The "my*" names follow the lib functions they replace: as before, RLS (not
-- this function) decides whose rows those are -- a self-scoped employee sees
-- their own rows, a manager opening /staff sees what their manage policy
-- allows. Only myStaffMessages narrows to the caller's employee id, as the
-- app did (listMyStaffMessages).
--
-- p_params: {"parts": [...], "fromIso": timestamptz, "toIsoExclusive": timestamptz,
--   "today": date, "employeeId": uuid}
-- A requested part's inputs are required. Unknown part, missing/invalid input,
-- null tenant/location -> 22023 for the whole call.
--
-- SECURITY MODEL: NOT SECURITY DEFINER (ADR 0008). Every part reads an
-- existing api view / calls an existing api function (incl. 0144, itself
-- invoker) AS THE CALLER, so the views' security_invoker RLS and the
-- functions' own checks apply unchanged; no core/workforce/... table is read
-- directly and nothing is widened. tenant/location/employeeId are display
-- narrowing only, not the boundary. `anon` gets no grant.
-- ============================================================================

create or replace function api.staff_dashboard(
  p_tenant_id uuid,
  p_location_id uuid,
  p_params jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = api, public, pg_temp
as $$
declare
  c_shared_parts constant text[] := array[
    'shiftTypes', 'assignments', 'shiftExchanges', 'inventoryItems', 'purchasesNeeded', 'purchaseHistory',
    'purchasesAwaiting', 'recipeCategories', 'recipes', 'recipeTitleTranslations', 'operationsTodayTasks',
    'operationsItems', 'issuesOpen'];
  c_own_parts constant text[] := array[
    'myPreferenceRequests', 'myCorrectionRequests', 'myAttendance', 'myStaffMessages', 'staffRoster',
    'operationsResponses'];
  -- app: FETCH_ALL_PAGE_SIZE (1000) x FETCH_ALL_MAX_PAGES (20), PostgREST max_rows (1000)
  c_paged_cap constant int := 20000;
  c_max_rows constant int := 1000;
  c_cap_error constant jsonb := jsonb_build_object('error', jsonb_build_object(
    'code', 'LBO_ROW_CAP',
    'message', 'List read exceeds 20000 rows; refusing to return a partial list (DEBT-114).'));
  v_parts text[];
  v_shared text[];
  v_unknown text;
  v_employee uuid;
  v_instance_ids uuid[];
  v_rows jsonb;
  v_out jsonb := '{}'::jsonb;
begin
  -- ---- input validation (whole call) -------------------------------------------------------
  if p_tenant_id is null or p_location_id is null then
    raise exception 'invalid_argument: tenant and location are required' using errcode = '22023';
  end if;
  if p_params is null or jsonb_typeof(p_params) <> 'object'
     or jsonb_typeof(p_params -> 'parts') is distinct from 'array' then
    raise exception 'invalid_argument: p_params.parts must be an array' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_params -> 'parts') e where jsonb_typeof(e) <> 'string') then
    raise exception 'invalid_argument: part names must be strings' using errcode = '22023';
  end if;
  select array_agg(distinct e) into v_parts from jsonb_array_elements_text(p_params -> 'parts') e;
  v_parts := coalesce(v_parts, '{}');
  select p into v_unknown from unnest(v_parts) p
   where not (p = any (c_shared_parts) or p = any (c_own_parts)) limit 1;
  if v_unknown is not null then
    raise exception 'invalid_argument: unknown part %', v_unknown using errcode = '22023';
  end if;
  if 'operationsResponses' = any (v_parts) and not ('operationsTodayTasks' = any (v_parts)) then
    raise exception 'invalid_argument: operationsResponses requires operationsTodayTasks' using errcode = '22023';
  end if;
  if 'myStaffMessages' = any (v_parts) then
    begin
      v_employee := (p_params ->> 'employeeId')::uuid;
    exception when others then
      v_employee := null;
    end;
    if v_employee is null then
      raise exception 'invalid_argument: missing or invalid employeeId' using errcode = '22023';
    end if;
  end if;

  -- ---- shared parts: one api.manager_dashboard call (validates its own inputs, 22023) ------
  select array_agg(p) into v_shared from unnest(v_parts) p where p = any (c_shared_parts);
  if v_shared is not null then
    v_out := api.manager_dashboard(p_tenant_id, p_location_id, jsonb_set(p_params, '{parts}', to_jsonb(v_shared)));
  end if;

  -- ---- myPreferenceRequests / myCorrectionRequests -----------------------------------------
  if 'myPreferenceRequests' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date, x.request_id), '[]'::jsonb) from (
        select r.request_id, r.tenant_id, r.location_id, r.employee_id, r.shift_id, r.shift_type_id, r.work_date,
               r.kind, r.is_unavailable, r.status, r.details, r.attendance_id, r.created_at, r.updated_at
          from api.workforce_shift_requests r
         where r.tenant_id = p_tenant_id and r.kind = 'preference'
         order by r.work_date, r.request_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('myPreferenceRequests',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('myPreferenceRequests', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  if 'myCorrectionRequests' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date, x.request_id), '[]'::jsonb) from (
        select r.request_id, r.tenant_id, r.location_id, r.employee_id, r.shift_id, r.shift_type_id, r.work_date,
               r.kind, r.is_unavailable, r.status, r.details, r.attendance_id, r.created_at, r.updated_at
          from api.workforce_shift_requests r
         where r.tenant_id = p_tenant_id and r.kind = 'correction'
         order by r.work_date, r.request_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('myCorrectionRequests',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('myCorrectionRequests', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- myAttendance ------------------------------------------------------------------------
  if 'myAttendance' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date, x.attendance_id), '[]'::jsonb) from (
        select a.attendance_id, a.tenant_id, a.location_id, a.employee_id, a.shift_id, a.work_date, a.clock_in,
               a.clock_out, a.actual_break_minutes, a.status, a.transportation_cost, a.daily_message, a.created_at,
               a.updated_at
          from api.workforce_attendance a
         where a.tenant_id = p_tenant_id
         order by a.work_date, a.attendance_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('myAttendance',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('myAttendance', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- myStaffMessages (the caller's own thread) ---------------------------------------------
  if 'myStaffMessages' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.message_id), '[]'::jsonb) from (
        select m.message_id, m.tenant_id, m.location_id, m.employee_id, m.sender_role, m.sender_user_id, m.body,
               m.is_read, m.read_at, m.read_by, m.archived_at, m.deleted_at, m.created_at, m.updated_at
          from api.workforce_staff_messages m
         where m.tenant_id = p_tenant_id and m.employee_id = v_employee
         order by m.created_at, m.message_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('myStaffMessages',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('myStaffMessages', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- staffRoster -------------------------------------------------------------------------
  if 'staffRoster' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select r.employee_id, r.tenant_id, r.location_id, r.name_encrypted, r.is_active
          from api.workforce_staff_roster r
         where r.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('staffRoster', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('staffRoster', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsResponses (for this call's today tasks at this location) -------------------
  if 'operationsResponses' = any (v_parts) then
    begin
      select array_agg(distinct (t ->> 'instance_id')::uuid) into v_instance_ids
        from jsonb_array_elements(coalesce(v_out #> '{operationsTodayTasks,rows}', '[]'::jsonb)) t
       where t ->> 'location_id' = p_location_id::text and t ->> 'instance_id' is not null;
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.response_id), '[]'::jsonb) from (
        select r.response_id, r.tenant_id, r.location_id, r.instance_id, r.item_id, r.response_bool,
               r.response_numeric, r.response_text, r.recorded_at, r.updated_at
          from api.operations_item_responses r
         where r.tenant_id = p_tenant_id and r.instance_id = any (coalesce(v_instance_ids, '{}'))
         order by r.response_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('operationsResponses',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('operationsResponses', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  return v_out;
end;
$$;

comment on function api.staff_dashboard(uuid, uuid, jsonb) is
  '0145 (DEBT-135): the Staff page''s read-only data batch in one RPC. Shared parts via one api.manager_dashboard (0144) call, staff-only parts read here; each the same api view / api function as the single read it replaces, as the caller (invoker, ADR 0008), with the same filters, order and row cap; per-part {"rows": [...]} or {"error": {code, message}}. Unknown part / bad input -> 22023.';

revoke all on function api.staff_dashboard(uuid, uuid, jsonb) from public, anon;
grant execute on function api.staff_dashboard(uuid, uuid, jsonb) to authenticated;

-- ROLLBACK (manual, if ever needed; revert the app first -- it depends on this function):
--   drop function api.staff_dashboard(uuid, uuid, jsonb);
