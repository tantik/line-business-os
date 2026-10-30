-- ============================================================================
-- 0144: api.manager_dashboard -- the Manager page's read-only data batch in
-- one RPC (DEBT-135).
--
-- WHY: every /manager page view ran a Promise.all of 28 list reads, each one
-- or more PostgREST requests (the staff list alone was 5: the roster plus four
-- "has protected history" reads; the history-type lists page in 1000-row
-- steps). With the page context (0143), my_access (0142) and the critical-
-- missed flag write that was ~35 Supabase requests per Manager view.
--
-- WHAT: one invoker-only function that runs the SAME reads -- the same api
-- views / api function, as the same caller, with exactly the same filters,
-- order and row limit as the TS lib function each part replaces -- and returns
--   { "<part>": {"rows": [...]} | {"error": {"code": <sqlstate>, "message": <sqlerrm>}}, ... }
-- Only the parts listed in p_params.parts are read and returned (module
-- gating stays in the app). Each part runs in its own exception block, so one
-- failing read becomes that part's error only (each popup fails independently,
-- as before). Row mapping, sorting and decryption stay in the app (same
-- mappers as the single reads); this function returns raw view columns.
--
--   part                       source                                 filter / order / cap
--   staff                      api.workforce_staff_manage             tenant; 1000 (+ protectedHistoryIds, see below)
--   lineLinks                  api.workforce_employee_line_links      tenant; 1000
--   shiftTypes                 api.workforce_shift_types              tenant; 1000
--   preferenceRequests         api.workforce_shift_requests           tenant, kind=preference, work_date >= preferenceFromDate; work_date, request_id; paged
--   assignments                api.workforce_shift_assignments        tenant, fromIso <= starts_at < toIsoExclusive; starts_at, assignment_id; paged
--   correctionRequests         api.workforce_shift_requests           tenant, kind=correction; work_date, request_id; paged
--   attendance                 api.workforce_attendance               tenant, attendanceFromDate <= work_date <= attendanceToDate; work_date desc, attendance_id; paged
--   invitations                api.workforce_employee_invitations     tenant; 1000
--   shiftExchanges             api.workforce_shift_exchanges          tenant, location; created_at desc, exchange_id; paged
--   exchangeAssignments        api.workforce_shift_assignments        tenant, exchangeFromIso <= starts_at < exchangeToIsoExclusive; paged
--   staffMessages              api.workforce_staff_messages           tenant; created_at, message_id; paged
--   inventoryItems             api.inventory_item_status              tenant, location (active + inactive); 1000
--   purchasesNeeded            api.purchases_needed                   tenant, location; 1000
--   purchaseHistory            api.purchase_history                   tenant, location; actioned_at desc, action_id; paged
--   purchasesAwaiting          api.purchases_awaiting_delivery        tenant, location; 1000
--   recipeCategories           api.workforce_recipe_categories        tenant; 1000
--   recipes                    api.workforce_recipes                  tenant; 1000
--   scheduleSettings           api.workforce_schedule_settings        tenant, location; 2 (app: maybeSingle)
--   recipeTitleTranslations    api.content_translations               tenant, workforce_recipe / title; translation_id; paged
--   myProfile                  api.workforce_my_staff_profile         tenant; 2 (app: maybeSingle)
--   operationsTemplates        api.operations_templates               tenant; 1000
--   operationsItems            api.operations_template_items          tenant; 1000
--   operationsSchedules        api.operations_schedules               tenant; 1000
--   operationsTodayTasks       api.operations_expected_tasks(today, today)  tenant; 1000
--   operationsOpenExceptions   api.operations_open_exceptions         tenant; created_at desc, exception_id; paged
--   issuesOpen                 api.issues_open                        tenant; created_at desc, issue_id; paged
--   issuesAll                  api.issues                             tenant; created_at desc, issue_id; paged
--   autoScheduleRuns           api.workforce_auto_schedule_runs       tenant, location; last_seen_at desc; 6
--
-- Row caps mirror what the single reads could return, since an RPC result is
-- NOT capped by PostgREST max_rows:
--   * "1000"  -- unpaged reads were silently capped at max_rows (1000); same cap.
--   * "paged" -- the app paged these (fetchAllRows, DEBT-114) and refused with
--     LBO_ROW_CAP at 20 full pages of 1000 rows; same rule here: 20000 rows or
--     more -> {"error": {"code": "LBO_ROW_CAP", ...}} for that part.
--   * staff.protectedHistoryIds -- distinct employee ids of the first 1000
--     rows (per source, unordered, as the app's unpaged reads saw them) of
--     workforce_shift_assignments / _attendance / _shift_requests /
--     _shift_exchanges (requester + replacement); a failing source counts as
--     empty, as the app ignored those read errors.
--   * operationsTodayTasks -- the tenant filter (the app filtered it after the
--     read) is applied before the 1000 cap here, so a multi-tenant caller can
--     no longer lose own-tenant rows to other tenants' rows in the cap.
--
-- p_params: {"parts": [...], "preferenceFromDate": date, "fromIso": timestamptz,
--   "toIsoExclusive": timestamptz, "exchangeFromIso": timestamptz,
--   "exchangeToIsoExclusive": timestamptz, "attendanceFromDate": date,
--   "attendanceToDate": date, "today": date}
-- A requested part's inputs are required. Unknown part, missing/invalid input,
-- null tenant/location -> 22023 for the whole call.
--
-- SECURITY MODEL: NOT SECURITY DEFINER (ADR 0008). Every part reads an
-- existing api view / calls an existing api function AS THE CALLER, so the
-- views' security_invoker RLS and the functions' own checks apply unchanged;
-- no core/workforce/... table is read directly and nothing is widened. The
-- tenant/location arguments are display narrowing only (as in the app), not
-- the boundary. `anon` gets no grant.
-- ============================================================================

create or replace function api.manager_dashboard(
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
  c_known_parts constant text[] := array[
    'staff', 'lineLinks', 'shiftTypes', 'preferenceRequests', 'assignments', 'correctionRequests',
    'attendance', 'invitations', 'shiftExchanges', 'exchangeAssignments', 'staffMessages',
    'inventoryItems', 'purchasesNeeded', 'purchaseHistory', 'purchasesAwaiting', 'recipeCategories',
    'recipes', 'scheduleSettings', 'recipeTitleTranslations', 'myProfile', 'operationsTemplates',
    'operationsItems', 'operationsSchedules', 'operationsTodayTasks', 'operationsOpenExceptions',
    'issuesOpen', 'issuesAll', 'autoScheduleRuns'];
  -- app: FETCH_ALL_PAGE_SIZE (1000) x FETCH_ALL_MAX_PAGES (20), PostgREST max_rows (1000)
  c_paged_cap constant int := 20000;
  c_max_rows constant int := 1000;
  c_cap_error constant jsonb := jsonb_build_object('error', jsonb_build_object(
    'code', 'LBO_ROW_CAP',
    'message', 'List read exceeds 20000 rows; refusing to return a partial list (DEBT-114).'));
  v_parts text[];
  v_unknown text;
  v_pref_from date;
  v_from timestamptz;
  v_to timestamptz;
  v_ex_from timestamptz;
  v_ex_to timestamptz;
  v_att_from date;
  v_att_to date;
  v_today date;
  v_rows jsonb;
  v_ids jsonb;
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
  select p into v_unknown from unnest(v_parts) p where not (p = any (c_known_parts)) limit 1;
  if v_unknown is not null then
    raise exception 'invalid_argument: unknown part %', v_unknown using errcode = '22023';
  end if;

  begin
    if 'preferenceRequests' = any (v_parts) then
      v_pref_from := (p_params ->> 'preferenceFromDate')::date;
      if v_pref_from is null then raise exception 'preferenceFromDate'; end if;
    end if;
    if 'assignments' = any (v_parts) then
      v_from := (p_params ->> 'fromIso')::timestamptz;
      v_to := (p_params ->> 'toIsoExclusive')::timestamptz;
      if v_from is null or v_to is null then raise exception 'fromIso/toIsoExclusive'; end if;
    end if;
    if 'exchangeAssignments' = any (v_parts) then
      v_ex_from := (p_params ->> 'exchangeFromIso')::timestamptz;
      v_ex_to := (p_params ->> 'exchangeToIsoExclusive')::timestamptz;
      if v_ex_from is null or v_ex_to is null then raise exception 'exchangeFromIso/exchangeToIsoExclusive'; end if;
    end if;
    if 'attendance' = any (v_parts) then
      v_att_from := (p_params ->> 'attendanceFromDate')::date;
      v_att_to := (p_params ->> 'attendanceToDate')::date;
      if v_att_from is null or v_att_to is null then raise exception 'attendanceFromDate/attendanceToDate'; end if;
    end if;
    if 'operationsTodayTasks' = any (v_parts) then
      v_today := (p_params ->> 'today')::date;
      if v_today is null then raise exception 'today'; end if;
    end if;
  exception when others then
    raise exception 'invalid_argument: missing or invalid date input (%)', sqlerrm using errcode = '22023';
  end;

  -- ---- staff (+ protected-history ids) -----------------------------------------------------
  if 'staff' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select s.staff_id, s.tenant_id, s.location_id, s.name_encrypted, s.name_hash, s.family_name_encrypted,
               s.given_name_encrypted, s.email_encrypted, s.email_hash, s.notes_encrypted, s.position_label,
               s.employment_type, s.is_active, s.created_at, s.updated_at, s.hourly_wage_yen,
               s.has_account_access, s.is_manager, s.is_admin
          from api.workforce_staff_manage s
         where s.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_ids := '[]'::jsonb;
      begin
        v_ids := v_ids || coalesce((select jsonb_agg(x.employee_id) from (
          select a.employee_id from api.workforce_shift_assignments a where a.tenant_id = p_tenant_id limit c_max_rows) x
          where x.employee_id is not null), '[]'::jsonb);
      exception when others then null;
      end;
      begin
        v_ids := v_ids || coalesce((select jsonb_agg(x.employee_id) from (
          select a.employee_id from api.workforce_attendance a where a.tenant_id = p_tenant_id limit c_max_rows) x
          where x.employee_id is not null), '[]'::jsonb);
      exception when others then null;
      end;
      begin
        v_ids := v_ids || coalesce((select jsonb_agg(x.employee_id) from (
          select r.employee_id from api.workforce_shift_requests r where r.tenant_id = p_tenant_id limit c_max_rows) x
          where x.employee_id is not null), '[]'::jsonb);
      exception when others then null;
      end;
      begin
        v_ids := v_ids || coalesce((select jsonb_agg(i.id) from (
          select e.requester_employee_id, e.replacement_employee_id
            from api.workforce_shift_exchanges e where e.tenant_id = p_tenant_id limit c_max_rows) x
          cross join lateral (values (x.requester_employee_id), (x.replacement_employee_id)) as i(id)
          where i.id is not null), '[]'::jsonb);
      exception when others then null;
      end;
      v_ids := coalesce((select jsonb_agg(distinct i) from jsonb_array_elements(v_ids) i), '[]'::jsonb);
      v_out := v_out || jsonb_build_object('staff', jsonb_build_object('rows', v_rows, 'protectedHistoryIds', v_ids));
    exception when others then
      v_out := v_out || jsonb_build_object('staff', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- lineLinks ---------------------------------------------------------------------------
  if 'lineLinks' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select l.link_id, l.tenant_id, l.employee_id, l.is_active, l.linked_at, l.created_at, l.updated_at
          from api.workforce_employee_line_links l
         where l.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('lineLinks', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('lineLinks', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- shiftTypes --------------------------------------------------------------------------
  if 'shiftTypes' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select t.shift_type_id, t.tenant_id, t.location_id, t.code, t.label_ja, t.label_en, t.starts_at_local,
               t.ends_at_local, t.break_minutes, t.is_custom, t.sort_order, t.is_active
          from api.workforce_shift_types t
         where t.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('shiftTypes', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('shiftTypes', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- preferenceRequests ------------------------------------------------------------------
  if 'preferenceRequests' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date, x.request_id), '[]'::jsonb) from (
        select r.request_id, r.tenant_id, r.location_id, r.employee_id, r.shift_id, r.shift_type_id, r.work_date,
               r.kind, r.is_unavailable, r.status, r.details, r.attendance_id, r.created_at, r.updated_at
          from api.workforce_shift_requests r
         where r.tenant_id = p_tenant_id and r.kind = 'preference' and r.work_date >= v_pref_from
         order by r.work_date, r.request_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('preferenceRequests',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('preferenceRequests', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- assignments -------------------------------------------------------------------------
  if 'assignments' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at, x.assignment_id), '[]'::jsonb) from (
        select a.assignment_id, a.tenant_id, a.location_id, a.employee_id, a.shift_type_id, a.starts_at, a.ends_at,
               a.break_minutes, a.role, a.notes, a.published, a.created_at, a.updated_at
          from api.workforce_shift_assignments a
         where a.tenant_id = p_tenant_id and a.starts_at >= v_from and a.starts_at < v_to
         order by a.starts_at, a.assignment_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('assignments',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('assignments', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- correctionRequests ------------------------------------------------------------------
  if 'correctionRequests' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date, x.request_id), '[]'::jsonb) from (
        select r.request_id, r.tenant_id, r.location_id, r.employee_id, r.shift_id, r.shift_type_id, r.work_date,
               r.kind, r.is_unavailable, r.status, r.details, r.attendance_id, r.created_at, r.updated_at
          from api.workforce_shift_requests r
         where r.tenant_id = p_tenant_id and r.kind = 'correction'
         order by r.work_date, r.request_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('correctionRequests',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('correctionRequests', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- attendance --------------------------------------------------------------------------
  if 'attendance' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.work_date desc, x.attendance_id), '[]'::jsonb) from (
        select a.attendance_id, a.tenant_id, a.location_id, a.employee_id, a.shift_id, a.work_date, a.clock_in,
               a.clock_out, a.actual_break_minutes, a.status, a.transportation_cost, a.daily_message, a.created_at,
               a.updated_at
          from api.workforce_attendance a
         where a.tenant_id = p_tenant_id and a.work_date >= v_att_from and a.work_date <= v_att_to
         order by a.work_date desc, a.attendance_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('attendance',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('attendance', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- invitations -------------------------------------------------------------------------
  if 'invitations' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select i.invitation_id, i.tenant_id, i.employee_id, i.status, i.created_at, i.updated_at, i.expires_at,
               i.accepted_at, i.revoked_at
          from api.workforce_employee_invitations i
         where i.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('invitations', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('invitations', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- shiftExchanges ----------------------------------------------------------------------
  if 'shiftExchanges' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.exchange_id), '[]'::jsonb) from (
        select e.exchange_id, e.tenant_id, e.location_id, e.shift_id, e.requester_employee_id,
               e.replacement_employee_id, e.reason, e.status, e.accepted_at, e.decided_at, e.created_at,
               e.updated_at, e.request_kind, e.requested_shift_type_id
          from api.workforce_shift_exchanges e
         where e.tenant_id = p_tenant_id and e.location_id = p_location_id
         order by e.created_at desc, e.exchange_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('shiftExchanges',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('shiftExchanges', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- exchangeAssignments -----------------------------------------------------------------
  if 'exchangeAssignments' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at, x.assignment_id), '[]'::jsonb) from (
        select a.assignment_id, a.tenant_id, a.location_id, a.employee_id, a.shift_type_id, a.starts_at, a.ends_at,
               a.break_minutes, a.role, a.notes, a.published, a.created_at, a.updated_at
          from api.workforce_shift_assignments a
         where a.tenant_id = p_tenant_id and a.starts_at >= v_ex_from and a.starts_at < v_ex_to
         order by a.starts_at, a.assignment_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('exchangeAssignments',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('exchangeAssignments', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- staffMessages -----------------------------------------------------------------------
  if 'staffMessages' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at, x.message_id), '[]'::jsonb) from (
        select m.message_id, m.tenant_id, m.location_id, m.employee_id, m.sender_role, m.sender_user_id, m.body,
               m.is_read, m.read_at, m.read_by, m.archived_at, m.deleted_at, m.created_at, m.updated_at
          from api.workforce_staff_messages m
         where m.tenant_id = p_tenant_id
         order by m.created_at, m.message_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('staffMessages',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('staffMessages', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- inventoryItems (includeInactive: true) ----------------------------------------------
  if 'inventoryItems' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select i.item_id, i.tenant_id, i.location_id, i.name, i.unit, i.required_quantity, i.reorder_point,
               i.sort_order, i.is_active, i.actual_quantity, i.counted_at, i.counted_by_staff_id,
               i.shortage_quantity, i.status, i.media_path
          from api.inventory_item_status i
         where i.tenant_id = p_tenant_id and i.location_id = p_location_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('inventoryItems', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('inventoryItems', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- purchasesNeeded ---------------------------------------------------------------------
  if 'purchasesNeeded' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select n.item_id, n.tenant_id, n.location_id, n.name, n.unit, n.required_quantity, n.reorder_point,
               n.actual_quantity, n.shortage_quantity, n.latest_stock_count_id, n.purchase_status, n.actioned_at,
               n.actioned_by_staff_id, n.ordered_quantity, n.received_quantity
          from api.purchases_needed n
         where n.tenant_id = p_tenant_id and n.location_id = p_location_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('purchasesNeeded', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('purchasesNeeded', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- purchaseHistory ---------------------------------------------------------------------
  if 'purchaseHistory' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.actioned_at desc, x.action_id), '[]'::jsonb) from (
        select h.action_id, h.tenant_id, h.location_id, h.item_id, h.item_name, h.unit, h.action_type,
               h.ordered_quantity, h.received_quantity, h.actioned_at, h.actioned_by_staff_id
          from api.purchase_history h
         where h.tenant_id = p_tenant_id and h.location_id = p_location_id
         order by h.actioned_at desc, h.action_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('purchaseHistory',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('purchaseHistory', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- purchasesAwaiting -------------------------------------------------------------------
  if 'purchasesAwaiting' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select w.item_id, w.tenant_id, w.location_id, w.name, w.unit, w.required_quantity, w.reorder_point,
               w.actual_quantity, w.shortage_quantity, w.is_short, w.latest_stock_count_id, w.order_action_id,
               w.ordered_quantity, w.received_since_order_quantity, w.open_order_quantity, w.ordered_at,
               w.ordered_by_staff_id
          from api.purchases_awaiting_delivery w
         where w.tenant_id = p_tenant_id and w.location_id = p_location_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('purchasesAwaiting', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('purchasesAwaiting', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- recipeCategories --------------------------------------------------------------------
  if 'recipeCategories' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select c.category_id, c.tenant_id, c.label_ja, c.label_en, c.sort_order, c.is_active
          from api.workforce_recipe_categories c
         where c.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('recipeCategories', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('recipeCategories', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- recipes -----------------------------------------------------------------------------
  if 'recipes' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select r.recipe_id, r.tenant_id, r.location_id, r.recipe_category_id, r.title_ja, r.title_en,
               r.description_ja, r.description_en, r.content_kind, r.is_popular, r.status, r.created_at,
               r.updated_at, r.media_path, r.original_language
          from api.workforce_recipes r
         where r.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('recipes', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('recipes', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- scheduleSettings (app: maybeSingle -> 2 rows are enough to detect "more than one") --
  if 'scheduleSettings' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select s.tenant_id, s.location_id, s.required_headcount_by_weekday, s.max_monthly_hours, s.max_weekly_hours,
               s.max_days_per_week, s.auto_create_day_of_month, s.auto_create_enabled,
               s.auto_create_last_generated_month
          from api.workforce_schedule_settings s
         where s.tenant_id = p_tenant_id and s.location_id = p_location_id
         limit 2) x);
      v_out := v_out || jsonb_build_object('scheduleSettings', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('scheduleSettings', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- recipeTitleTranslations -------------------------------------------------------------
  if 'recipeTitleTranslations' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.translation_id), '[]'::jsonb) from (
        select t.translation_id, t.tenant_id, t.source_entity_type, t.source_entity_id, t.source_field,
               t.source_language, t.target_language, t.translated_text, t.translation_status,
               t.translation_provider, t.source_content_hash, t.machine_generated, t.reviewed_at, t.translated_at,
               t.updated_at
          from api.content_translations t
         where t.tenant_id = p_tenant_id and t.source_entity_type = 'workforce_recipe' and t.source_field = 'title'
         order by t.translation_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('recipeTitleTranslations',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('recipeTitleTranslations', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- myProfile (app: maybeSingle) --------------------------------------------------------
  if 'myProfile' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select p.staff_id, p.tenant_id, p.location_id, p.position_label, p.employment_type, p.is_active,
               p.created_at, p.hourly_wage_yen
          from api.workforce_my_staff_profile p
         where p.tenant_id = p_tenant_id
         limit 2) x);
      v_out := v_out || jsonb_build_object('myProfile', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('myProfile', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsTemplates -----------------------------------------------------------------
  if 'operationsTemplates' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select t.template_id, t.tenant_id, t.location_id, t.name, t.category, t.description, t.is_active,
               t.created_at, t.updated_at
          from api.operations_templates t
         where t.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('operationsTemplates', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('operationsTemplates', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsItems ---------------------------------------------------------------------
  if 'operationsItems' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select i.item_id, i.tenant_id, i.template_id, i.label, i.response_type, i.is_critical, i.is_required,
               i.is_active, i.numeric_min, i.numeric_max, i.numeric_unit, i.sort_order, i.created_at, i.updated_at
          from api.operations_template_items i
         where i.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('operationsItems', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('operationsItems', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsSchedules -----------------------------------------------------------------
  if 'operationsSchedules' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select s.schedule_id, s.tenant_id, s.location_id, s.template_id, s.schedule_group_id, s.recurrence_kind,
               s.weekdays, s.due_time, s.window_end_time, s.effective_from, s.effective_to, s.is_active,
               s.created_at, s.updated_at
          from api.operations_schedules s
         where s.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('operationsSchedules', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('operationsSchedules', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsTodayTasks ----------------------------------------------------------------
  if 'operationsTodayTasks' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
        select t.*
          from api.operations_expected_tasks(v_today, v_today) t
         where t.tenant_id = p_tenant_id
         limit c_max_rows) x);
      v_out := v_out || jsonb_build_object('operationsTodayTasks', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('operationsTodayTasks', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- operationsOpenExceptions ------------------------------------------------------------
  if 'operationsOpenExceptions' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.exception_id), '[]'::jsonb) from (
        select e.exception_id, e.tenant_id, e.location_id, e.instance_id, e.schedule_id, e.business_date,
               e.item_id, e.severity, e.source, e.note, e.created_at, e.template_name
          from api.operations_open_exceptions e
         where e.tenant_id = p_tenant_id
         order by e.created_at desc, e.exception_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('operationsOpenExceptions',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('operationsOpenExceptions', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- issuesOpen --------------------------------------------------------------------------
  if 'issuesOpen' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.issue_id), '[]'::jsonb) from (
        select i.issue_id, i.tenant_id, i.location_id, i.kind, i.category, i.severity, i.status, i.note,
               i.business_date, i.reported_by, i.reported_by_role, i.acknowledged_by, i.acknowledged_at, i.source,
               i.operations_exception_id, i.created_at, i.updated_at, i.reporter_employee_id
          from api.issues_open i
         where i.tenant_id = p_tenant_id
         order by i.created_at desc, i.issue_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('issuesOpen',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('issuesOpen', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- issuesAll ---------------------------------------------------------------------------
  if 'issuesAll' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.issue_id), '[]'::jsonb) from (
        select i.issue_id, i.tenant_id, i.location_id, i.kind, i.category, i.severity, i.status, i.note,
               i.business_date, i.reported_by, i.reported_by_role, i.acknowledged_by, i.acknowledged_at,
               i.resolved_by, i.resolved_at, i.resolution_note, i.source, i.operations_exception_id, i.created_at,
               i.updated_at, i.reporter_employee_id
          from api.issues i
         where i.tenant_id = p_tenant_id
         order by i.created_at desc, i.issue_id
         limit c_paged_cap) x);
      v_out := v_out || jsonb_build_object('issuesAll',
        case when jsonb_array_length(v_rows) >= c_paged_cap then c_cap_error else jsonb_build_object('rows', v_rows) end);
    exception when others then
      v_out := v_out || jsonb_build_object('issuesAll', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  -- ---- autoScheduleRuns (newest 6) ---------------------------------------------------------
  if 'autoScheduleRuns' = any (v_parts) then
    begin
      v_rows := (select coalesce(jsonb_agg(to_jsonb(x) order by x.last_seen_at desc), '[]'::jsonb) from (
        select r.run_id, r.target_month, r.outcome, r.created_count, r.shortage_count, r.error_code,
               r.attempt_count, r.last_seen_at
          from api.workforce_auto_schedule_runs r
         where r.tenant_id = p_tenant_id and r.location_id = p_location_id
         order by r.last_seen_at desc
         limit 6) x);
      v_out := v_out || jsonb_build_object('autoScheduleRuns', jsonb_build_object('rows', v_rows));
    exception when others then
      v_out := v_out || jsonb_build_object('autoScheduleRuns', jsonb_build_object('error', jsonb_build_object('code', sqlstate, 'message', sqlerrm)));
    end;
  end if;

  return v_out;
end;
$$;

comment on function api.manager_dashboard(uuid, uuid, jsonb) is
  '0144 (DEBT-135): the Manager page''s read-only data batch in one RPC. Each requested part reads the same api view / api function as the single read it replaces, as the caller (invoker, ADR 0008), with the same filters, order and row cap; per-part {"rows": [...]} or {"error": {code, message}}. Unknown part / bad input -> 22023.';

revoke all on function api.manager_dashboard(uuid, uuid, jsonb) from public, anon;
grant execute on function api.manager_dashboard(uuid, uuid, jsonb) to authenticated;

-- ROLLBACK (manual, if ever needed; revert the app first -- it depends on this function):
--   drop function api.manager_dashboard(uuid, uuid, jsonb);
